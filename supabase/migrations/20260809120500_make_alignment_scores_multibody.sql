/*
  # Make district-membership-resolving alignment functions body-aware

  1. Why
    `20260602020000_add_alignment_score_and_tally_functions.sql` predates
    `user_districts` and resolves district membership from the single
    `users.district_id` column in three places. CLAUDE.md is explicit that
    alignment scores stay "per-body, never blended into one number" — with a
    user now able to hold a City Council district, a PA House district, and a
    PA Senate district simultaneously, `users.district_id` no longer identifies
    "the" district to score against, so every one of those three call sites
    needs to become body-aware.

  2. Changes
    - `rep_district_member_ids(p_representative_id)`: rewritten to join through
      `user_districts` instead of `users.district_id`, filtered to the
      representative's own `legislative_body_id`. This one fix is sufficient
      for `constituent_score` and `rep_district_bill_history` (both already
      take `p_representative_id`, which uniquely determines the body) — no
      signature change needed for either.
    - `district_score()` -> `district_score(p_legislative_body_id uuid)`: now
      resolves the caller's district via `user_districts` for the given body.
      Old zero-arg signature is dropped, not left dangling with stale
      single-body semantics.
    - `my_district_bill_tallies(p_bill_ids uuid[])` ->
      `my_district_bill_tallies(p_bill_ids uuid[], p_legislative_body_id uuid)`:
      same reasoning. Old signature dropped.
    - `representation_score` and `city_constituent_score` are unchanged — the
      former never resolves district membership at all (direct user-vote vs.
      rep-vote comparison), the latter is explicitly city/state-wide with no
      district membership resolution either.

  3. Notes
    - Preserves the pre-existing (not introduced here) limitation that
      `district_score` only counts an at-large representative's votes when
      `r.district_id` is non-null — at-large reps are excluded from
      `my_district_rep_bills` exactly as before this migration. Not this
      migration's job to change that.
*/

-- ─── rep_district_member_ids: now resolves via user_districts ─────────────
CREATE OR REPLACE FUNCTION rep_district_member_ids(p_representative_id uuid)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT ud.user_id
  FROM representatives r
  JOIN user_districts ud ON ud.legislative_body_id = r.legislative_body_id
  WHERE r.representative_id = p_representative_id
    AND (r.district_id IS NULL OR ud.district_id = r.district_id);
$$;

REVOKE EXECUTE ON FUNCTION rep_district_member_ids(uuid) FROM PUBLIC;

-- ─── district_score: now takes a legislative_body_id ──────────────────────
DROP FUNCTION IF EXISTS district_score();

CREATE OR REPLACE FUNCTION district_score(p_legislative_body_id uuid)
RETURNS TABLE (score integer, qualifying_bills integer, matched_bills integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH me AS (
    SELECT district_id FROM user_districts
    WHERE user_id = auth.uid() AND legislative_body_id = p_legislative_body_id
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
    SELECT ud.user_id FROM user_districts ud, me
    WHERE ud.district_id = me.district_id AND ud.legislative_body_id = p_legislative_body_id
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

REVOKE EXECUTE ON FUNCTION district_score(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION district_score(uuid) TO authenticated;

-- ─── my_district_bill_tallies: now takes a legislative_body_id ────────────
DROP FUNCTION IF EXISTS my_district_bill_tallies(uuid[]);

CREATE OR REPLACE FUNCTION my_district_bill_tallies(p_bill_ids uuid[], p_legislative_body_id uuid)
RETURNS TABLE (bill_id uuid, support_count integer, oppose_count integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH me AS (
    SELECT district_id FROM user_districts
    WHERE user_id = auth.uid() AND legislative_body_id = p_legislative_body_id
  ),
  district_members AS (
    SELECT ud.user_id FROM user_districts ud, me
    WHERE ud.district_id = me.district_id AND ud.legislative_body_id = p_legislative_body_id
  )
  SELECT mt.bill_id, mt.support_count::int, mt.oppose_count::int
  FROM member_bill_tallies(
    p_bill_ids,
    COALESCE((SELECT array_agg(user_id) FROM district_members), '{}'::uuid[])
  ) mt;
$$;

REVOKE EXECUTE ON FUNCTION my_district_bill_tallies(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_district_bill_tallies(uuid[], uuid) TO authenticated;
