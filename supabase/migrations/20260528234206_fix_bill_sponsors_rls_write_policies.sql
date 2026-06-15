/*
  # Fix bill_sponsors RLS write policies

  ## Problem
  The existing `admin_write_bill_sponsors` policy uses `FOR ALL` with only a `USING`
  clause and no `WITH CHECK` clause. Postgres requires `WITH CHECK` for INSERT and UPDATE
  operations. Without it, inserts are silently blocked — the client receives no error but
  no rows are written. This caused co-sponsor additions to disappear on save.

  ## Changes
  1. Drop the broken `admin_write_bill_sponsors` (FOR ALL) policy
  2. Add three explicit policies — INSERT, UPDATE, DELETE — each with the correct clauses
     and restricted to authenticated admin users (is_admin = true in the users table)

  ## Security
  No change in who can access the table. Admins still have full write access.
  The existing `allow_read_bill_sponsors` SELECT policy is unchanged.
*/

DROP POLICY IF EXISTS "admin_write_bill_sponsors" ON bill_sponsors;

CREATE POLICY "Admins can insert bill sponsors"
  ON bill_sponsors FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  );

CREATE POLICY "Admins can update bill sponsors"
  ON bill_sponsors FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  );

CREATE POLICY "Admins can delete bill sponsors"
  ON bill_sponsors FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  );
