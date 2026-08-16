/*
  # Add a real "generated, unreviewed" bills.status value

  1. Changes
    - Add a CHECK constraint to `bills.status` restricting it to the values
      the app actually understands: `active`, `passed`, `failed`, `tabled`,
      and a new `pending_review` value.
    - `pending_review` means "content was generated (e.g. by the
      generate-bill-summary skill) but has not yet been reviewed by a
      human" — it is deliberately distinct from `active`/`passed` so it is
      excluded from `isBillVotable` (src/lib/billUtils.ts) and from
      HomeTab's default `active`/`passed` feed filters by construction,
      without needing any code change.

  2. Notes
    - Before this migration, `bills.status` had no CHECK constraint at all
      (plain `text NOT NULL DEFAULT 'active'` since the original
      20260526183728_create_bills.sql). The generate-bill-summary skill's
      pilot run found every drafting agent independently invented a
      different ad hoc stand-in for "generated but unreviewed" (`'tabled'`
      or an undocumented `'pending_review'`) because no real value existed
      — see .claude/skills/generate-bill-summary/SKILL.md's SQL template
      notes for the reviewer-facing contract this unblocks.
    - If this fails with a check constraint violation, some existing row
      has a status value outside {active, passed, failed, tabled,
      pending_review} — inspect `SELECT DISTINCT status FROM bills;` first
      and either fix the offending rows or extend this list before
      re-running.
    - Safe to re-run: `DROP CONSTRAINT IF EXISTS` before re-adding.
*/

ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_status_check;

ALTER TABLE bills ADD CONSTRAINT bills_status_check
  CHECK (status IN ('active', 'passed', 'failed', 'tabled', 'pending_review'));
