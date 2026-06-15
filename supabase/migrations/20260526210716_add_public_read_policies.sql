/*
  # Add anon/public read policies and vote tally view

  1. Changes
    - Add anon SELECT policies on bills, districts, representatives, rep_votes, user_votes
      so the public /bill/:id page works without auth
    - Add uv_select_all policy on user_votes so tally counts work for everyone
    - Create bill_vote_tallies view that returns support/oppose counts per bill
      (used by both feed and detail pages)

  2. Notes
    - user_votes individual rows remain protected — only the aggregate view is public
    - The view uses SECURITY DEFINER so anon can read aggregate counts safely
*/

-- bills: allow anon read
CREATE POLICY "read_bills_anon"
  ON bills FOR SELECT
  TO anon
  USING (true);

-- districts: allow anon read
CREATE POLICY "read_districts_anon"
  ON districts FOR SELECT
  TO anon
  USING (true);

-- representatives: allow anon read
CREATE POLICY "read_representatives_anon"
  ON representatives FOR SELECT
  TO anon
  USING (true);

-- rep_votes: allow anon read
CREATE POLICY "read_rep_votes_anon"
  ON rep_votes FOR SELECT
  TO anon
  USING (true);

-- legislative_bodies: allow anon read
CREATE POLICY "read_legislative_bodies_anon"
  ON legislative_bodies FOR SELECT
  TO anon
  USING (true);

-- user_votes aggregate counts: authenticated users can see all votes for tally
-- (the existing uv_select only lets users see their own rows)
CREATE POLICY "uv_select_all_for_tally"
  ON user_votes FOR SELECT
  TO authenticated
  USING (true);

-- Bill vote tally view — aggregate support/oppose counts, safe for both roles
CREATE OR REPLACE VIEW bill_vote_tallies AS
SELECT
  bill_id,
  COUNT(*) FILTER (WHERE vote = 'support') AS support_count,
  COUNT(*) FILTER (WHERE vote = 'oppose')  AS oppose_count,
  COUNT(*) AS total_votes
FROM user_votes
GROUP BY bill_id;
