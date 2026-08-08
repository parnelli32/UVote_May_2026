/*
  # Tighten user_votes SELECT policy to own-row-only

  1. Changes
    - Drop `uv_select_all_for_tally` on `user_votes`. That policy granted any
      authenticated user raw SELECT access to every row of `user_votes`
      (including whose vote is whose and the free-text `explanation` column),
      even though its own comment and the migration that introduced it
      (20260526210716_add_public_read_policies.sql) both stated only
      aggregate tallies should be public.
    - The existing `uv_select` policy (own rows only, `auth.uid() = user_id`)
      is left in place and is now the only SELECT policy on `user_votes` for
      the `authenticated` role.

  2. Notes
    - This is safe now (and would not have been safe before) because the
      previous migration (20260602020000_add_alignment_score_and_tally_functions.sql)
      added SECURITY DEFINER RPCs — constituent_score, city_constituent_score,
      district_score, representation_score, rep_district_bill_history,
      my_district_bill_tallies — that perform the cross-user aggregation
      `uv_select_all_for_tally` used to enable, but only ever return aggregate
      counts/scores, never raw per-user vote rows. The `bill_vote_tallies`
      view is unaffected by this change — as a plain view it already reads
      with the view owner's privileges, not the querying role's RLS grants,
      which is why it kept working for `anon` even though `anon` never had a
      `user_votes` SELECT policy at all.
    - Registered decision hold: uvote-alignment-score-architecture-decision-
      user-votes-rls-exposure. Captain decision (2026-08-08): bundle this
      tightening into the same round as the score-RPC unification rather than
      defer it, since Voting Blocks needs the same safe-cross-user-aggregation
      capability next and the RPC layer built here is designed to extend to
      that (see the previous migration's notes).
*/

DROP POLICY IF EXISTS "uv_select_all_for_tally" ON user_votes;
