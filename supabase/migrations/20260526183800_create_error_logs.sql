/*
  # Create error_logs table
  Insertable by both authenticated and anon users; no read policy for non-admins
*/
CREATE TABLE IF NOT EXISTS error_logs (
  log_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  action text,
  user_id uuid,
  error_message text,
  error_code text,
  resolved boolean DEFAULT false
);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "el_insert_auth"
  ON error_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "el_insert_anon"
  ON error_logs FOR INSERT
  TO anon
  WITH CHECK (true);
