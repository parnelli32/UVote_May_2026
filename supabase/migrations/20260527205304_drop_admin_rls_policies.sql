/*
  # Drop admin RLS policies added by 20260527202629_add_admin_read_policies.sql

  These policies were added for an admin panel that has since been removed.
  They introduced conflicts/redundancy with existing public-read policies and
  caused the bill feed to fail loading for non-admin authenticated users.

  Policies removed:
  - bills: "Admins can read all bills", "Admins can insert bills", "Admins can update bills", "Admins can delete bills"
  - districts: "Admins can read all districts", "Admins can insert districts", "Admins can update districts"
  - user_votes: "Admins can read all user votes", "Admins can delete user votes"
  - users: "Admins can read all users"
  - representatives: "Admins can read all representatives" (if exists)
*/

DROP POLICY IF EXISTS "Admins can read all bills" ON bills;
DROP POLICY IF EXISTS "Admins can insert bills" ON bills;
DROP POLICY IF EXISTS "Admins can update bills" ON bills;
DROP POLICY IF EXISTS "Admins can delete bills" ON bills;

DROP POLICY IF EXISTS "Admins can read all districts" ON districts;
DROP POLICY IF EXISTS "Admins can insert districts" ON districts;
DROP POLICY IF EXISTS "Admins can update districts" ON districts;

DROP POLICY IF EXISTS "Admins can read all user votes" ON user_votes;
DROP POLICY IF EXISTS "Admins can delete user votes" ON user_votes;

DROP POLICY IF EXISTS "Admins can read all users" ON users;

DROP POLICY IF EXISTS "Admins can read all representatives" ON representatives;
DROP POLICY IF EXISTS "Admins can insert representatives" ON representatives;
DROP POLICY IF EXISTS "Admins can update representatives" ON representatives;
DROP POLICY IF EXISTS "Admins can delete representatives" ON representatives;
