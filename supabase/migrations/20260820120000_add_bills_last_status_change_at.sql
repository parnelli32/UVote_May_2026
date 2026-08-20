/*
  # Add bills.last_status_change_at (LegiScan's status_date, captured on its own)

  1. Changes
    - Add `bills.last_status_change_at timestamptz` (nullable, purely
      additive - no existing column's meaning changes). Captures LegiScan's
      `getBill().status_date` top-level field: the date of a bill's most
      recent status change (floor passage, committee action, Act-signing,
      etc.), independent of `introduced_date`.
    - This is a NEW data point, not a fix to `introduced_date`. Per
      `supabase/functions/legiscan-sync/index.ts`'s "INTRODUCED-DATE BUG"
      header comment, the original sync code wrote `status_date` into
      `introduced_date` by mistake; `getIntroducedDate()` now correctly
      reads the true introduction date from `progress` array event 1
      instead. `status_date` itself was never wrong, it was just discarded
      once it stopped being (mis)used for `introduced_date` - this column
      captures it honestly instead, since "what changed most recently" is
      independently useful (e.g. surfacing bills actively moving through
      committee/floor action right now).
    - `supabase/functions/legiscan-sync/index.ts` is updated in the same
      change to populate this column from `fullBill.status_date` on every
      sync, both insert and update paths. Unlike `introduced_date`
      (intentionally insert-only - never overwritten so a later run can't
      clobber a since-corrected value), this column is always overwritten
      on re-sync, since "most recently changed" is only meaningful when
      kept current.

  2. Notes
    - This migration is schema + sync-population only. Backfilling
      existing rows is separate work, done in the following migration
      (`20260820121000_backfill_last_status_change_at_from_introduced_date.sql`).
    - The broader `introduced_date` correctness backfill across the full
      bill table remains a separate, already-flagged captain decision (see
      CLAUDE.md's "LegiScan sync + committee vote gate" section) - out of
      scope here and untouched by this change.
*/

ALTER TABLE bills ADD COLUMN IF NOT EXISTS last_status_change_at timestamptz;
