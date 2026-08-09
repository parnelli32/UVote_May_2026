/*
  # Census-category system voting blocks (data-collection plumbing only)

  1. Changes
    - `user_demographics`: one row per user, nullable columns for each of the census
      categories below. Own-row SELECT/INSERT/UPDATE only — see privacy note.
    - `voting_blocks` gains `is_system`, `system_category`, `system_value` so a census
      answer can map to a well-known citywide block, plus a partial unique index so
      each (category, value) pair has exactly one system block, without colliding with
      ordinary (non-system) blocks whose category/value are always NULL.
    - `sync_voting_block_active_status()` (from 20260808095918_create_voting_blocks.sql)
      gains a `WHERE NOT is_system` guard: system blocks intentionally have zero admin
      members forever, and must stay permanently active rather than being deactivated
      by the existing has-an-admin trigger.
    - `census_block_reveal_threshold()`: single source of truth for the minimum member
      count a system block needs before it's visible to anyone — mirrors the
      `SPOTLIGHT_VOTE_THRESHOLD` hardcoded-constant pattern in `DashboardTab.tsx`, just
      expressed as a SQL function so every gated read path shares one definition.
    - `submit_demographics(...)`: the only path that may write `user_demographics` or
      create/join a system block. Upserts the caller's demographics row, then for each
      newly-non-null category value, finds-or-creates the matching system voting block
      and joins the caller to it (modeled on `join_voting_block`). Never a raw client
      INSERT — same reasoning as `join_voting_block`: a client-side insert would let
      anyone join/create arbitrary blocks.
    - Reveal-threshold gating added to every existing read path that could otherwise
      leak a below-threshold system block's existence or data: `voting_blocks_public`,
      `get_voting_block_bill_positions`, `get_voting_block_geo_breakdown`, and
      `get_bill_voting_block_positions`.

  2. Privacy notes (captain-approved, this round is data-collection only — no
     block-browsing UI)
    - `user_demographics` deliberately has NO platform-admin read policy, unlike every
      other table in this app (see 20260527202629_add_admin_read_policies.sql). This is
      a one-off exception: no one but the user themselves can ever read their own
      census answers, not even a platform admin.
    - A system block under `census_block_reveal_threshold()` members must behave as if
      it doesn't exist for every caller, including its own members — small/sensitive
      demographic groups shouldn't be identifiable before there's a real user base.
      This is stricter than the admin-bypass already present in the pre-existing
      visibility checks below, so the threshold check below is applied with no
      exception, even for platform admins, on every path a public-facing UI reads
      through. (The admin panel's direct `voting_blocks` table queries are untouched
      and out of scope for this migration — admins already have standing access to
      every other table via 20260527202629_add_admin_read_policies.sql.)
    - Once a system block crosses threshold, it renders through the existing,
      unmodified `voting_blocks_public` / `VotingBlockPage.tsx` code path — that's the
      point of reusing the schema instead of building a parallel one.
*/

-- ── user_demographics ───────────────────────────────────────────────────────────

