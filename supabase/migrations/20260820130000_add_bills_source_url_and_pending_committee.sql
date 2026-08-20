/*
  # Add bills.source_url, pending_committee_id, pending_committee_name

  1. Changes
    - Add `bills.source_url text` (nullable) - a citizen-facing "read this on
      the government's own site" link. For PA bills this is populated from
      LegiScan's `getBill().state_link` field (distinct from `getBill().url`,
      which is LegiScan's own page, not the state legislature's). One
      generic column shared by both PA bills (auto-populated from LegiScan,
      see `supabase/functions/legiscan-sync/index.ts`) and Philadelphia
      Council bills (hand-entered by an admin - separate follow-up task,
      already filed as uvote-legiscan-council-source-url-ui, blocked on this
      migration). Deliberately NOT on `bill_external_refs` - that table is
      sync-bookkeeping only, has no URL column, and Council bills never get
      a row there at all (they're never synced), which would make it
      structurally impossible for Council bills to ever have this field.
    - Add `bills.pending_committee_id integer` (nullable) - LegiScan's own
      numeric committee id, stored as-is, not FK'd to any UVote table (no
      local committees table exists). Populated from `getBill().pending_committee_id`.
    - Add `bills.pending_committee_name text` (nullable) - denormalized
      display value (e.g. "Appropriations"), populated from
      `getBill().committee.name`. Does not include chamber in the name
      itself - chamber prefixing, if ever needed, is a render-time concern,
      not stored redundantly here.
    - This tracks the bill's *current* committee across chamber crossover
      (live-verified: a bill that passed the House and was re-referred to
      the Senate had its `committee`/`pending_committee_id` update to the
      Senate's committee) - a genuine complement to the existing
      `reported_from_committee_at` (a one-way "cleared committee at least
      once" timestamp), not a duplicate of it.
    - `supabase/functions/_shared/legiscanClient.ts` and
      `supabase/functions/legiscan-sync/index.ts` are updated in the same
      change to populate these columns going forward (both the regular
      insert/update sync path and the one-time `backfillCommitteeStatus()`
      pass, which already re-fetches `getBill()` once per already-synced
      bill for the committee-report gate, so this is zero extra API cost).

  2. Notes
    - No new RLS policies needed - these are new columns on an existing
      table, already covered by `bills`'s existing admin write / public
      read policies.
    - Schema + sync-population only. No UI change in this task - the
      Council admin form field and any citizen-facing render of
      `source_url` are separate follow-up tasks.
*/

ALTER TABLE bills ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS pending_committee_id integer;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS pending_committee_name text;
