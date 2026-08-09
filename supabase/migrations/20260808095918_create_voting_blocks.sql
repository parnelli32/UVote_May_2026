/*
  # Create voting blocks

  1. Changes
    - Create `voting_blocks` (name, join_code, visibility, is_active, created_by audit field)
      and `voting_block_members` (per-block membership with a per-block `is_admin` flag —
      distinct from the platform-wide `users.is_admin` flag).
    - `join_voting_block(p_code)`: SECURITY DEFINER RPC. Membership can only be granted
      through this function (or directly by a platform admin) — never via a raw client
      INSERT — otherwise any signed-in user could join any block by guessing a UUID,
      making the join code decorative.
    - `revive_voting_block(p_block_id)`: SECURITY DEFINER RPC. Any existing member of an
      inactive block (one with zero admins) can call this to reactivate it and become
      its admin.
    - `add_voting_block_admin(p_block_id, p_username)`: SECURITY DEFINER RPC letting an
      existing block admin grant admin status to another member by username. No roster
      browsing UI is ever built for this — see privacy note below — so this is
      deliberately a targeted lookup, not a list-and-select action.
    - `regenerate_voting_block_join_code(p_block_id)`: SECURITY DEFINER RPC letting a
      platform admin or block admin rotate a leaked/shared-too-widely join code.
    - `get_voting_block_bill_positions(p_block_id)` / `get_voting_block_geo_breakdown(p_block_id)`:
      SECURITY DEFINER RPCs returning aggregate-only data (never individual member votes
      or identities) for a block's per-bill position and district/legislative-body
      membership breakdown. See privacy note below for why these can't be plain
      client-side queries the way the existing district-majority tally is.
    - A trigger keeps `voting_blocks.is_active` in sync with whether the block has at
      least one admin member, regardless of which path changed membership (self-leave,
      platform-admin removal, or an admin-status RPC) — centralizing that invariant
      instead of re-deriving it in every call site.
    - `voting_blocks_public`: a view exposing only the non-sensitive columns (never
      `join_code`) to anyone who's allowed to see the block per its visibility, for use
      by the block's own page and the bill detail page's block-position section.

  2. Privacy note (captain decision, stricter than earlier drafts of this feature)
    No member of a voting block can ever see the roster of who else is in it, at any
    block size, including fellow admins — only the aggregate member count, a
    district/legislative-body breakdown of membership, and per-bill positions. This is
    why `voting_block_members` has no general-purpose SELECT policy: a user can only
    read their own membership row (to know which blocks they belong to), and platform
    admins (`users.is_admin`) can read the full roster for moderation/support, since
    they aren't "a member" in the sense this rule is protecting against.

    This also means the block-position tally can't reuse the existing client-side
    district-majority pattern (`UserProfilePage.tsx`, `DashboardTab.tsx`) as-is: that
    pattern works by having the client fetch the district's member user_ids and then
    query `user_votes` for that set, which would leak the membership list to the
    browser even if the UI never renders it. `get_voting_block_bill_positions` instead
    does the join server-side and returns only aggregated counts.

  3. Notes
    - `join_code` is never exposed by `voting_blocks_public` and the base table's SELECT
      policy is admin-only (platform admin or that block's own admin) — mirrors the
      existing "aggregate view public, raw rows protected" shape used by
      `bill_vote_tallies` in 20260526210716_add_public_read_policies.sql.
    - Visibility defaults to 'public' per captain decision (reverses this feature's
      earlier private-default draft) — an admin can set a specific block private at
      creation.
*/

-- ── TABLES ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_voting_block_join_code()
RETURNS text
LANGUAGE sql
AS $$
  SELECT upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
$$;

CREATE TABLE voting_blocks (
  voting_block_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid REFERENCES users(user_id) ON DELETE SET NULL,
  join_code text NOT NULL UNIQUE DEFAULT generate_voting_block_join_code(),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('private', 'public')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE voting_block_members (
  voting_block_member_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voting_block_id uuid NOT NULL REFERENCES voting_blocks(voting_block_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  is_admin boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (voting_block_id, user_id)
);

ALTER TABLE voting_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE voting_block_members ENABLE ROW LEVEL SECURITY;

-- ── RLS: voting_blocks ────────────────────────────────────────────────────────
-- Base table (includes join_code) is only ever readable directly by a platform
-- admin or that block's own admin. Everyone else reads through voting_blocks_public.

CREATE POLICY "Admins can read voting blocks"
  ON voting_blocks FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
    OR EXISTS (
      SELECT 1 FROM voting_block_members m
      WHERE m.voting_block_id = voting_blocks.voting_block_id
      AND m.user_id = auth.uid()
      AND m.is_admin = true
    )
  );

CREATE POLICY "Platform admins can insert voting blocks"
  ON voting_blocks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Platform admins can update voting blocks"
  ON voting_blocks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Platform admins can delete voting blocks"
  ON voting_blocks FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  );

