/*
  # Add representative photos: photo_url column + storage bucket

  1. Changes
    - Add nullable `photo_url text` to `representatives`, same style as the existing
      nullable `bio` column. No RLS change needed for the column itself — RLS is
      row-level, not column-level, and `representatives` already has public SELECT
      plus admin-only INSERT/UPDATE/DELETE from
      `20260528233654_add_admin_write_policies.sql`.
    - Create a public-read `representative-photos` Storage bucket. Photos are
      downloaded once (from palegis.us for PA House/Senate, curated from
      phlcouncil.com bio pages for Philadelphia City Council) and uploaded into
      this bucket rather than hotlinked, so `photo_url` always points at a URL
      this app controls.

  2. Notes
    - Storage write policies follow the same "admin write, public read" shape as
      every other admin-managed table in this app (see the checklist in
      .claude/skills/supabase-schema-change), scoped to objects in this one
      bucket via `bucket_id = 'representative-photos'`.
    - This migration is idempotent-safe to re-run: DROP POLICY IF EXISTS before
      each CREATE POLICY, ON CONFLICT DO NOTHING for the bucket insert, and
      ADD COLUMN IF NOT EXISTS for the column.
*/

-- ── COLUMN ─────────────────────────────────────────────────────────────────────

ALTER TABLE representatives ADD COLUMN IF NOT EXISTS photo_url text;

-- ── STORAGE BUCKET ───────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('representative-photos', 'representative-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can read representative photos" ON storage.objects;
CREATE POLICY "Public can read representative photos"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'representative-photos');

DROP POLICY IF EXISTS "Admins can insert representative photos" ON storage.objects;
CREATE POLICY "Admins can insert representative photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'representative-photos'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can update representative photos" ON storage.objects;
CREATE POLICY "Admins can update representative photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'representative-photos'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  )
  WITH CHECK (
    bucket_id = 'representative-photos'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can delete representative photos" ON storage.objects;
CREATE POLICY "Admins can delete representative photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'representative-photos'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  );
