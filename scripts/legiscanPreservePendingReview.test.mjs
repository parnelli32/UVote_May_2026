// Regression test for the pending_review-revert bug in
// supabase/functions/legiscan-sync/index.ts's syncBills: a bill whose
// `status` is currently 'pending_review' (a generated summary awaiting
// human approval, set by the generate-bill-summary skill — see that
// skill and CLAUDE.md's "No vote without context" design principle) used
// to be silently overwritten back to an active/failed status by the very
// next regular sync, because `status` was written unconditionally from
// LegiScan's own current data with no check of the row's existing DB
// status. Confirmed live in production: batch2's 25 bill-summary bills,
// synced at least once since generation, had all reverted to 'active'.
//
// legiscan-sync/index.ts is a Deno Edge Function and can't be imported
// directly under Node, so — following the pattern in
// scripts/legiscanLastAction.test.mjs, scripts/legiscanIntroducedDate.test.mjs,
// and scripts/legiscanPersonHashSkip.test.mjs — this test reads the real
// source file's text directly and asserts on its structure, so it fails
// loudly if the fix is reverted or a new unconditional-overwrite site is
// introduced.
//
// Run with:
//   node --test scripts/legiscanPreservePendingReview.test.mjs

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
  assert.ok(startIdx !== -1, `marker not found: ${signatureMarker}`);
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

const syncBillsSrc = extractFunction(
  source,
  'async function syncBills(admin: ReturnType<typeof createAdminClient>, sessionId: number, limit: number) {'
);

test('syncBills bulk-fetches existing bills.status before the per-bill loop', () => {
  assert.match(syncBillsSrc, /existingStatuses/);
  assert.match(syncBillsSrc, /\.from\('bills'\)\.select\('bill_id, status'\)/);
});

test('syncBills regular update path does not unconditionally write status: status in the payload object literal', () => {
  // The old bug wrote `status,` (shorthand) directly inside the update()
  // object literal, unconditionally. The fix must build the update payload
  // separately and only conditionally assign .status onto it.
  assert.doesNotMatch(
    syncBillsSrc,
    /\.from\('bills'\)\s*\.update\(\{\s*title: fullBill\.title,\s*summary: fullBill\.description,\s*status,/,
    'regular update payload must not include status unconditionally as an object-literal shorthand property'
  );
});

test('syncBills regular update path guards status behind a pending_review check on the existing row', () => {
  assert.match(syncBillsSrc, /existingStatuses\.get\(billId\) !== 'pending_review'/);
  assert.match(syncBillsSrc, /billUpdate\.status = status/);
});

test('syncBills orphan self-heal update path also guards status behind a pending_review check', () => {
  const selfHealMarker = "if (billErr?.code === '23505' && billErr.message?.includes('bill_number')) {";
  const selfHealSrc = extractFunction(syncBillsSrc, selfHealMarker);
  assert.match(selfHealSrc, /select\('bill_id, status'\)/, 'orphan lookup must select status alongside bill_id');
  assert.match(selfHealSrc, /existingByNumber\.status !== 'pending_review'/);
  assert.match(selfHealSrc, /orphanUpdate\.status = status/);
});

test('syncBills still refreshes non-status fields (last_action, last_status_change_at, reported_from_committee_at, source_url, pending_committee_*) unconditionally', () => {
  assert.match(syncBillsSrc, /last_action:\s*entry\.last_action/);
  assert.match(syncBillsSrc, /last_status_change_at:\s*fullBill\.status_date/);
  assert.match(syncBillsSrc, /reported_from_committee_at:\s*reportedFromCommitteeAt/);
  assert.match(syncBillsSrc, /source_url:\s*fullBill\.state_link/);
  assert.match(syncBillsSrc, /pending_committee_id:\s*fullBill\.pending_committee_id\s*\?\?\s*null/);
  assert.match(syncBillsSrc, /pending_committee_name:\s*fullBill\.committee\?\.name\s*\?\?\s*null/);
});

test('backfillCommitteeStatus does not unconditionally revert status to failed without checking for pending_review', () => {
  const backfillSrc = extractFunction(
    source,
    'async function backfillCommitteeStatus(admin: ReturnType<typeof createAdminClient>, limit: number) {'
  );
  assert.doesNotMatch(
    backfillSrc,
    /if \(diedInCommittee\) billUpdate\.status = 'failed';/,
    'the old unconditional one-liner must be replaced with a pending_review-aware guard'
  );
  assert.match(backfillSrc, /currentBill\.status !== 'pending_review'/);
});
