/*
  # Gate voting to bills reported out of committee

  1. Changes
    - Add `bills.reported_from_committee_at timestamptz` (nullable, purely
      additive — the existing `status` enum's meaning is unchanged). Set by
      `supabase/functions/legiscan-sync` from LegiScan's
      `getBill().progress` array: the most recent progress event being 10
      ("Report Pass") means the bill has been reported out of committee
      favorably; event 11 ("Report DNP") means it died in committee and is
      mapped to `status = 'failed'` by the sync function instead of sitting
      in `active` forever.
    - Add `legislative_bodies.requires_committee_report boolean NOT NULL
      DEFAULT false`, set `true` for PA House and PA Senate — the two
      bodies LegiScan sync actually populates `reported_from_committee_at`
      for. Bodies that never receive this signal (Philadelphia City
      Council, whose bills are entered directly by admins and never touch
      legiscan-sync) are left `false`, so their existing/future bills stay
      votable exactly as before this gate existed — this migration must not
      silently break voting on any currently-live jurisdiction. `bills`
      without a resolvable legislative body (should not happen, but not
      relied upon) are treated the same as `false`.
    - Tighten `user_votes` INSERT/UPDATE RLS policies (`uv_insert`,
      `uv_update`) to additionally require the target bill is votable under
      the rule above, enforced server-side so a stale/shared link to a
      still-in-committee bill cannot be used to cast a vote — not just a
      client-side hide.
    - Add `bill_external_refs.committee_backfilled_at timestamptz`
      (nullable). Purely a one-time-pass completion tracker for
      legiscan-sync's `backfill` phase: distinguishes "checked this bill's
      committee status and it's genuinely still unreported" (backfilled,
      `reported_from_committee_at` stays null) from "haven't checked yet"
      (not backfilled) — without it, a still-in-committee bill would look
      identical to an unprocessed one and the backfill batch could never
      converge to 0 remaining.

  2. Notes
    - Product rationale (captain decision, not re-litigated here): committee
      is where most bills quietly die, and PA bills remain substantively
      amendable well after committee (floor amendments, concurrence,
      conference committee — only full enrollment locks the text), so
      `status = 'active'` alone is too coarse a votability signal for
      LegiScan-sourced bills.
    - Existing PA bills all have `reported_from_committee_at = null` until
      the one-time backfill (also in legiscan-sync) runs — until then every
      existing PA bill is correctly gated out of voting, which is the
      intended effect of shipping this migration ahead of the backfill,
      not a bug.
    - `bills`/`legislative_bodies`/`bill_external_refs` themselves already
      exist as of `20260809120000_create_user_districts_and_bill_external_refs.sql`
      and `20260809120100_seed_pa_house_and_senate_legislative_bodies.sql`
      (the legislative-body-switcher PR, #8) — this migration only adds the
      three new columns and the RLS gate on top of that.
*/

ALTER TABLE bills ADD COLUMN IF NOT EXISTS reported_from_committee_at timestamptz;

ALTER TABLE legislative_bodies ADD COLUMN IF NOT EXISTS requires_committee_report boolean NOT NULL DEFAULT false;

ALTER TABLE bill_external_refs ADD COLUMN IF NOT EXISTS committee_backfilled_at timestamptz;

-- PA House + PA Senate legislative_body_id values (see
-- supabase/functions/legiscan-sync/index.ts's PA_HOUSE_BODY_ID /
-- PA_SENATE_BODY_ID, and 20260809120100_seed_pa_house_and_senate_legislative_bodies.sql).
UPDATE legislative_bodies
SET requires_committee_report = true
WHERE legislative_body_id IN (
  '3b6dee71-7cbd-41f1-95d0-3f997cf035be', -- PA House
  '474bb689-6767-4a56-8429-c09c20bc715c'  -- PA Senate
);

DROP POLICY IF EXISTS "uv_insert" ON user_votes;
CREATE POLICY "uv_insert"
  ON user_votes FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM bills b
      WHERE b.bill_id = user_votes.bill_id
      AND (
        b.reported_from_committee_at IS NOT NULL
        OR NOT COALESCE(
          (SELECT lb.requires_committee_report FROM legislative_bodies lb WHERE lb.legislative_body_id = b.legislative_body_id),
          false
        )
      )
    )
  );

DROP POLICY IF EXISTS "uv_update" ON user_votes;
CREATE POLICY "uv_update"
  ON user_votes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM bills b
      WHERE b.bill_id = user_votes.bill_id
      AND (
        b.reported_from_committee_at IS NOT NULL
        OR NOT COALESCE(
          (SELECT lb.requires_committee_report FROM legislative_bodies lb WHERE lb.legislative_body_id = b.legislative_body_id),
          false
        )
      )
    )
  );
