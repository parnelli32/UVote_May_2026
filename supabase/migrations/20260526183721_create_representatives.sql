/*
  # Create representatives table
*/
CREATE TABLE IF NOT EXISTS representatives (
  representative_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  title text,
  party text,
  bio text,
  district_id uuid REFERENCES districts(district_id),
  legislative_body_id uuid REFERENCES legislative_bodies(legislative_body_id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE representatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_representatives"
  ON representatives FOR SELECT
  TO authenticated
  USING (true);
