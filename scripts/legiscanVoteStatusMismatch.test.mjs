// Regression test for the vote-status consistency check added to
// supabase/functions/legiscan-sync/index.ts's syncBills(): after a floor
// vote is selected via selectFloorVote(), LegiScan's own authoritative
// floorVote.passed (1/0) flag is compared against UVote's own derived
// status ('passed'/'failed', from mapLegiscanStatus + the committee-DNP
// override). A mismatch is logged to the existing error_logs table
// (action: 'legiscan_vote_status_mismatch') rather than a new column,
// alongside a console.error, matching this file's existing sync-anomaly
// logging pattern.
//
// legiscan-sync/index.ts is a Deno Edge Function (imports 'npm:...'
// specifiers and calls Deno.env.get at module scope via its imports), so it
// can't be imported directly under Node. Following the same pattern as
// scripts/legiscanIntroducedDate.test.mjs, this test extracts the real
// mismatch-check block verbatim (brace-matched, not hand-copied) from the
// live source file, wraps it in a small harness function, and executes it —
// so it exercises the actual shipped source text.
//
// Run with:
//   node --test scripts/legiscanVoteStatusMismatch.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const syncPath = path.join(__dirname, '..', 'supabase', 'functions', 'legiscan-sync', 'index.ts');
const source = readFileSync(syncPath, 'utf8');

function extractBlock(src, marker) {
  const startIdx = src.indexOf(marker);
  assert.ok(startIdx !== -1, `marker not found in legiscan-sync/index.ts: ${marker}`);
  assert.ok(marker.endsWith('{'), 'marker must end at the block\'s opening brace');
  const openBraceIdx = startIdx + marker.length - 1;
  let depth = 0;
  for (let i = openBraceIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(startIdx, i + 1);
    }
  }
  throw new Error(`unbalanced braces extracting block starting at: ${marker}`);
}

const mismatchBlockSrc = extractBlock(source, "if (status === 'passed' || status === 'failed') {");

// Wrap the extracted block in a harness function providing the same locals
// it closes over at its real call site (status, entry, floorVote, admin).
async function runMismatchCheck({ status, entry, floorVote, admin }) {
  const fnSrc = `return async function checkMismatch(status, entry, floorVote, admin) {\n${mismatchBlockSrc}\n};`;
  const fn = new Function(fnSrc)();
  return fn(status, entry, floorVote, admin);
}

function makeMockAdmin() {
  const inserted = [];
  return {
    inserted,
    from(table) {
      assert.equal(table, 'error_logs');
      return {
        insert: async (row) => {
          inserted.push(row);
          return { error: null };
        },
      };
    },
  };
}

test('source: mismatch check only runs when status resolved to passed or failed', () => {
  assert.match(source, /if \(status === 'passed' \|\| status === 'failed'\) \{/);
});

test('source: on mismatch, inserts into error_logs with the documented shape (no new column)', () => {
  assert.match(source, /action: 'legiscan_vote_status_mismatch'/);
  assert.match(source, /admin\.from\('error_logs'\)\.insert\(/);
});

test('agreement: LegiScan passed=1 and derived status=passed logs nothing', async () => {
  const admin = makeMockAdmin();
  const errors = [];
  const origError = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    await runMismatchCheck({
      status: 'passed',
      entry: { number: 'HB1', bill_id: 111 },
      floorVote: { roll_call_id: 999, passed: 1 },
      admin,
    });
  } finally {
    console.error = origError;
  }
  assert.equal(admin.inserted.length, 0);
  assert.equal(errors.length, 0);
});

test('agreement: LegiScan passed=0 and derived status=failed logs nothing', async () => {
  const admin = makeMockAdmin();
  const origError = console.error;
  console.error = () => {};
  try {
    await runMismatchCheck({
      status: 'failed',
      entry: { number: 'HB2', bill_id: 222 },
      floorVote: { roll_call_id: 998, passed: 0 },
      admin,
    });
  } finally {
    console.error = origError;
  }
  assert.equal(admin.inserted.length, 0);
});

test('mismatch: LegiScan passed=0 but derived status=passed logs one error_logs row naming both values', async () => {
  const admin = makeMockAdmin();
  const errors = [];
  const origError = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    await runMismatchCheck({
      status: 'passed',
      entry: { number: 'HB77', bill_id: 12345 },
      floorVote: { roll_call_id: 5001, passed: 0 },
      admin,
    });
  } finally {
    console.error = origError;
  }
  assert.equal(admin.inserted.length, 1);
  const row = admin.inserted[0];
  assert.equal(row.action, 'legiscan_vote_status_mismatch');
  assert.equal(row.user_id, null);
  assert.equal(row.error_code, null);
  assert.equal(row.resolved, false);
  assert.match(row.error_message, /HB77/);
  assert.match(row.error_message, /passed=0/);
  assert.match(row.error_message, /status='passed'/);
  assert.ok(errors.some((e) => e.includes('HB77')), 'also logs via console.error');
});

test('mismatch: LegiScan passed=1 but derived status=failed logs one error_logs row', async () => {
  const admin = makeMockAdmin();
  const origError = console.error;
  console.error = () => {};
  try {
    await runMismatchCheck({
      status: 'failed',
      entry: { number: 'HB324', bill_id: 67890 },
      floorVote: { roll_call_id: 5002, passed: 1 },
      admin,
    });
  } finally {
    console.error = origError;
  }
  assert.equal(admin.inserted.length, 1);
  const row = admin.inserted[0];
  assert.match(row.error_message, /HB324/);
  assert.match(row.error_message, /passed=1/);
  assert.match(row.error_message, /status='failed'/);
});
