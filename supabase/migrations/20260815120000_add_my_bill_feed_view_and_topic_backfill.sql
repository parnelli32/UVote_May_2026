/*
  # Add my_bill_feed view and backfill bills.topic

  1. Why
    `HomeTab.tsx` and `AdminPage.tsx`'s bill lists fetch every bill matching
    the current body/status in one unbounded query, then filter/sort entirely
    in the browser. Supabase silently truncates any single query at 1,000
    rows (`api.max_rows`) — PA House alone already has 2,524 active bills, so
    up to 1,524 of them are missing from the feed today with no error and no
    indication. This migration adds the server-side primitives the paginated
    rewrite of those pages needs: a view that carries vote tallies and the
    calling user's own vote/majority-match status per bill (so "voted" /
    "not voted" / "matched majority" become real filterable columns instead
    of requiring every bill to be fetched first), plus a one-time backfill of
    `bills.topic` so the topic filter can move from the client-side
    `getTopicTag()` heuristic to filtering on the stored column directly.

  2. Changes
    - Backfill `bills.topic` for every row where it's currently NULL, using
      the same keyword-matching heuristic as `TOPIC_RULES` in
      `src/lib/billUtils.ts` (`getTopicTag`), evaluated in the same order so
      the result matches what the client would already show. Falls back to
      'Other', matching the client default. One-time backfill only — this
      migration does not add a trigger to keep future null-topic bills in
      sync; a bill inserted without a topic (the admin form's Topic field is
      optional) will simply not match any topic filter until an admin sets
      one, exactly as it already wouldn't be reliably categorized today.
    - `my_bill_feed`: a view over `bills` that adds:
      - `support_count` / `oppose_count` / `total_votes` / `support_pct` —
        the same aggregate `bill_vote_tallies` already exposes, joined in
        directly so sort-by-most-votes/highest-support can be a real
        `.order()` on the view instead of a separate query plus client sort.
      - `effective_sort_date` — `COALESCE(introduced_date, created_at::date)`,
        so "newest"/"oldest" sort can be a real `.order()` matching the
        client's previous `introduced_date ?? created_at` fallback.
      - `my_vote` — the calling user's own vote on that bill, or NULL.
      - `matched_district_majority` — whether `my_vote` matches the support/
        oppose majority among the caller's own district (same body as the
        bill), among users who also voted on it. NULL (not just false) when
        the caller hasn't voted, or the district doesn't yet meet the
        >=2-votes/not-tied threshold — mirrors the qualification logic
        `my_district_bill_tallies`/`district_score` already use, so "matched
        majority" means the same thing everywhere in the app.
      Every bill/vote join in this view is filtered to `auth.uid()`
      specifically (never a client-supplied user id) — as a plain view it
      runs with the view owner's privileges rather than the querying role's
      RLS grants (see `20260602020500_tighten_user_votes_select_policy.sql`),
      so that explicit `auth.uid()` filter is the only thing standing between
      this view and leaking other users' individual votes. Granted to
      `authenticated` only, matching the fact that the Bills feed (the only
      consumer) is itself only reachable signed in.

  3. Notes
    - Status/committee-report gating (`isBillVotable`) is intentionally NOT
      baked into this view — it depends on `legislative_bodies.requires_committee_report`,
      which the caller already has client-side via `currentBody` (see
      `DashboardTab.tsx`'s identical conditional-`.not(...)`-chaining pattern).
      Call sites append `.not('reported_from_committee_at', 'is', null)`
      themselves when the selected body requires it, rather than this view
      guessing at a body the caller already knows.
    - `matched_district_majority`'s per-row correlated subquery is the same
      cost shape as `member_bill_tallies`, scaled to one bill/one district at
      a time instead of an arbitrary bill/member-id-array batch — acceptable
      here because pagination (`.range()`) keeps each query to a page's worth
      of rows (tens, not thousands), not the full unbounded feed this
      migration exists to stop fetching.
*/

-- ─── Backfill bills.topic ──────────────────────────────────────────────────
UPDATE bills
SET topic = CASE
  WHEN title || ' ' || COALESCE(summary, '') ~* 'housing|rent|landlord'                 THEN 'Housing'
  WHEN title || ' ' || COALESCE(summary, '') ~* 'safety|police|crime|light'              THEN 'Public Safety'
  WHEN title || ' ' || COALESCE(summary, '') ~* 'school|education|student'               THEN 'Education'
  WHEN title || ' ' || COALESCE(summary, '') ~* 'budget|fund|tax|spend'                  THEN 'Budget'
  WHEN title || ' ' || COALESCE(summary, '') ~* 'transit|transportation|bus|rail|bike'   THEN 'Transportation'
  WHEN title || ' ' || COALESCE(summary, '') ~* 'road|infrastructure|sewer|bridge'       THEN 'Infrastructure'
  WHEN title || ' ' || COALESCE(summary, '') ~* 'health|hospital|medical|drug'           THEN 'Health'
  WHEN title || ' ' || COALESCE(summary, '') ~* 'environment|climate|pollution|green'    THEN 'Environment'
  WHEN title || ' ' || COALESCE(summary, '') ~* 'economic|business|commerce|job|employ'  THEN 'Economic Development'
  WHEN title || ' ' || COALESCE(summary, '') ~* 'government|council|ordinance|zoning'    THEN 'Government Operations'
  ELSE 'Other'
END
WHERE topic IS NULL;

-- ─── my_bill_feed: bills + tallies + caller's own vote/majority-match ─────
CREATE OR REPLACE VIEW my_bill_feed AS
SELECT
  b.*,
  COALESCE(tally.support_count, 0)::int AS support_count,
  COALESCE(tally.oppose_count, 0)::int AS oppose_count,
  COALESCE(tally.total_votes, 0)::int AS total_votes,
  CASE WHEN COALESCE(tally.total_votes, 0) > 0
    THEN ROUND(100.0 * tally.support_count / tally.total_votes, 2)
    ELSE -1
  END AS support_pct,
  COALESCE(b.introduced_date::timestamptz, b.created_at) AS effective_sort_date,
  my_vote.vote AS my_vote,
  CASE
    WHEN my_vote.vote IS NULL THEN NULL
    WHEN district_tally.support_count IS NULL THEN NULL
    WHEN district_tally.support_count + district_tally.oppose_count < 2 THEN NULL
    WHEN district_tally.support_count = district_tally.oppose_count THEN NULL
    WHEN district_tally.support_count > district_tally.oppose_count THEN (my_vote.vote = 'support')
    ELSE (my_vote.vote = 'oppose')
  END AS matched_district_majority
FROM bills b
LEFT JOIN bill_vote_tallies tally ON tally.bill_id = b.bill_id
LEFT JOIN user_votes my_vote ON my_vote.bill_id = b.bill_id AND my_vote.user_id = auth.uid()
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE uv.vote = 'support') AS support_count,
    COUNT(*) FILTER (WHERE uv.vote = 'oppose') AS oppose_count
  FROM user_votes uv
  JOIN user_districts my_ud
    ON my_ud.user_id = auth.uid() AND my_ud.legislative_body_id = b.legislative_body_id
  JOIN user_districts voter_ud
    ON voter_ud.user_id = uv.user_id
    AND voter_ud.legislative_body_id = b.legislative_body_id
    AND voter_ud.district_id = my_ud.district_id
  WHERE uv.bill_id = b.bill_id
) district_tally ON true;

GRANT SELECT ON my_bill_feed TO authenticated;
