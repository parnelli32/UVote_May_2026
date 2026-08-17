/*
  # Gate voting to bills whose policy question hasn't been superseded

  1. Changes
    - Add `bills.superseded_at timestamptz` (nullable) - when a bill was
      determined to be superseded: its substantive policy question has
      already been resolved (enacted or foreclosed) by a separate bill or
      legislative vehicle, so the original bill's own passage or failure no
      longer changes the real-world outcome. Null means "not superseded"
      (the default, and the state of every existing row).
    - Add `bills.superseded_by text` (nullable) - a citation of what
      mooted it, e.g. `"SB160"`, `"HB274 (Act 55 of 2025)"`, or a general
      citation like `"Nov. 2025 state budget agreement"` when there's no
      single clean bill number.
    - Add `bills.superseded_reason text` (nullable) - freeform prose
      explaining why, for display alongside the citation.
    - Tighten `user_votes` INSERT/UPDATE RLS policies (`uv_insert`,
      `uv_update`) to additionally require the target bill has
      `superseded_at IS NULL`, enforced server-side so a stale/shared link
      to a superseded bill cannot be used to cast a vote - not just a
      client-side hide. This is on top of (not instead of) the existing
      committee-report gate from
      `20260815100000_add_bills_reported_from_committee_at_and_vote_gate.sql`.

  2. Notes
    - Product rationale (captain decision, not re-litigated here): a bill
      is superseded only when its practical policy question has already
      been resolved by a different bill or vehicle - never a single bill
      progressing normally through its own chamber-to-chamber path under
      one bill number, which is just a bill succeeding, not supersession.
      See `data/uvote-superseded-bills-log.md` in the firstmate home for
      the working definition and confirmed examples (SB1000, SB153,
      SB186).
    - This migration is schema + enforcement only. No bill is marked
      superseded here - populating these columns is separate work (a
      retroactive backlog scan, plus a detection step being added to the
      generate-bill-summary skill).
    - Purely additive/orthogonal to `status`, exactly like
      `reported_from_committee_at` - a superseded bill keeps whatever
      `status` it already has so its history stays visible, it's just no
      longer votable.
*/

ALTER TABLE bills ADD COLUMN IF NOT EXISTS superseded_at timestamptz;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS superseded_by text;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS superseded_reason text;

DROP POLICY IF EXISTS "uv_insert" ON user_votes;
CREATE POLICY "uv_insert"
  ON user_votes FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM bills b
      WHERE b.bill_id = user_votes.bill_id
      AND b.superseded_at IS NULL
      AND (
        b.reported_from_committee_at IS NOT NULL
        OR NOT COALESCE(
          (SELECT lb.requires_committee_report FROM legislative_bodies lb WHERE lb.legislative_body_id = b.legislative_body_id),
          false
        )
      )
    )
  );

DROP POLICY IF EXISTS "uv_update" ON user_votes;
CREATE POLICY "uv_update"
  ON user_votes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM bills b
      WHERE b.bill_id = user_votes.bill_id
      AND b.superseded_at IS NULL
      AND (
        b.reported_from_committee_at IS NOT NULL
        OR NOT COALESCE(
          (SELECT lb.requires_committee_report FROM legislative_bodies lb WHERE lb.legislative_body_id = b.legislative_body_id),
          false
        )
      )
    )
  );

-- ─── Recreate my_bill_feed so b.* re-expansion picks up the 3 new columns ──
-- Same DROP+CREATE reasoning as 20260815130000_add_bills_short_description.sql:
-- b.* is expanded into an explicit column list at CREATE VIEW time, and the
-- new columns land ahead of support_count/etc. in that expansion, which
-- CREATE OR REPLACE VIEW rejects as a reorder. Nothing else references
-- my_bill_feed, so dropping and recreating is safe.
DROP VIEW IF EXISTS my_bill_feed;

CREATE VIEW my_bill_feed AS
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