CREATE TABLE user_demographics (
  user_id uuid PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  race_ethnicity text CHECK (race_ethnicity IN (
    'white', 'black_african_american', 'asian',
    'american_indian_alaska_native', 'native_hawaiian_pacific_islander', 'two_or_more_races'
  )),
  hispanic_latino boolean,
  education text CHECK (education IN (
    'less_than_high_school', 'high_school_or_ged', 'some_college_or_associates',
    'bachelors', 'graduate_or_professional'
  )),
  annual_earnings text CHECK (annual_earnings IN (
    'under_25k', '25k_50k', '50k_75k', '75k_100k', '100k_150k', '150k_plus'
  )),
  homeownership text CHECK (homeownership IN ('own', 'rent')),
  age_bracket text CHECK (age_bracket IN (
    '18_24', '25_34', '35_44', '45_54', '55_64', '65_plus'
  )),
  employment_status text CHECK (employment_status IN (
    'employed', 'unemployed', 'not_in_labor_force'
  )),
  veteran boolean,
  disability boolean,
  household_type text CHECK (household_type IN (
    'living_alone', 'married_or_partnered', 'family_with_children', 'multigenerational'
  )),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_demographics ENABLE ROW LEVEL SECURITY;

-- Deliberately no platform-admin read policy here — see privacy note above.

CREATE POLICY "Users can read their own demographics"
  ON user_demographics FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own demographics"
  ON user_demographics FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own demographics"
  ON user_demographics FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── voting_blocks: system-block columns ─────────────────────────────────────────

ALTER TABLE voting_blocks
  ADD COLUMN is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN system_category text,
  ADD COLUMN system_value text;

-- Partial index: only system blocks participate in the uniqueness constraint, so
-- ordinary blocks (system_category/system_value always NULL) never collide with each
-- other regardless of how Postgres treats NULL in a plain UNIQUE constraint.
CREATE UNIQUE INDEX voting_blocks_system_category_value_idx
  ON voting_blocks (system_category, system_value)
  WHERE is_system;

-- ── census_block_reveal_threshold: single source of truth for the reveal gate ───

CREATE OR REPLACE FUNCTION census_block_reveal_threshold()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 25;
$$;

-- ── Fix: system blocks must stay permanently active regardless of admin count ──

CREATE OR REPLACE FUNCTION sync_voting_block_active_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_block_id uuid;
BEGIN
  v_block_id := COALESCE(NEW.voting_block_id, OLD.voting_block_id);

  IF EXISTS (SELECT 1 FROM voting_blocks WHERE voting_block_id = v_block_id AND is_system) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF EXISTS (
    SELECT 1 FROM voting_block_members
    WHERE voting_block_id = v_block_id AND is_admin = true
  ) THEN
    UPDATE voting_blocks SET is_active = true WHERE voting_block_id = v_block_id AND is_active = false;
  ELSE
    UPDATE voting_blocks SET is_active = false WHERE voting_block_id = v_block_id AND is_active = true;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── submit_demographics: the only path that may write demographics or join a
--    system block ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_demographics(
  p_race_ethnicity text DEFAULT NULL,
  p_hispanic_latino boolean DEFAULT NULL,
  p_education text DEFAULT NULL,
  p_annual_earnings text DEFAULT NULL,
  p_homeownership text DEFAULT NULL,
  p_age_bracket text DEFAULT NULL,
  p_employment_status text DEFAULT NULL,
  p_veteran boolean DEFAULT NULL,
  p_disability boolean DEFAULT NULL,
  p_household_type text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing user_demographics%ROWTYPE;
  v_block_id uuid;
  r RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_existing FROM user_demographics WHERE user_id = v_user_id;

  INSERT INTO user_demographics (
    user_id, race_ethnicity, hispanic_latino, education, annual_earnings,
    homeownership, age_bracket, employment_status, veteran, disability, household_type, updated_at
  )
  VALUES (
    v_user_id, p_race_ethnicity, p_hispanic_latino, p_education, p_annual_earnings,
    p_homeownership, p_age_bracket, p_employment_status, p_veteran, p_disability, p_household_type, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    race_ethnicity = EXCLUDED.race_ethnicity,
    hispanic_latino = EXCLUDED.hispanic_latino,
    education = EXCLUDED.education,
    annual_earnings = EXCLUDED.annual_earnings,
    homeownership = EXCLUDED.homeownership,
    age_bracket = EXCLUDED.age_bracket,
    employment_status = EXCLUDED.employment_status,
    veteran = EXCLUDED.veteran,
    disability = EXCLUDED.disability,
    household_type = EXCLUDED.household_type,
    updated_at = now();

  FOR r IN
    SELECT * FROM (VALUES
      ('race_ethnicity', p_race_ethnicity, v_existing.race_ethnicity),
      ('hispanic_latino', p_hispanic_latino::text, v_existing.hispanic_latino::text),
      ('education', p_education, v_existing.education),
      ('annual_earnings', p_annual_earnings, v_existing.annual_earnings),
      ('homeownership', p_homeownership, v_existing.homeownership),
      ('age_bracket', p_age_bracket, v_existing.age_bracket),
      ('employment_status', p_employment_status, v_existing.employment_status),
      ('veteran', p_veteran::text, v_existing.veteran::text),
      ('disability', p_disability::text, v_existing.disability::text),
      ('household_type', p_household_type, v_existing.household_type)
    ) AS t(category, new_value, old_value)
    WHERE new_value IS NOT NULL AND new_value IS DISTINCT FROM old_value
  LOOP
    INSERT INTO voting_blocks (name, is_system, system_category, system_value, visibility, created_by)
    VALUES (
      initcap(replace(r.category, '_', ' ')) || ': ' || r.new_value,
      true, r.category, r.new_value, 'public', NULL
    )
    ON CONFLICT (system_category, system_value) WHERE is_system DO NOTHING;

    SELECT voting_block_id INTO v_block_id
    FROM voting_blocks
    WHERE is_system AND system_category = r.category AND system_value = r.new_value;

    INSERT INTO voting_block_members (voting_block_id, user_id, is_admin)
    VALUES (v_block_id, v_user_id, false)
    ON CONFLICT (voting_block_id, user_id) DO NOTHING;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_demographics(
  text, boolean, text, text, text, text, text, boolean, boolean, text
) TO authenticated;

-- ── Reveal-threshold gating on every existing read path ─────────────────────────

CREATE OR REPLACE VIEW voting_blocks_public AS
SELECT
  vb.voting_block_id,
  vb.name,
  vb.visibility,
  vb.is_active,
  vb.created_by,
  vb.created_at,
  (SELECT COUNT(*) FROM voting_block_members m WHERE m.voting_block_id = vb.voting_block_id) AS member_count
FROM voting_blocks vb
WHERE
  (
    vb.visibility = 'public'
    OR EXISTS (
      SELECT 1 FROM voting_block_members m
      WHERE m.voting_block_id = vb.voting_block_id AND m.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.is_admin = true)
  )
  AND (
    NOT vb.is_system
    OR (SELECT COUNT(*) FROM voting_block_members m WHERE m.voting_block_id = vb.voting_block_id) >= census_block_reveal_threshold()
  );

GRANT SELECT ON voting_blocks_public TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_voting_block_bill_positions(p_block_id uuid)
RETURNS TABLE (
  bill_id uuid,
  support_count bigint,
  oppose_count bigint,
  total_votes bigint,
  vote_position text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM voting_blocks vb
    WHERE vb.voting_block_id = p_block_id
    AND (
      vb.visibility = 'public'
      OR EXISTS (
        SELECT 1 FROM voting_block_members m
        WHERE m.voting_block_id = p_block_id AND m.user_id = auth.uid()
      )
      OR EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.is_admin = true)
    )
    AND (
      NOT vb.is_system
      OR (SELECT COUNT(*) FROM voting_block_members m WHERE m.voting_block_id = vb.voting_block_id) >= census_block_reveal_threshold()
    )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    uv.bill_id,
    COUNT(*) FILTER (WHERE uv.vote = 'support') AS support_count,
    COUNT(*) FILTER (WHERE uv.vote = 'oppose') AS oppose_count,
    COUNT(*) AS total_votes,
    CASE
      WHEN COUNT(*) FILTER (WHERE uv.vote = 'support') = COUNT(*) FILTER (WHERE uv.vote = 'oppose') THEN 'tied'
      WHEN COUNT(*) FILTER (WHERE uv.vote = 'support') > COUNT(*) FILTER (WHERE uv.vote = 'oppose') THEN 'support'
      ELSE 'oppose'
    END AS vote_position
  FROM user_votes uv
  JOIN voting_block_members m ON m.user_id = uv.user_id
  WHERE m.voting_block_id = p_block_id
  GROUP BY uv.bill_id
  HAVING COUNT(*) >= 2;
END;
$$;

GRANT EXECUTE ON FUNCTION get_voting_block_bill_positions(uuid) TO authenticated, anon;

CREATE OR REPLACE FUNCTION get_voting_block_geo_breakdown(p_block_id uuid)
RETURNS TABLE (
  district_name text,
  legislative_body_name text,
  member_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM voting_blocks vb
    WHERE vb.voting_block_id = p_block_id
    AND (
      vb.visibility = 'public'
      OR EXISTS (
        SELECT 1 FROM voting_block_members m
        WHERE m.voting_block_id = p_block_id AND m.user_id = auth.uid()
      )
      OR EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.is_admin = true)
    )
    AND (
      NOT vb.is_system
      OR (SELECT COUNT(*) FROM voting_block_members m WHERE m.voting_block_id = vb.voting_block_id) >= census_block_reveal_threshold()
    )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    d.name AS district_name,
    lb.name AS legislative_body_name,
    COUNT(*) AS member_count
  FROM voting_block_members m
  JOIN users u ON u.user_id = m.user_id
  LEFT JOIN districts d ON d.district_id = u.district_id
  LEFT JOIN legislative_bodies lb ON lb.legislative_body_id = d.legislative_body_id
  WHERE m.voting_block_id = p_block_id
  GROUP BY d.name, lb.name
  ORDER BY member_count DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_voting_block_geo_breakdown(uuid) TO authenticated, anon;

CREATE OR REPLACE FUNCTION get_bill_voting_block_positions(p_bill_id uuid)
RETURNS TABLE (
  voting_block_id uuid,
  name text,
  support_count bigint,
  oppose_count bigint,
  total_votes bigint,
  vote_position text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vb.voting_block_id,
    vb.name,
    COUNT(*) FILTER (WHERE uv.vote = 'support') AS support_count,
    COUNT(*) FILTER (WHERE uv.vote = 'oppose') AS oppose_count,
    COUNT(*) AS total_votes,
    CASE
      WHEN COUNT(*) FILTER (WHERE uv.vote = 'support') = COUNT(*) FILTER (WHERE uv.vote = 'oppose') THEN 'tied'
      WHEN COUNT(*) FILTER (WHERE uv.vote = 'support') > COUNT(*) FILTER (WHERE uv.vote = 'oppose') THEN 'support'
      ELSE 'oppose'
    END AS vote_position
  FROM voting_blocks vb
  JOIN voting_block_members m ON m.voting_block_id = vb.voting_block_id
  JOIN user_votes uv ON uv.user_id = m.user_id AND uv.bill_id = p_bill_id
  WHERE
    (
      vb.visibility = 'public'
      OR EXISTS (
        SELECT 1 FROM voting_block_members m2
        WHERE m2.voting_block_id = vb.voting_block_id AND m2.user_id = auth.uid()
      )
      OR EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.is_admin = true)
    )
    AND (
      NOT vb.is_system
      OR (SELECT COUNT(*) FROM voting_block_members m3 WHERE m3.voting_block_id = vb.voting_block_id) >= census_block_reveal_threshold()
    )
  GROUP BY vb.voting_block_id, vb.name
  HAVING COUNT(*) >= 2
  ORDER BY COUNT(*) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_bill_voting_block_positions(uuid) TO authenticated, anon;
