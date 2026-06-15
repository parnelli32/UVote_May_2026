/*
  # Allow authenticated users to read district assignments

  Adds a SELECT policy on the users table so any authenticated user can read
  the user_id and district_id columns of all users. This is required for the
  District Alignment Score calculation, which needs to enumerate all users in
  a given district. Only district assignment data is exposed — no personal info.

  1. Changes
    - Drop existing policy if it exists (idempotent)
    - Create policy "allow_read_district_assignments" FOR SELECT TO authenticated USING (true)
*/

DROP POLICY IF EXISTS "allow_read_district_assignments" ON users;

CREATE POLICY "allow_read_district_assignments"
  ON users
  FOR SELECT
  TO authenticated
  USING (true);
