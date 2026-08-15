/*
  # Add representative_external_refs (LegiScan people_id linkage)

  1. Why this table exists (a gap in the original PA integration plan)
    The feasibility report at
    /Users/ianparnell/firstmate/data/uvote-pa-bills-plan/report.md (Section 3)
    scoped `bill_external_refs` as "intentionally the only new table the sync
    job needs beyond user_districts," on the reasoning that representatives can
    just be matched by `district_id` (PA House/Senate districts are all
    single-member, so district_id already uniquely identifies the current
    officeholder). That holds for populating `representatives` rows, but not
    for attributing roll-call votes: LegiScan's `getRollCall` returns votes
    keyed by its own `people_id`, and matching "whoever currently holds this
    district" at sync time would misattribute a departed member's historical
    vote to their successor if a seat changes hands mid-session (resignation,
    special election, appointment). Persisting the people_id -> representative
    link, the same way `bill_external_refs` persists LegiScan's bill_id, fixes
    that — this is a small, additive extension of the original schema plan,
    not a contradiction of it.

  2. Changes
    - New table `representative_external_refs`: one row per representative
      sourced from an external feed, keyed by `representative_id`, mirroring
      `bill_external_refs`'s shape exactly (source, external id, last synced).

  3. Security
    - Same shape as `bill_external_refs`: readable by anyone who can read
      `representatives` (public data), writable only by a platform admin —
      the sync job itself runs as service-role and bypasses RLS.
*/

CREATE TABLE IF NOT EXISTS representative_external_refs (
  representative_id uuid PRIMARY KEY REFERENCES representatives(representative_id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('legiscan', 'openstates')),
  external_people_id text NOT NULL,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_people_id)
);

ALTER TABLE representative_external_refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_representative_external_refs"
  ON representative_external_refs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin_insert_representative_external_refs"
  ON representative_external_refs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "admin_update_representative_external_refs"
  ON representative_external_refs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "admin_delete_representative_external_refs"
  ON representative_external_refs FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  );
