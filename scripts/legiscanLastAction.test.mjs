// Regression test for the last_action data-mapping bug fixed in
// supabase/functions/legiscan-sync/index.ts: `last_action`/`last_action_date`
// only exist on getMasterList()'s entry shape (LegiscanMasterListEntry in
// supabase/functions/_shared/legiscanClient.ts), not on getBill()'s
// (LegiscanBill has no such field). The original code wrote
// `last_action: fullBill.last_action` in three places — `fullBill` comes
// from getBill(), so that property was `undefined` at runtime, and an
// `undefined` value is silently dropped from the JSON payload sent to
// Supabase rather than raising an error, so bills.last_action was never
// actually written by any of the three sites.
//
// legiscan-sync/index.ts is a Deno Edge Function (imports 'npm:...'
// specifiers and calls Deno.env.get at module scope via its imports), so it
// can't be imported directly under Node. Following the same pattern as
// scripts/legiscanIntroducedDate.test.mjs and
// scripts/legiscanPersonHashSkip.test.mjs, this test reads the real source
// file's text directly and asserts on it, rather than reimplementing the
// logic — so it fails loudly if someone reverts the fix or reintroduces the
// bug at a new call site.
//
// Run with:
//   node --test scripts/legiscanLastAction.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const syncPath = path.join(__dirname, '..', 'supabase', 'functions', 'legiscan-sync', 'index.ts');
const source = readFileSync(syncPath, 'utf8');

const clientPath = path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'legiscanClient.ts');
const clientSource = readFileSync(clientPath, 'utf8');

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

test('LegiscanBill (getBill response shape) does not declare last_action/last_action_date', () => {
  const billTypeSrc = extractFunction(clientSource, 'export type LegiscanBill = {');
  assert.doesNotMatch(billTypeSrc, /\blast_action\b/);
});

test('LegiscanMasterListEntry (getMasterList response shape) declares last_action/last_action_date', () => {
  const entryTypeSrc = extractFunction(clientSource, 'export type LegiscanMasterListEntry = {');
  assert.match(entryTypeSrc, /\blast_action:\s*string;/);
  assert.match(entryTypeSrc, /\blast_action_date:\s*string;/);
});

test('no write site in legiscan-sync/index.ts reads last_action off fullBill (the getBill result)', () => {
  assert.doesNotMatch(source, /last_action:\s*fullBill\.last_action/);
});

test('syncBills reads last_action from entry (the getMasterList result), in both the update and insert payloads', () => {
  const syncBillsSrc = extractFunction(
    source,
    'async function syncBills(admin: ReturnType<typeof createAdminClient>, sessionId: number, limit: number) {'
  );
  const occurrences = syncBillsSrc.match(/last_action:\s*entry\.last_action/g) ?? [];
  assert.equal(occurrences.length, 2, 'expected exactly two last_action: entry.last_action writes (update + insert)');
});

test('backfillCommitteeStatus fetches getMasterList once per invocation, before the per-candidate loop, not inside it', () => {
  const backfillSrc = extractFunction(
    source,
    'async function backfillCommitteeStatus(admin: ReturnType<typeof createAdminClient>, limit: number) {'
  );
  const loopSrc = extractFunction(backfillSrc, 'for (const ref of candidates ?? []) {');
  const beforeLoop = backfillSrc.slice(0, backfillSrc.indexOf(loopSrc));

  assert.match(beforeLoop, /getSessionList\('PA'\)/);
  assert.match(beforeLoop, /getMasterList\(currentSession\.session_id\)/);
  assert.doesNotMatch(loopSrc, /getMasterList/, 'getMasterList must not be called per-candidate inside the loop');
});

test('backfillCommitteeStatus looks up last_action from a master-list map keyed by String(bill_id), falling back to null when a candidate is not found', () => {
  const backfillSrc = extractFunction(
    source,
    'async function backfillCommitteeStatus(admin: ReturnType<typeof createAdminClient>, limit: number) {'
  );
  assert.match(backfillSrc, /masterListByBillId\.set\(String\(entry\.bill_id\), entry\)/);
  assert.match(backfillSrc, /masterListByBillId\.get\(ref\.external_bill_id\)/);
  assert.match(backfillSrc, /last_action:\s*masterListEntry\?\.last_action\s*\?\?\s*null/);
});
