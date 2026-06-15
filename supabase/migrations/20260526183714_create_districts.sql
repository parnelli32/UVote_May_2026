/*
  # Create districts table
*/
CREATE TABLE IF NOT EXISTS districts (
  district_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  district_number text,
  legislative_body_id uuid REFERENCES legislative_bodies(legislative_body_id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE districts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_districts"
  ON districts FOR SELECT
  TO authenticated
  USING (true);
