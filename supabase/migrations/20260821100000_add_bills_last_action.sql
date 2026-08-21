/*
  # Add bills.last_action (LegiScan's human-readable description of a bill's
  # most recent legislative action)

  1. Changes
    - Add `bills.last_action text` (nullable, purely additive - no existing
      column's meaning changes). Captures LegiScan's `getBill().last_action`
      top-level field: a human-readable description of the bill's most
      recent legislative action (e.g. "Referred to Appropriations
      Committee", "Signed by Governor").
    - `bills.status` is only UVote's own coarse enum
      (`active`/`passed`/`failed`/`tabled`/`pending_review`) and
      `bills.last_status_change_at` (added in
      `20260820120000_add_bills_last_status_change_at.sql`) only captures
      WHEN the bill's status last changed, from LegiScan's `status_date`.
      Neither records WHAT actually happened. `last_action` is the natural
      companion field, giving that "what" as LegiScan's own free-text
      description. `getBill()` also exposes a separate `last_action_date`
      field, but this migration only adds a column for `last_action` itself
      (per this change's scope) - `last_status_change_at`/`status_date`
      remains the one date column tracking "when something last changed" on
      this table.
    - `supabase/functions/legiscan-sync/index.ts` is updated in the same
      change to populate this column from `fullBill.last_action` in all
      three places it already writes `last_status_change_at` (syncBills'
      update and insert payloads, and backfillCommitteeStatus's update
      payload) - at no extra API cost, since `getBill()` is already fetched
      at each site. Like `last_status_change_at`, this column is always
      overwritten on re-sync (insert, update, and backfill all write it),
      since "what happened most recently" is only meaningful when kept
      current.

  2. Notes
    - Schema + sync-population only. No existing rows are backfilled here -
      see the following migration
      (`20260821110000_reset_committee_backfilled_at_for_batch_corrected_bills.sql`)
      for how the 50 PA bills already known to need a fresh sync pick this
      up via their next real `legiscan-sync` invocation.
*/

ALTER TABLE bills ADD COLUMN IF NOT EXISTS last_action text;
