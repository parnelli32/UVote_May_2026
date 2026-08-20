/*
  # Backfill bills.last_status_change_at from the pre-fix introduced_date value

  1. Changes
    - Data-only: populates `bills.last_status_change_at` (added, still
      all-null, by `20260820120000_add_bills_last_status_change_at.sql`)
      for existing PA House/Senate bills whose `introduced_date` was never
      corrected to a true introduction date.
    - Per the INTRODUCED-DATE BUG documented in
      `supabase/functions/legiscan-sync/index.ts`, the original sync code
      wrote LegiScan's `status_date` into `introduced_date` for every bill.
      For any bill that has NOT since had its `introduced_date` corrected,
      the CURRENT `introduced_date` value already equals what LegiScan's
      `status_date` was at last sync - that's exactly what the bug
      produced. Copying it into `last_status_change_at` is therefore a
      real, evidenced backfill, not a guess.
    - Scoped to `legislative_body_id IN (PA House, PA Senate)` - the only
      bodies LegiScan sync ever populates (Philadelphia City Council bills
      are entered directly by admins, never touch legiscan-sync, and their
      `introduced_date` has no relationship to any LegiScan `status_date`).
    - Excludes the 50 PA bills whose `introduced_date` has already been
      corrected to a real, distinct introduction date during bill-summary
      generation: the 25 bills in
      `20260819150000_generate_bill_summaries_batch1.sql` and the 25 bills
      in `20260819200000_generate_bill_summaries_batch2.sql` (see each
      migration's own header for its exact bill list and sourcing). For
      those 50, `last_status_change_at` is intentionally left NULL here
      rather than guessed - the next real `legiscan-sync` invocation that
      touches one of them re-populates it with a fresh, accurate value
      from that sync's own `fullBill.status_date`, which is the only
      trustworthy source now that `introduced_date` no longer doubles as a
      stand-in for it.
    - Legislative body ids used below (matching the values already used by
      `20260817100000_backfill_superseded_bills_from_log.sql` and
      `20260815100000_add_bills_reported_from_committee_at_and_vote_gate.sql`):
        Pennsylvania Senate: 474bb689-6767-4a56-8429-c09c20bc715c
        Pennsylvania House:  3b6dee71-7cbd-41f1-95d0-3f997cf035be

  2. Live counts at authoring time (2026-08-20, queried via anon key
     against `bills`, which is publicly readable)
    - 3,951 total PA House/Senate bills, all with non-null `introduced_date`.
    - All 50 excluded bill numbers below were confirmed present live with
      their expected `legislative_body_id` (35 House + 15 Senate).
    - Expected effect: 3,901 bills get a non-NULL `last_status_change_at`;
      the 50 excluded bills are left NULL pending their next real sync.
*/

UPDATE bills b
SET last_status_change_at = b.introduced_date
WHERE b.introduced_date IS NOT NULL
  AND b.legislative_body_id IN (
    '3b6dee71-7cbd-41f1-95d0-3f997cf035be', -- PA House
    '474bb689-6767-4a56-8429-c09c20bc715c'  -- PA Senate
  )
  AND NOT (
    (
      b.legislative_body_id = '3b6dee71-7cbd-41f1-95d0-3f997cf035be' -- PA House
      AND b.bill_number IN (
        -- batch1 (20260819150000_generate_bill_summaries_batch1.sql), 16 House bills
        'HB1239', 'HB2014', 'HB2037', 'HB2146', 'HB2198', 'HB2359', 'HB2388', 'HB2437',
        'HB2455', 'HB2460', 'HB2496', 'HB2499', 'HB2512', 'HB2529', 'HB2558', 'HB2644',
        -- batch2 (20260819200000_generate_bill_summaries_batch2.sql), 19 House bills
        'HB1127', 'HB133', 'HB138', 'HB1585', 'HB2162', 'HB2207', 'HB2224', 'HB2234',
        'HB2473', 'HB2544', 'HB2551', 'HB2555', 'HB2621', 'HB2632', 'HB2649', 'HB2650',
        'HB426', 'HB75', 'HB76'
      )
    )
    OR
    (
      b.legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c' -- PA Senate
      AND b.bill_number IN (
        -- batch1 (20260819150000_generate_bill_summaries_batch1.sql), 9 Senate bills
        'SB1133', 'SB1182', 'SB1206', 'SB1212', 'SB1273', 'SB1303', 'SB1334', 'SB1372', 'SB482',
        -- batch2 (20260819200000_generate_bill_summaries_batch2.sql), 6 Senate bills
        'SB1183', 'SB1352', 'SB1377', 'SB362', 'SB469', 'SB730'
      )
    )
  );
