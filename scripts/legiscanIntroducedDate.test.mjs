// Regression test for the introduced_date data-mapping bug fixed in
// supabase/functions/legiscan-sync/index.ts: the insert path used to write
// entry.status_date (the date of a bill's LATEST status change) as
// bills.introduced_date, instead of the bill's true introduction date.
// Confirmed against real HB77/HB324 data (uvote-bill-summary-confirmation-
// pilot report, Finding 3) — see this test's fixtures below.
//
// legiscan-sync/index.ts is a Deno Edge Function (imports 'npm:...'
// specifiers and calls Deno.env.get at module scope via its imports), so it
// can't be imported directly under Node the way scripts/format_gate.mjs
// imports billUtils.ts. Instead, following the same pattern as
// scripts/homeTabStatusFilterConsistency.test.mjs, this test extracts the
// real getIntroducedDate function verbatim (brace-matched, not hand-copied)
// from the live source file and executes it — so it's exercising the actual
// shipped source text, not a reimplementation of it.
//
// Run with:
//   node --test scripts/legiscanIntroducedDate.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const syncPath = path.join(__dirname, '..', 'supabase', 'functions', 'legiscan-sync', 'index.ts');
const source = readFileSync(syncPath, 'utf8');

function extractFunction(src, signatureMarker) {
  const startIdx = src.indexOf(signatureMarker);
  assert.ok(startIdx !== -1, `marker not found in legiscan-sync/index.ts: ${signatureMarker}`);
  assert.ok(signatureMarker.endsWith('{'), 'signatureMarker must end at the function body\'s opening brace');
  const openBraceIdx = startIdx + signatureMarker.length - 1;
  let depth = 0;
  for (let i = openBraceIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(startIdx, i + 1);
    }
  }
  throw new Error(`unbalanced braces extracting function starting at: ${signatureMarker}`);
}

const introducedDateFnSrc = extractFunction(
  source,
  'function getIntroducedDate(progress: { date: string; event: number }[] | undefined): string | null {'
);

// Strip the TypeScript return-type annotation so `new Function` (plain JS) can eval it.
const jsFnSrc = introducedDateFnSrc.replace(
  'function getIntroducedDate(progress: { date: string; event: number }[] | undefined): string | null {',
  'function getIntroducedDate(progress) {'
);

function getIntroducedDate(progress) {
  const fn = new Function(`${jsFnSrc}\nreturn getIntroducedDate;`)();
  return fn(progress);
}

// Confirms the call site itself was switched from entry.status_date to
// getIntroducedDate(fullBill.progress) on the insert path, and that
// introduced_date is still absent from the update path (so a later re-sync
// never overwrites an already-set introduced_date).
test('syncBills insert path derives introduced_date from getIntroducedDate(fullBill.progress), not entry.status_date', () => {
  assert.match(source, /introduced_date:\s*getIntroducedDate\(fullBill\.progress\)/);
  assert.doesNotMatch(source, /introduced_date:\s*entry\.status_date/);
});

test('real HB77 data: returns the true 2025-01-10 introduction date, not the 2025-02-05 House floor final-passage date that status_date carried', () => {
  const hb77Progress = [
    { date: '2025-01-10', event: 1 }, // Introduced
    { date: '2025-01-28', event: 9 }, // Committee referral
    { date: '2025-01-29', event: 10 }, // Reported from committee (20-6)
    { date: '2025-02-05', event: 3 }, // House floor final passage (150-52) — old buggy status_date
  ];
  assert.equal(getIntroducedDate(hb77Progress), '2025-01-10');
});

test('real HB324 data: returns the true 2025-01-27 introduction date, not the 2025-02-06 Governor-signing/Act date that status_date carried', () => {
  const hb324Progress = [
    { date: '2025-01-27', event: 1 }, // Introduced
    { date: '2025-01-29', event: 10 }, // Reported from committee (20-6)
    { date: '2025-02-03', event: 3 }, // House floor passage (161-41)
    { date: '2025-02-06', event: 4 }, // Governor signed, became Act 1 of 2025 — old buggy status_date
  ];
  assert.equal(getIntroducedDate(hb324Progress), '2025-01-27');
});

test('a bill with no progress past introduction still resolves correctly (introduction is both earliest and latest event)', () => {
  assert.equal(getIntroducedDate([{ date: '2025-03-01', event: 1 }]), '2025-03-01');
});

test('missing/empty progress returns null rather than throwing', () => {
  assert.equal(getIntroducedDate(undefined), null);
  assert.equal(getIntroducedDate([]), null);
});

test('progress with no event 1 (introduction event not present) returns null', () => {
  assert.equal(getIntroducedDate([{ date: '2025-01-29', event: 10 }]), null);
});
