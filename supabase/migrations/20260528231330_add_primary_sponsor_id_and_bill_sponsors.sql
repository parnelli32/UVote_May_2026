/*
  # Add structured sponsor references to bills

  1. Schema changes
    - `bills`: add `primary_sponsor_id` (uuid, nullable FK to representatives)
    - New table `bill_sponsors`: junction table linking bills to representatives
      with a `sponsor_type` of 'primary' or 'cosponsor'

  2. Data migration
    - Populate `primary_sponsor_id` on bills by case-insensitive name match against representatives
    - Backfill `bill_sponsors` with one 'primary' row per matched bill

  3. Security
    - Enable RLS on `bill_sponsors`
    - Public read policy for authenticated users
    - Admin write policy (insert/update/delete) checked via users.is_admin
*/

-- STEP 1: Add primary_sponsor_id to bills
ALTER TABLE bills
ADD COLUMN IF NOT EXISTS primary_sponsor_id uuid
  REFERENCES representatives(representative_id)
  ON DELETE SET NULL;

-- STEP 2: Create bill_sponsors junction table
CREATE TABLE IF NOT EXISTS bill_sponsors (
  bill_sponsor_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL REFERENCES bills(bill_id) ON DELETE CASCADE,
  representative_id uuid NOT NULL REFERENCES representatives(representative_id) ON DELETE CASCADE,
  sponsor_type text NOT NULL DEFAULT 'cosponsor'
    CHECK (sponsor_type IN ('primary', 'cosponsor')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (bill_id, representative_id)
);

ALTER TABLE bill_sponsors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_read_bill_sponsors"
  ON bill_sponsors FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin_write_bill_sponsors"
  ON bill_sponsors FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  );

-- STEP 3: Migrate existing primary_sponsor text data to primary_sponsor_id
UPDATE bills b
SET primary_sponsor_id = r.representative_id
FROM representatives r
WHERE LOWER(TRIM(b.primary_sponsor)) = LOWER(TRIM(CONCAT(r.first_name, ' ', r.last_name)))
AND b.primary_sponsor IS NOT NULL
AND b.primary_sponsor_id IS NULL;

-- Backfill bill_sponsors for each matched bill
INSERT INTO bill_sponsors (bill_id, representative_id, sponsor_type)
SELECT b.bill_id, b.primary_sponsor_id, 'primary'
FROM bills b
WHERE b.primary_sponsor_id IS NOT NULL
ON CONFLICT (bill_id, representative_id) DO NOTHING;
