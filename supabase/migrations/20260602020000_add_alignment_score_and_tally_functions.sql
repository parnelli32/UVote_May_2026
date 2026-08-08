/*
  # Add alignment score and vote-tally SQL functions

  1. Changes
    - Add `member_bill_tallies(bill_ids, member_ids)`: internal SECURITY DEFINER
      helper that aggregates support/oppose counts from `user_votes` for a given
      set of bills, optionally restricted to a given set of member user_ids.
      NOT exposed to PostgREST (EXECUTE revoked from PUBLIC) — it takes an
      arbitrary member_id array, so exposing it directly would let any client
      pass a small/single-user array and de-anonymize individual votes, which
      is exactly the exposure this migration and the RLS policy change in the
      following migration are meant to close. Every public entry point below
      resolves its membership set server-side (from a district/rep/the caller's
      own auth.uid()) instead of accepting a raw member_id array from the client.
    - Add `rep_district_member_ids(representative_id)`: internal helper that
      resolves a representative's constituent user_ids (their own district, or
      every district in their legislative body for at-large reps). Not exposed.
    - Add `rep_alignment_score(representative_id, member_ids, min_votes_per_bill,
      min_qualifying_bills)`: internal helper computing "how often did this
      rep's votes match the majority position of a given member set", with
      configurable per-bill and aggregate thresholds. Not exposed directly;
      `constituent_score` and `city_constituent_score` below are its two
      canonical public callers, replacing what were previously two
      independently hand-written implementations each (RepProfilePage.tsx,
      DashboardTab.tsx).
    - Add `constituent_score(representative_id)`: PUBLIC RPC — rep vs. their
      own district's (or at-large body's) majority. Per-bill threshold >=2
      votes and not tied; aggregate threshold >=2 qualifying bills. Excludes
      bills passed by suspension of rules (no individual votes were recorded
      for those).
    - Add `city_constituent_score(representative_id)`: PUBLIC RPC — the same
      rep-vs-majority computation, scoped city-wide instead of to one
      district. Per-bill threshold >=10 votes (this is the pre-existing,
      intentionally higher, city-wide threshold — see RepProfilePage.tsx's
      former client-side implementation); aggregate threshold >=2.
    - Add `district_score()`: PUBLIC RPC — the calling user vs. their own
      district's majority, restricted to bills their own representative also
      voted on (a deliberate existing restriction, not new). Per-bill
      threshold >=2/not tied; aggregate threshold >=1 qualifying bill. Uses
      auth.uid() internally rather than taking a user_id parameter, so a
      caller can only ever compute their own score.
    - Add `representation_score(representative_id)`: PUBLIC RPC — the calling
      user vs. a given representative's votes, matched/mismatched over every
      bill both voted on. No minimum-vote threshold (matches all three
      pre-existing client implementations, none of which gated this score —
      see the architecture report's Section 2 finding on this). Uses
      auth.uid() internally.
    - Add `rep_district_bill_history(representative_id)`: PUBLIC RPC — per-bill
      district support/oppose counts and qualification for every (non-
      suspended) bill a rep voted on. Powers the "Bill History" list on
      RepProfilePage/RepBillHistoryPage, which needs per-bill district tallies,
      not just the rolled-up score.
    - Add `my_district_bill_tallies(bill_ids)`: PUBLIC RPC — per-bill
      support/oppose counts among the calling user's own district, for an
      arbitrary caller-supplied bill_id list. Safe despite the arbitrary
      bill_id list because the *membership* set is always "my own district",
      resolved server-side from auth.uid() — never a client-supplied user_id
      array. Powers the "matched majority" bill filter (HomeTab) and the
      per-vote district-majority badge (UserProfilePage, UserVotingHistoryPage).
    - Add `user_votes_total_count()`: PUBLIC RPC — total row count of
      `user_votes`, for the admin dashboard's "Votes cast" stat, which
      previously relied on the broad SELECT policy being tightened in the
      next migration.

  2. Notes
    - All functions are SECURITY DEFINER with `search_path = public` pinned
      (standard hardening against search_path hijacking). Being SECURITY
      DEFINER means they run with the privileges of their owner (the migration
      role), so they see all of `user_votes` regardless of the calling role's
      RLS grants — the same mechanism the pre-existing `bill_vote_tallies`
      view already relies on for its anon-readable aggregate counts.
    - This migration only adds functions; it does not change any table or
      policy. The `user_votes` SELECT policy is tightened in the following
      migration, once these functions exist to replace the client-side
      cross-user reads that policy previously enabled.
    - `member_bill_tallies` and `rep_district_bill_history`/`my_district_bill_tallies`
      are intentionally generic over an arbitrary bill_id list and a
      server-resolved member set — this is the shared shape a future
      "voting block" position tally (support/oppose among an arbitrary
      membership set, not just a district) can extend, by adding a
      `block_bill_tallies(block_id, bill_ids)`-style entry point that
      resolves membership from `voting_block_members` and calls
      `member_bill_tallies` the same way `rep_district_bill_history` and
      `my_district_bill_tallies` do.
*/

