/*
  # Reset bill_external_refs.committee_backfilled_at a second time for the
  # same 50 batch-corrected bills, now that last_action reads from the
  # correct LegiScan API response

  1. Changes
    - Data-only: resets `bill_external_refs.committee_backfilled_at` back to
      NULL for the exact same 50 `(bill_number, legislative_body_id)` pairs
      as `20260821110000_reset_committee_backfilled_at_for_batch_corrected_bills.sql`.
    - That prior reset's effect has already been consumed: the captain ran
      `phase: "backfill"` against the then-deployed function, which set
      `committee_backfilled_at` back to non-null for all 50 bills again -
      but `bills.last_action` came back NULL for every one of them, because
      that deployed function read `last_action` from `getBill()`'s response
      shape (`fullBill.last_action`), which does not have that field at all
      (see `supabase/functions/legiscan-sync/index.ts`'s `syncBills` and
      `backfillCommitteeStatus` - `last_action`/`last_action_date` only
      exist on `getMasterList()`'s entry shape, per
      `supabase/functions/_shared/legiscanClient.ts`). `fullBill.last_action`
      was `undefined` at runtime, which is silently dropped from the JSON
      payload rather than raising an error, so the column was simply never
      touched.
    - Both `syncBills` and `backfillCommitteeStatus` are fixed in this same
      change to read `last_action` from the master-list entry shape instead
      (`entry.last_action` in `syncBills`, and a session-scoped
      `getMasterList()` lookup map in `backfillCommitteeStatus`, which
      previously had no master-list call in scope at all). This migration
      resets the resume cursor again so these 50 bills flow back through
      the fixed code path and actually pick up a correct `last_action`
      value, rather than being skipped forever because
      `committee_backfilled_at` is already non-null.
    - This migration does not touch `bills` directly - only the sync
      bookkeeping column that decides what gets re-fetched next.

  2. Notes
    - Legislative body ids used below (matching the values already used
      throughout this project's migrations):
        Pennsylvania House:  3b6dee71-7cbd-41f1-95d0-3f997cf035be
        Pennsylvania Senate: 474bb689-6767-4a56-8429-c09c20bc715c
    - 35 House + 15 Senate = 50 bills total, same list as the prior reset.
    - After this migration and its code counterpart are deployed, the
      operational sequence to actually populate these 50 bills' correct
      `last_action` value (redeploying the function and invoking
      `phase: "backfill"`) is manual, captain-run work - see this change's
      PR description.
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
