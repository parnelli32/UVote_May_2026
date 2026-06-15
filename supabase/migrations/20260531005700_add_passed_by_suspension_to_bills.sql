/*
  # Add passed_by_suspension flag to bills

  1. Modified Tables
    - `bills`
      - Added `passed_by_suspension` (boolean, NOT NULL, DEFAULT false)
        Marks bills that were passed by suspension of normal voting rules,
        meaning no individual member votes were recorded for these bills.

  2. Notes
    - All existing bills default to false — no data is affected.
    - No RLS changes required (bills table policies unchanged).
*/

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS passed_by_suspension BOOLEAN NOT NULL DEFAULT false;
