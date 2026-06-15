/*
  # Admin Read Policies

  Adds RLS policies so that users with is_admin = true can read all tables
  needed by the admin panel (bills, user_votes, rep_votes, error_logs,
  representatives, districts, legislative_bodies, users).

  Also adds a policy to allow admins to update error_logs (mark resolved)
  and a policy to allow admins to insert/update/delete bills, rep_votes,
  districts, and representatives.

  1. Changes
    - SELECT, INSERT, UPDATE, DELETE policies for admins on:
      bills, rep_votes, districts, representatives
    - SELECT + UPDATE policies for admins on: error_logs
    - SELECT policy for admins on: users, user_votes, legislative_bodies
*/

-- Helper: is_admin check inline (using subquery to avoid direct column access issues)
-- Admin bills
CREATE POLICY "Admins can read all bills"
  ON bills FOR SELECT
  TO authenticated
  USING (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  );

CREATE POLICY "Admins can insert bills"
  ON bills FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  );

CREATE POLICY "Admins can update bills"
  ON bills FOR UPDATE
  TO authenticated
  USING (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  )
  WITH CHECK (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  );

CREATE POLICY "Admins can delete bills"
  ON bills FOR DELETE
  TO authenticated
  USING (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  );

-- Admin rep_votes
CREATE POLICY "Admins can read all rep votes"
  ON rep_votes FOR SELECT
  TO authenticated
  USING (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  );

CREATE POLICY "Admins can insert rep votes"
  ON rep_votes FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  );

CREATE POLICY "Admins can update rep votes"
  ON rep_votes FOR UPDATE
  TO authenticated
  USING (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  )
  WITH CHECK (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  );

-- Admin districts
CREATE POLICY "Admins can read all districts"
  ON districts FOR SELECT
  TO authenticated
  USING (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  );

CREATE POLICY "Admins can insert districts"
  ON districts FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  );

CREATE POLICY "Admins can update districts"
  ON districts FOR UPDATE
  TO authenticated
  USING (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  )
  WITH CHECK (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  );

-- Admin representatives
CREATE POLICY "Admins can read all representatives"
  ON representatives FOR SELECT
  TO authenticated
  USING (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  );

CREATE POLICY "Admins can insert representatives"
  ON representatives FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  );

CREATE POLICY "Admins can update representatives"
  ON representatives FOR UPDATE
  TO authenticated
  USING (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  )
  WITH CHECK (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  );

-- Admin error_logs
CREATE POLICY "Admins can read all error logs"
  ON error_logs FOR SELECT
  TO authenticated
  USING (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  );

CREATE POLICY "Admins can update error logs"
  ON error_logs FOR UPDATE
  TO authenticated
  USING (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  )
  WITH CHECK (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  );

-- Admin users (read only)
CREATE POLICY "Admins can read all users"
  ON users FOR SELECT
  TO authenticated
  USING (
    (SELECT is_admin FROM users u2 WHERE u2.user_id = auth.uid()) = true
  );

-- Admin user_votes (read only)
CREATE POLICY "Admins can read all user votes"
  ON user_votes FOR SELECT
  TO authenticated
  USING (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  );

-- Admin user_votes delete (for cascade on bill delete)
CREATE POLICY "Admins can delete user votes"
  ON user_votes FOR DELETE
  TO authenticated
  USING (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  );

-- Admin rep_votes delete (for cascade on bill delete)
CREATE POLICY "Admins can delete rep votes"
  ON rep_votes FOR DELETE
  TO authenticated
  USING (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  );

-- Admin legislative_bodies (read only)
CREATE POLICY "Admins can read all legislative bodies"
  ON legislative_bodies FOR SELECT
  TO authenticated
  USING (
    (SELECT is_admin FROM users WHERE user_id = auth.uid()) = true
  );
