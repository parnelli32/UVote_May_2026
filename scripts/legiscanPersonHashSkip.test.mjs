// Regression test for the person_hash change-detection optimization in
// supabase/functions/legiscan-sync/index.ts's syncPeople classification loop:
// a person whose LegiScan person_hash matches the value already stored in
// representative_external_refs must be skipped (no UPDATE queued), instead
// of the old behavior of unconditionally queuing every already-synced person
// for an update every run.
//
// legiscan-sync/index.ts is a Deno Edge Function (imports 'npm:...'
// specifiers and calls Deno.env.get at module scope via its imports), so it
// can't be imported directly under Node. Following the same pattern as
// scripts/legiscanIntroducedDate.test.mjs, this test extracts the real
// classification for-loop verbatim (brace-matched, not hand-copied) from the
// live source file and executes it — so it's exercising the actual shipped
// decision logic, not a reimplementation of it. That loop body happens to
// contain no TypeScript-only syntax, so it runs as plain JS unmodified.
//
// Run with:
//   node --test scripts/legiscanPersonHashSkip.test.mjs

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

const loopSrc = extractBlock(
  source,
  'for (const { person, bodyId, districtNumber } of validPeople) {'
);

// Confirms the exact skip condition and counter/continue shape are present
// verbatim in the extracted block (fails loudly if someone hand-edits the
// logic without updating this test's understanding of it).
assert.match(loopSrc, /existingRef\.personHash === person\.person_hash/);
assert.match(loopSrc, /repsUnchanged\+\+/);

function classify(validPeople, districtMap, repRefsMap) {
  const newRepRows = [];
  const newRepPeopleIds = [];
  const newRepPersonHashes = [];
  const existingRepUpdates = [];

  // repsUnchanged is a `let` incremented inside the real source's loop body;
  // `new Function` can't close over an outer `let` by reference the way the
  // real enclosing function does, so route the extracted `repsUnchanged++`
  // through a mutable counter object instead.
  const counter = { repsUnchanged: 0 };
  const fn = new Function(
    'validPeople',
    'districtMap',
    'repRefsMap',
    'newRepRows',
    'newRepPeopleIds',
    'newRepPersonHashes',
    'existingRepUpdates',
    'counter',
    loopSrc.replace(/repsUnchanged\+\+/g, 'counter.repsUnchanged++')
  );
  fn(validPeople, districtMap, repRefsMap, newRepRows, newRepPeopleIds, newRepPersonHashes, existingRepUpdates, counter);

  return { newRepRows, newRepPeopleIds, newRepPersonHashes, existingRepUpdates, repsUnchanged: counter.repsUnchanged };
}

const BODY_ID = 'pa-house-body-id';

test('a person whose person_hash matches the stored hash is skipped: no update queued, repsUnchanged incremented', () => {
  const person = { people_id: 111, person_hash: 'abc123', first_name: 'A', last_name: 'B', party: 'D', role: 'Rep', district: 'HD-1' };
  const validPeople = [{ person, bodyId: BODY_ID, districtNumber: '1' }];
  const districtMap = new Map([[`${BODY_ID}:1`, 'district-1']]);
  const repRefsMap = new Map([['111', { representativeId: 'rep-1', personHash: 'abc123' }]]);

  const result = classify(validPeople, districtMap, repRefsMap);

  assert.equal(result.repsUnchanged, 1);
  assert.deepEqual(result.existingRepUpdates, []);
  assert.deepEqual(result.newRepRows, []);
});

test('a person whose person_hash differs from the stored hash is queued for update, not skipped', () => {
  const person = { people_id: 222, person_hash: 'new-hash', first_name: 'C', last_name: 'D', party: 'R', role: 'Sen', district: 'SD-2' };
  const validPeople = [{ person, bodyId: BODY_ID, districtNumber: '2' }];
  const districtMap = new Map([[`${BODY_ID}:2`, 'district-2']]);
  const repRefsMap = new Map([['222', { representativeId: 'rep-2', personHash: 'old-hash' }]]);

  const result = classify(validPeople, districtMap, repRefsMap);

  assert.equal(result.repsUnchanged, 0);
  assert.equal(result.existingRepUpdates.length, 1);
  assert.equal(result.existingRepUpdates[0].representativeId, 'rep-2');
  assert.equal(result.existingRepUpdates[0].person.person_hash, 'new-hash');
  assert.deepEqual(result.newRepRows, []);
});

test('a person with no existing ref is queued as a new rep, with person_hash carried through to newRepPersonHashes', () => {
  const person = { people_id: 333, person_hash: 'brand-new-hash', first_name: 'E', last_name: 'F', party: 'D', role: 'Rep', district: 'HD-3' };
  const validPeople = [{ person, bodyId: BODY_ID, districtNumber: '3' }];
  const districtMap = new Map([[`${BODY_ID}:3`, 'district-3']]);
  const repRefsMap = new Map(); // no existing ref

  const result = classify(validPeople, districtMap, repRefsMap);

  assert.equal(result.repsUnchanged, 0);
  assert.deepEqual(result.existingRepUpdates, []);
  assert.equal(result.newRepRows.length, 1);
  assert.equal(result.newRepPeopleIds[0], 333);
  assert.equal(result.newRepPersonHashes[0], 'brand-new-hash');
});

test('a mixed batch (unchanged, changed, new) classifies each person independently with the correct total repsUnchanged count', () => {
  const unchanged = { people_id: 1, person_hash: 'h1', first_name: 'U', last_name: 'U', party: 'D', role: 'Rep', district: 'HD-1' };
  const changed = { people_id: 2, person_hash: 'h2-new', first_name: 'C', last_name: 'C', party: 'R', role: 'Rep', district: 'HD-2' };
  const brandNew = { people_id: 3, person_hash: 'h3', first_name: 'N', last_name: 'N', party: 'D', role: 'Sen', district: 'SD-3' };

  const validPeople = [
    { person: unchanged, bodyId: BODY_ID, districtNumber: '1' },
    { person: changed, bodyId: BODY_ID, districtNumber: '2' },
    { person: brandNew, bodyId: BODY_ID, districtNumber: '3' },
  ];
  const districtMap = new Map([
    [`${BODY_ID}:1`, 'district-1'],
    [`${BODY_ID}:2`, 'district-2'],
    [`${BODY_ID}:3`, 'district-3'],
  ]);
  const repRefsMap = new Map([
    ['1', { representativeId: 'rep-1', personHash: 'h1' }],
    ['2', { representativeId: 'rep-2', personHash: 'h2-old' }],
  ]);

  const result = classify(validPeople, districtMap, repRefsMap);

  assert.equal(result.repsUnchanged, 1);
  assert.equal(result.existingRepUpdates.length, 1);
  assert.equal(result.existingRepUpdates[0].representativeId, 'rep-2');
  assert.equal(result.newRepRows.length, 1);
  assert.equal(result.newRepPeopleIds[0], 3);
});
