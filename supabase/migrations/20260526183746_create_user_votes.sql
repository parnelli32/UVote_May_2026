/*
  # Create user_votes table
  Unique constraint on (user_id, bill_id); vote must be 'support' or 'oppose'
*/
CREATE TABLE IF NOT EXISTS user_votes (
  user_vote_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid REFERENCES bills(bill_id),
  user_id uuid REFERENCES users(user_id),
  vote text NOT NULL,
  explanation text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, bill_id),
  CONSTRAINT user_votes_vote_check CHECK (vote IN ('support', 'oppose'))
);

ALTER TABLE user_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uv_select"
  ON user_votes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "uv_insert"
  ON user_votes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "uv_update"
  ON user_votes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "uv_delete"
  ON user_votes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
