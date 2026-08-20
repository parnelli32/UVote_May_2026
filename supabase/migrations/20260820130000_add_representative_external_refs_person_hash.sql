/*
  # Add representative_external_refs.person_hash (LegiScan sync change detection)

  1. Why
    `20260809120200_create_representative_external_refs.sql` created this
    table with only `representative_id, source, external_people_id,
    last_synced_at` — no hash column, unlike `bill_external_refs.change_hash`
    which already exists for exactly this purpose on the bills side (see
    `20260809120000_create_user_districts_and_bill_external_refs.sql`).
    Without it, every `legiscan-sync` `phase: "people"` run issues an
    unconditional `UPDATE` for all ~260 PA House/Senate representatives even
    when LegiScan's own record for that person hasn't changed since the
    last sync, because there was no stored value to compare against.

    LegiScan's `getSessionPeople` response includes a `person_hash` field per
    person specifically for this purpose — a short hash that changes only
    when LegiScan's own record for that person changes. Per
    `/Users/ianparnell/firstmate/data/uvote-legiscan-capture-plan/report.md`
    section 6, storing it lets `supabase/functions/legiscan-sync/index.ts`
    skip a person's `UPDATE` entirely when `person_hash` matches the stored
    value, turning most `repsUpdated` counts near-zero on a typical sync
    where nothing changed — the same pattern `change_hash` already gives
    bills.

  2. Changes
    - Add `representative_external_refs.person_hash text` (nullable, purely
      additive — no existing column's meaning changes).
    - `supabase/functions/legiscan-sync/index.ts` is updated in the same
      change to populate and compare this column.

  3. Notes
    - Pure sync-internal optimization: no product-facing field, no UI
      change, no citizen ever sees this column.
*/

ALTER TABLE representative_external_refs ADD COLUMN IF NOT EXISTS person_hash text;
