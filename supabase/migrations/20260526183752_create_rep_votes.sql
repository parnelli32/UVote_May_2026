/*
  # Create rep_votes table
  Unique constraint on (representative_id, bill_id); vote must be 'support' or 'oppose'
*/
CREATE TABLE IF NOT EXISTS rep_votes (
  rep_vote_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid REFERENCES bills(bill_id),
  representative_id uuid REFERENCES representatives(representative_id),
  vote text NOT NULL,
  explanation text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (representative_id, bill_id),
  CONSTRAINT rep_votes_vote_check CHECK (vote IN ('support', 'oppose'))
);

ALTER TABLE rep_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_rep_votes"
  ON rep_votes FOR SELECT
  TO authenticated
  USING (true);