-- ─── member_bill_tallies: internal aggregation primitive, NOT exposed ──────
CREATE OR REPLACE FUNCTION member_bill_tallies(p_bill_ids uuid[], p_member_ids uuid[])
RETURNS TABLE (bill_id uuid, support_count bigint, oppose_count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    uv.bill_id,
    COUNT(*) FILTER (WHERE uv.vote = 'support') AS support_count,
    COUNT(*) FILTER (WHERE uv.vote = 'oppose') AS oppose_count
  FROM user_votes uv
  WHERE uv.bill_id = ANY(p_bill_ids)
    AND (p_member_ids IS NULL OR uv.user_id = ANY(p_member_ids))
  GROUP BY uv.bill_id;
$$;

REVOKE EXECUTE ON FUNCTION member_bill_tallies(uuid[], uuid[]) FROM PUBLIC;

-- ─── rep_district_member_ids: internal helper, NOT exposed ────────────────
CREATE OR REPLACE FUNCTION rep_district_member_ids(p_representative_id uuid)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT u.user_id
  FROM representatives r
  JOIN users u ON (
    (r.district_id IS NOT NULL AND u.district_id = r.district_id)
    OR (
      r.district_id IS NULL AND u.district_id IN (
        SELECT d.district_id FROM districts d WHERE d.legislative_body_id = r.legislative_body_id
      )
    )
  )
  WHERE r.representative_id = p_representative_id;
$$;

REVOKE EXECUTE ON FUNCTION rep_district_member_ids(uuid) FROM PUBLIC;

-- ─── rep_alignment_score: internal canonical rep-vs-majority scorer ───────
CREATE OR REPLACE FUNCTION rep_alignment_score(
  p_representative_id uuid,
  p_member_ids uuid[],
  p_min_votes_per_bill integer,
  p_min_qualifying_bills integer
)
RETURNS TABLE (score integer, qualifying_bills integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH rep_bills AS (
    SELECT rv.bill_id, rv.vote
    FROM rep_votes rv
    JOIN bills b ON b.bill_id = rv.bill_id
    WHERE rv.representative_id = p_representative_id
      AND NOT COALESCE(b.passed_by_suspension, false)
  ),
  tallies AS (
    SELECT mt.bill_id, mt.support_count, mt.oppose_count
    FROM member_bill_tallies(
      (SELECT array_agg(bill_id) FROM rep_bills),
      p_member_ids
    ) mt
  ),
  qualifying AS (
    SELECT rb.vote AS rep_vote, (t.support_count > t.oppose_count) AS majority_is_support
    FROM rep_bills rb
    JOIN tallies t ON t.bill_id = rb.bill_id
    WHERE t.support_count + t.oppose_count >= p_min_votes_per_bill
      AND t.support_count <> t.oppose_count
  )
  SELECT
    CASE WHEN COUNT(*) >= p_min_qualifying_bills THEN
      ROUND(100.0 * COUNT(*) FILTER (
        WHERE (rep_vote = 'support' AND majority_is_support)
           OR (rep_vote = 'oppose' AND NOT majority_is_support)
      ) / COUNT(*))::int
    ELSE NULL END AS score,
    CASE WHEN COUNT(*) >= p_min_qualifying_bills THEN COUNT(*)::int ELSE NULL END AS qualifying_bills
  FROM qualifying;
$$;

REVOKE EXECUTE ON FUNCTION rep_alignment_score(uuid, uuid[], integer, integer) FROM PUBLIC;

-- ─── constituent_score: PUBLIC — rep vs. own district/at-large body ───────
CREATE OR REPLACE FUNCTION constituent_score(p_representative_id uuid)
RETURNS TABLE (score integer, qualifying_bills integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT * FROM rep_alignment_score(
    p_representative_id,
    COALESCE((SELECT array_agg(user_id) FROM rep_district_member_ids(p_representative_id)), '{}'::uuid[]),
    2,
    2
  );
$$;

REVOKE EXECUTE ON FUNCTION constituent_score(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION constituent_score(uuid) TO authenticated;

-- ─── city_constituent_score: PUBLIC — rep vs. all UVote users city-wide ───
CREATE OR REPLACE FUNCTION city_constituent_score(p_representative_id uuid)
RETURNS TABLE (score integer, qualifying_bills integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT * FROM rep_alignment_score(p_representative_id, NULL, 10, 2);
$$;

REVOKE EXECUTE ON FUNCTION city_constituent_score(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION city_constituent_score(uuid) TO authenticated;

-- ─── district_score: PUBLIC — caller vs. own district's majority ──────────
CREATE OR REPLACE FUNCTION district_score()
RETURNS TABLE (score integer, qualifying_bills integer, matched_bills integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH me AS (
    SELECT district_id FROM users WHERE user_id = auth.uid()
  ),
  my_district_rep_bills AS (
    SELECT rv.bill_id, rv.vote
    FROM rep_votes rv
    JOIN representatives r ON r.representative_id = rv.representative_id
    JOIN me ON r.district_id = me.district_id
  ),
  my_votes AS (
    SELECT uv.bill_id, uv.vote
    FROM user_votes uv
    JOIN my_district_rep_bills rb ON rb.bill_id = uv.bill_id
    WHERE uv.user_id = auth.uid()
  ),
  district_members AS (
    SELECT u.user_id FROM users u, me WHERE u.district_id = me.district_id
  ),
  tallies AS (
    SELECT mt.bill_id, mt.support_count, mt.oppose_count
    FROM member_bill_tallies(
      (SELECT array_agg(bill_id) FROM my_votes),
      COALESCE((SELECT array_agg(user_id) FROM district_members), '{}'::uuid[])
    ) mt
  ),
  qualifying AS (
    SELECT mv.vote AS my_vote, (t.support_count > t.oppose_count) AS majority_is_support
    FROM my_votes mv
    JOIN tallies t ON t.bill_id = mv.bill_id
    WHERE t.support_count + t.oppose_count >= 2
      AND t.support_count <> t.oppose_count
  )
  SELECT
    CASE WHEN COUNT(*) >= 1 THEN
      ROUND(100.0 * COUNT(*) FILTER (
        WHERE (my_vote = 'support' AND majority_is_support)
           OR (my_vote = 'oppose' AND NOT majority_is_support)
      ) / COUNT(*))::int
    ELSE NULL END AS score,
    CASE WHEN COUNT(*) >= 1 THEN COUNT(*)::int ELSE NULL END AS qualifying_bills,
    CASE WHEN COUNT(*) >= 1 THEN COUNT(*) FILTER (
      WHERE (my_vote = 'support' AND majority_is_support)
         OR (my_vote = 'oppose' AND NOT majority_is_support)
    )::int ELSE NULL END AS matched_bills
  FROM qualifying;
$$;

REVOKE EXECUTE ON FUNCTION district_score() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION district_score() TO authenticated;

-- ─── representation_score: PUBLIC — caller vs. a given representative ─────
CREATE OR REPLACE FUNCTION representation_score(p_representative_id uuid)
RETURNS TABLE (score integer, total integer, matched integer, mismatched integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH rep_bill_votes AS (
    SELECT bill_id, vote FROM rep_votes WHERE representative_id = p_representative_id
  ),
  compared AS (
    SELECT (uv.vote = rb.vote) AS is_match
    FROM user_votes uv
    JOIN rep_bill_votes rb ON rb.bill_id = uv.bill_id
    WHERE uv.user_id = auth.uid()
  )
  SELECT
    CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE is_match) / COUNT(*))::int ELSE NULL END,
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE is_match)::int,
    COUNT(*) FILTER (WHERE NOT is_match)::int
  FROM compared;
$$;

REVOKE EXECUTE ON FUNCTION representation_score(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION representation_score(uuid) TO authenticated;

-- ─── rep_district_bill_history: PUBLIC — per-bill district tallies ────────
CREATE OR REPLACE FUNCTION rep_district_bill_history(p_representative_id uuid)
RETURNS TABLE (
  bill_id uuid,
  rep_vote text,
  district_support integer,
  district_oppose integer,
  qualifies_for_score boolean,
  district_majority text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH rep_bills AS (
    SELECT rv.bill_id, rv.vote
    FROM rep_votes rv
    JOIN bills b ON b.bill_id = rv.bill_id
    WHERE rv.representative_id = p_representative_id
      AND NOT COALESCE(b.passed_by_suspension, false)
  ),
  tallies AS (
    SELECT mt.bill_id, mt.support_count, mt.oppose_count
    FROM member_bill_tallies(
      (SELECT array_agg(bill_id) FROM rep_bills),
      COALESCE((SELECT array_agg(user_id) FROM rep_district_member_ids(p_representative_id)), '{}'::uuid[])
    ) mt
  )
  SELECT
    rb.bill_id,
    rb.vote,
    COALESCE(t.support_count, 0)::int,
    COALESCE(t.oppose_count, 0)::int,
    (COALESCE(t.support_count, 0) + COALESCE(t.oppose_count, 0) >= 2 AND COALESCE(t.support_count, 0) <> COALESCE(t.oppose_count, 0)),
    CASE
      WHEN COALESCE(t.support_count, 0) + COALESCE(t.oppose_count, 0) >= 2 AND t.support_count <> t.oppose_count
      THEN (CASE WHEN t.support_count > t.oppose_count THEN 'support' ELSE 'oppose' END)
      ELSE NULL
    END
  FROM rep_bills rb
  LEFT JOIN tallies t ON t.bill_id = rb.bill_id;
$$;

REVOKE EXECUTE ON FUNCTION rep_district_bill_history(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rep_district_bill_history(uuid) TO authenticated;

-- ─── my_district_bill_tallies: PUBLIC — per-bill tallies, caller's own district ───
CREATE OR REPLACE FUNCTION my_district_bill_tallies(p_bill_ids uuid[])
RETURNS TABLE (bill_id uuid, support_count integer, oppose_count integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH me AS (
    SELECT district_id FROM users WHERE user_id = auth.uid()
  ),
  district_members AS (
    SELECT u.user_id FROM users u, me WHERE u.district_id = me.district_id
  )
  SELECT mt.bill_id, mt.support_count::int, mt.oppose_count::int
  FROM member_bill_tallies(
    p_bill_ids,
    COALESCE((SELECT array_agg(user_id) FROM district_members), '{}'::uuid[])
  ) mt;
$$;

REVOKE EXECUTE ON FUNCTION my_district_bill_tallies(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_district_bill_tallies(uuid[]) TO authenticated;

-- ─── user_votes_total_count: PUBLIC — admin dashboard "Votes cast" stat ───
CREATE OR REPLACE FUNCTION user_votes_total_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COUNT(*)::int FROM user_votes;
$$;

REVOKE EXECUTE ON FUNCTION user_votes_total_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION user_votes_total_count() TO authenticated;
