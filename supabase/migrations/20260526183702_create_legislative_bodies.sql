/*
  # Create legislative_bodies table
*/
CREATE TABLE IF NOT EXISTS legislative_bodies (
  legislative_body_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  total_reps integer,
  total_districts integer,
  total_atlarge integer,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE legislative_bodies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_legislative_bodies"
  ON legislative_bodies FOR SELECT
  TO authenticated
  USING (true);
