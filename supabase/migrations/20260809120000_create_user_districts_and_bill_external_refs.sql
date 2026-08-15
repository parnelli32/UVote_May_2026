/*
  # Add user_districts and bill_external_refs (PA House / PA Senate rollout, step 1)

  1. Changes
    - New table `user_districts`: one row per (user, legislative body) the user has a
      resolved district for. This replaces the single `users.district_id` column as the
      source of truth for district membership, so a user can hold a district for City
      Council, PA House, and PA Senate at once. `users.district_id` is left in place
      unchanged for now (still the live read path for every existing query) — nothing
      in the app reads `user_districts` yet. A later migration cuts the app over, and a
      migration after that drops `users.district_id` once the cutover is confirmed
      stable. See supabase-schema-change skill and CLAUDE.md for why this is staged.
    - New table `bill_external_refs`: one row per bill sourced from an external feed
      (LegiScan to start), keyed by `bill_id` with the source's own id/session/change
      hash, so a sync job can cheaply diff what has changed since last poll and re-sync
      is idempotent. Purely additive — no existing table is touched.
    - Backfill: every existing user with a `district_id` gets one `user_districts` row
      for that district's legislative body (resolved via `districts.legislative_body_id`,
      not a hardcoded body id, so this works regardless of which body that user's
      district happens to belong to). Pure data operation, zero app-visible change.

  2. Security
    - `user_districts`: RLS enabled. Own-row INSERT/UPDATE/DELETE
      (`auth.uid() = user_id`), same shape as `users_insert`/`users_update`. SELECT is
      broader — `FOR SELECT TO authenticated USING (true)` — mirroring
      `allow_read_district_assignments` on `users`
      (20260526233513_allow_read_district_assignments.sql), which exists precisely so
      `AuthContext.tsx`'s district-majority read (`districtUserIds`, enumerating every
      user in a district to compute alignment scores) can enumerate district membership
      across users. `user_districts` is what that read moves onto per-body in the
      cutover migration, so it needs the same read shape as `users.district_id` has
      today, not the narrower own-row-only shape a first read of the schema might
      suggest. No anon policy — still authenticated-only, same as today.
    - `bill_external_refs`: readable by anyone who can read `bills` (public bill data),
      writable only by a platform admin — sync jobs run as service-role, which bypasses
      RLS entirely, so this policy only governs client access.
*/

-- ── TABLES ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_districts (
  user_district_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  legislative_body_id uuid NOT NULL REFERENCES legislative_bodies(legislative_body_id) ON DELETE CASCADE,
  district_id uuid NOT NULL REFERENCES districts(district_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, legislative_body_id)
);

CREATE TABLE IF NOT EXISTS bill_external_refs (
  bill_id uuid PRIMARY KEY REFERENCES bills(bill_id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('legiscan', 'openstates')),
  external_bill_id text NOT NULL,
  external_session_id text,
  change_hash text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_bill_id)
);

ALTER TABLE user_districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_external_refs ENABLE ROW LEVEL SECURITY;

-- ── RLS: user_districts ──────────────────────────────────────────────────────
-- Broad read, mirroring allow_read_district_assignments on users: any authenticated
-- user can enumerate (user_id, legislative_body_id, district_id) rows, needed for the
-- per-body district-majority alignment calculation. No anon access.

CREATE POLICY "allow_read_user_districts"
  ON user_districts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "user_districts_insert_own"
  ON user_districts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_districts_update_own"
  ON user_districts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_districts_delete_own"
  ON user_districts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_districts_admin_write"
  ON user_districts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "user_districts_admin_update"
  ON user_districts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "user_districts_admin_delete"
  ON user_districts FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  );

-- ── RLS: bill_external_refs ──────────────────────────────────────────────────

CREATE POLICY "read_bill_external_refs"
  ON bill_external_refs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin_insert_bill_external_refs"
  ON bill_external_refs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "admin_update_bill_external_refs"
  ON bill_external_refs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "admin_delete_bill_external_refs"
  ON bill_external_refs FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  );

-- ── BACKFILL ───────────────────────────────────────────────────────────────────
-- One user_districts row per existing user, for whichever legislative body their
-- current district_id already belongs to (today, always City Council — but derived
-- from the district row rather than hardcoded, so this stays correct if that ever
-- changes before this migration runs).

INSERT INTO user_districts (user_id, legislative_body_id, district_id)
SELECT u.user_id, d.legislative_body_id, u.district_id
FROM users u
JOIN districts d ON d.district_id = u.district_id
WHERE u.district_id IS NOT NULL
  AND d.legislative_body_id IS NOT NULL
ON CONFLICT (user_id, legislative_body_id) DO NOTHING;
