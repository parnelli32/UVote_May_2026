/*
  # Add sponsor_order to bill_sponsors

  1. Changes
    - `bill_sponsors`: add `sponsor_order` (integer, nullable) so co-sponsors
      can be ranked in the order LegiScan reports them, sourced from
      `sponsors[].sponsor_order` in LegiScan's getBill response.

  2. Notes
    - Nullable and unpopulated for Council bills (built from the admin form's
      `cosponsor_ids` array, which has no ordering concept) — same pattern as
      every other LegiScan-only column on this table.
    - No RLS changes: bill_sponsors' existing SELECT/write policies are
      row-level, not column-level, and already cover this new column.
*/

ALTER TABLE bill_sponsors
ADD COLUMN IF NOT EXISTS sponsor_order integer;
