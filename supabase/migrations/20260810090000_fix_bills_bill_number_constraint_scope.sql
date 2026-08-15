/*
  # Replace bills_bill_number_key with a body-scoped unique constraint

  1. Why
    Production carries a `bills_bill_number_key` UNIQUE constraint on
    `bill_number` ALONE — confirmed via grep to be in no migration file in
    this repo, undocumented pre-existing schema drift (same category the
    feasibility report already flagged for `bill_priorities`). It surfaced
    as a real bug: the LegiScan sync's self-heal path (see
    supabase/functions/legiscan-sync/index.ts) looks up an existing bill by
    `bill_number` alone to recover from an orphaned insert (a bill that made
    it into `bills` but not `bill_external_refs` before an abrupt
    CPU-Time-exceeded kill). A captain-caught review found that lookup is
    correct for the same-body case actually observed (HB self-collisions
    from orphaned partial runs — City Council/PA House/PA Senate bill
    numbers don't currently collide across bodies, since HB/SB prefixes are
    body-specific), but is unsafe in general: if two different legislative
    bodies ever produced a genuinely coincidental matching bill_number, a
    bill_number-only lookup would silently adopt/merge a different body's
    bill into the wrong row. The constraint itself was the wrong shape to
    begin with — this migration fixes it at the database level, not just in
    application code, so a bug in some future caller can't reintroduce the
    same corruption risk.

  2. Changes
    - Drop `bills_bill_number_key` (UNIQUE on `bill_number` alone).
    - Add `UNIQUE (legislative_body_id, bill_number)` instead — a bill
      number only needs to be unique within its own legislative body, which
      is the actual real-world invariant (each body assigns its own bill
      numbers independently).

  3. Notes
    - If this fails to apply because existing data already violates the new
      constraint (two rows with the same legislative_body_id AND
      bill_number), that's a real data integrity problem to investigate and
      clean up first — do not force it through. Unlike the At-Large
      districts case, there's no legitimate reason for that combination to
      repeat.
    - `bill_number` is nullable (per `20260602015242_add_topic_and_bill_number_to_bills.sql`,
      which added the column with no NOT NULL); a plain UNIQUE constraint in
      Postgres allows any number of NULLs (NULL is never considered equal to
      NULL for uniqueness purposes), so bills without a bill_number yet
      (e.g. hand-entered City Council bills before this integration) are
      unaffected.
*/

ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_bill_number_key;

ALTER TABLE bills
  ADD CONSTRAINT bills_legislative_body_id_bill_number_key
  UNIQUE (legislative_body_id, bill_number);