-- ── RLS: voting_block_members ─────────────────────────────────────────────────
-- No policy here ever returns another member's row to a non-platform-admin —
-- that's the mechanism enforcing "no member can see who else is in a block."

CREATE POLICY "Platform admins can read all voting block members"
  ON voting_block_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Users can read their own voting block memberships"
  ON voting_block_members FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Platform admins can insert voting block members"
  ON voting_block_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Platform admins can update voting block members"
  ON voting_block_members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Members can leave voting blocks"
  ON voting_block_members FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Platform admins can remove voting block members"
  ON voting_block_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  );

-- ── Trigger: keep is_active in sync with "does this block have an admin?" ──────

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

CREATE TRIGGER voting_block_members_sync_active
AFTER INSERT OR DELETE OR UPDATE OF is_admin ON voting_block_members
FOR EACH ROW
EXECUTE FUNCTION sync_voting_block_active_status();

-- ── join_voting_block: the only way an ordinary user gains membership ──────────

CREATE OR REPLACE FUNCTION join_voting_block(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_block_id uuid;
BEGIN
  SELECT voting_block_id INTO v_block_id FROM voting_blocks WHERE join_code = p_code;
  IF v_block_id IS NULL THEN
    RAISE EXCEPTION 'invalid_code';
  END IF;

  INSERT INTO voting_block_members (voting_block_id, user_id, is_admin)
  VALUES (v_block_id, auth.uid(), false)
  ON CONFLICT (voting_block_id, user_id) DO NOTHING;

  RETURN v_block_id;
END;
$$;

GRANT EXECUTE ON FUNCTION join_voting_block(text) TO authenticated;

-- ── revive_voting_block: any member of an inactive block can reactivate it ─────

CREATE OR REPLACE FUNCTION revive_voting_block(p_block_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM voting_block_members
    WHERE voting_block_id = p_block_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM voting_blocks WHERE voting_block_id = p_block_id AND is_active = false
  ) THEN
    RAISE EXCEPTION 'block_not_inactive';
  END IF;

  UPDATE voting_block_members SET is_admin = true
  WHERE voting_block_id = p_block_id AND user_id = auth.uid();

  UPDATE voting_blocks SET is_active = true WHERE voting_block_id = p_block_id;
END;
$$;

GRANT EXECUTE ON FUNCTION revive_voting_block(uuid) TO authenticated;

-- ── add_voting_block_admin: existing admin grants admin status by username ─────
-- Username lookup, not roster browsing — deliberate, see privacy note above.

CREATE OR REPLACE FUNCTION add_voting_block_admin(p_block_id uuid, p_username text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM voting_block_members
    WHERE voting_block_id = p_block_id AND user_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT user_id INTO v_target_user_id FROM users WHERE username = p_username;
  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  UPDATE voting_block_members
  SET is_admin = true
  WHERE voting_block_id = p_block_id AND user_id = v_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION add_voting_block_admin(uuid, text) TO authenticated;

-- ── regenerate_voting_block_join_code: platform admin or block admin ───────────

CREATE OR REPLACE FUNCTION regenerate_voting_block_join_code(p_block_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_code text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
     AND NOT EXISTS (
       SELECT 1 FROM voting_block_members
       WHERE voting_block_id = p_block_id AND user_id = auth.uid() AND is_admin = true
     )
  THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_new_code := generate_voting_block_join_code();
  UPDATE voting_blocks SET join_code = v_new_code WHERE voting_block_id = p_block_id;
  RETURN v_new_code;
END;
$$;

GRANT EXECUTE ON FUNCTION regenerate_voting_block_join_code(uuid) TO authenticated;

-- ── voting_blocks_public: safe aggregate view (no join_code) ───────────────────
-- Owned by the migration role (bypasses RLS on the base tables like
-- bill_vote_tallies does), so the WHERE clause here IS the access boundary.

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
  vb.visibility = 'public'
  OR EXISTS (
    SELECT 1 FROM voting_block_members m
    WHERE m.voting_block_id = vb.voting_block_id AND m.user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.is_admin = true);

GRANT SELECT ON voting_blocks_public TO anon, authenticated;

-- ── get_voting_block_bill_positions: aggregate-only per-bill tally ─────────────

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

-- ── get_voting_block_geo_breakdown: aggregate-only district/body breakdown ─────

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

-- ── get_bill_voting_block_positions: every visible block's position on one bill ─
-- Powers the block-position section on BillDetailPage.tsx — the inverse lookup of
-- get_voting_block_bill_positions (that one is "this block's positions on every
-- bill it qualifies on"; this one is "every block's position on this one bill").

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
    vb.visibility = 'public'
    OR EXISTS (
      SELECT 1 FROM voting_block_members m2
      WHERE m2.voting_block_id = vb.voting_block_id AND m2.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.is_admin = true)
  GROUP BY vb.voting_block_id, vb.name
  HAVING COUNT(*) >= 2
  ORDER BY COUNT(*) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_bill_voting_block_positions(uuid) TO authenticated, anon;
