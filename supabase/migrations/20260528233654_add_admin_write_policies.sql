/*
  # Add admin write policies to bills, districts, and representatives

  1. Problem
    - The bills, districts, and representatives tables only have SELECT policies.
    - RLS silently blocks all INSERT/UPDATE/DELETE from the admin panel.
    - Supabase JS client returns no error on a blocked write — just 0 rows affected —
      so the UI shows "saved" but nothing persists.

  2. Fix
    - Add INSERT, UPDATE, and DELETE policies on bills, districts, and representatives
      for authenticated users who are admins (is_admin = true in the users table).
    - Pattern matches the existing policies on rep_votes and bill_sponsors.
*/

-- ── BILLS ──────────────────────────────────────────────────────────────────────

CREATE POLICY "Admins can insert bills"
  ON bills FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  );

CREATE POLICY "Admins can update bills"
  ON bills FOR UPDATE
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

CREATE POLICY "Admins can delete bills"
  ON bills FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  );

-- ── DISTRICTS ─────────────────────────────────────────────────────────────────

CREATE POLICY "Admins can insert districts"
  ON districts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  );

CREATE POLICY "Admins can update districts"
  ON districts FOR UPDATE
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

CREATE POLICY "Admins can delete districts"
  ON districts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  );

-- ── REPRESENTATIVES ───────────────────────────────────────────────────────────

CREATE POLICY "Admins can insert representatives"
  ON representatives FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  );

CREATE POLICY "Admins can update representatives"
  ON representatives FOR UPDATE
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

CREATE POLICY "Admins can delete representatives"
  ON representatives FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  );
