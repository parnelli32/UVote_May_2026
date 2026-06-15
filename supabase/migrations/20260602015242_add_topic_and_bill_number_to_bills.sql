/*
  # Add topic and bill_number columns to bills table

  1. Modified Tables
    - `bills`
      - `topic` (text, nullable) — predefined topic category for the bill
      - `bill_number` (text, nullable) — official bill number (e.g. "250341")

  2. Notes
    - Both columns are nullable; existing bills are unaffected
    - No RLS policy changes
    - Uses IF NOT EXISTS to be safe if either column already exists
*/

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS topic text;

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS bill_number text;
