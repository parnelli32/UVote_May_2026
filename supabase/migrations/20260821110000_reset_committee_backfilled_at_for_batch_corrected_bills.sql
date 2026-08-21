/*
  # Reset bill_external_refs.committee_backfilled_at for the 50 bills
  # deliberately skipped by the last_status_change_at backfill

  1. Changes
    - Data-only: resets `bill_external_refs.committee_backfilled_at` back to
      NULL for exactly the 50 `(bill_number, legislative_body_id)` pairs
      that `20260820121000_backfill_last_status_change_at_from_introduced_date.sql`
      deliberately left with a NULL `bills.last_status_change_at` - the 25
      bills from `20260819150000_generate_bill_summaries_batch1.sql` and the
      25 from `20260819200000_generate_bill_summaries_batch2.sql`, whose
      `introduced_date` was already hand-corrected during bill-summary
      generation, so that migration's best-effort
      `introduced_date`-as-`last_status_change_at` approximation was
      correctly skipped for them rather than guessed.
    - `committee_backfilled_at` is the resume cursor for
      `backfillCommitteeStatus` in `supabase/functions/legiscan-sync/index.ts`
      (`phase: "backfill"`): it only re-selects bills where that column is
      NULL. All 50 of these bills already have a non-null
      `committee_backfilled_at` from an earlier sync, so without this reset
      a normal `phase: "backfill"` run would skip them forever and their
      `last_status_change_at` (still NULL from the prior migration) and the
      newly added `bills.last_action` (added in
      `20260821100000_add_bills_last_action.sql`, also still NULL for every
      existing row) would never get populated. Resetting the cursor forces
      exactly these 50 bills back through the next `phase: "backfill"`
      invocation, which re-fetches `getBill()` and writes a fresh
      `last_status_change_at` and `last_action` for each, same as it does
      for every other candidate.
    - This migration does not touch `bills` directly - only the sync
      bookkeeping column that decides what gets re-fetched next.

  2. Notes
    - Legislative body ids used below (matching the values already used
      throughout this project's migrations, e.g.
      `20260820121000_backfill_last_status_change_at_from_introduced_date.sql`):
        Pennsylvania House:  3b6dee71-7cbd-41f1-95d0-3f997cf035be
        Pennsylvania Senate: 474bb689-6767-4a56-8429-c09c20bc715c
    - 35 House + 15 Senate = 50 bills total, matching the exact list
      excluded by the prior migration's `NOT (...)` clause.
    - After this migration and its schema counterpart are applied, the
      operational sequence to actually populate these 50 bills' new fields
      (deploying the updated function and invoking `phase: "backfill"`) is
      manual, captain-run work - see this change's PR description.
*/

UPDATE bill_external_refs r
SET committee_backfilled_at = NULL
FROM bills b
WHERE r.bill_id = b.bill_id
  AND r.source = 'legiscan'
  AND (
    (
      b.legislative_body_id = '3b6dee71-7cbd-41f1-95d0-3f997cf035be' -- PA House
      AND b.bill_number IN (
        'HB1127', 'HB1239', 'HB133', 'HB138', 'HB1585', 'HB2014', 'HB2037', 'HB2146',
        'HB2162', 'HB2198', 'HB2207', 'HB2224', 'HB2234', 'HB2359', 'HB2388', 'HB2437',
        'HB2455', 'HB2460', 'HB2473', 'HB2496', 'HB2499', 'HB2512', 'HB2529', 'HB2544',
        'HB2551', 'HB2555', 'HB2558', 'HB2621', 'HB2632', 'HB2644', 'HB2649', 'HB2650',
        'HB426', 'HB75', 'HB76'
      )
    )
    OR
    (
      b.legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c' -- PA Senate
      AND b.bill_number IN (
        'SB1133', 'SB1182', 'SB1183', 'SB1206', 'SB1212', 'SB1273', 'SB1303', 'SB1334',
        'SB1352', 'SB1372', 'SB1377', 'SB362', 'SB469', 'SB482', 'SB730'
      )
    )
  );
