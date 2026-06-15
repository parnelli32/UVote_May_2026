/*
  # Create users table
  user_id matches auth.users.id
*/
CREATE TABLE IF NOT EXISTS users (
  user_id uuid PRIMARY KEY,
  username text NOT NULL,
  email text NOT NULL,
  street_address text,
  district_id uuid REFERENCES districts(district_id),
  is_admin boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
