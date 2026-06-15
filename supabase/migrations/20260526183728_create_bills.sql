/*
  # Create bills table
*/
CREATE TABLE IF NOT EXISTS bills (
  bill_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text,
  bill_text text,
  introduced_date date,
  status text NOT NULL DEFAULT 'active',
  primary_sponsor text,
  legislative_body_id uuid REFERENCES legislative_bodies(legislative_body_id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_bills"
  ON bills FOR SELECT
  TO authenticated
  USING (true);
