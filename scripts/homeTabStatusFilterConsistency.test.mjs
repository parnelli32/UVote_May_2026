// Regression test for the round-1 finding fixed in commit 972ee05: HomeTab's
// buildQuery() (the bill list) and loadStatusOnlyCount() (the empty-state decision)
// must apply the exact same bills.status filtering, or a body with only
// pending_review bills renders the misleading "Clear filters" empty state instead
// of "No active bills right now".
//
// HomeTab.tsx is a JSX/TSX React component, so it can't be imported directly with
// Node's --experimental-strip-types (that only strips types, it doesn't do JSX
// transform) the way scripts/format_gate.mjs imports billUtils.ts. Instead this
// test extracts the two real if/else-if/else status-filter blocks verbatim from
// the live source file (brace-matched, not hand-copied) and executes each against
// a recording mock query builder — so it's exercising the actual shipped source
// text, not a reimplementation of it.
//
// Run with:
//   node --test scripts/homeTabStatusFilterConsistency.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const homeTabPath = path.join(__dirname, '..', 'src', 'pages', 'HomeTab.tsx');
const source = readFileSync(homeTabPath, 'utf8');

function extractOneBraceBlock(src, fromIdx) {
  const openBraceIdx = src.indexOf('{', fromIdx);
  let depth = 0;
  for (let i = openBraceIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`unbalanced braces extracting block starting at: ${src.slice(fromIdx, fromIdx + 40)}`);
}

// Extracts a full if/else-if/else chain starting at `startMarker`, following
// trailing "} else ... {" continuations so the whole chain (not just the first
// `if` block) is captured.
function extractBraceMatchedBlock(src, startMarker) {
  const startIdx = src.indexOf(startMarker);
  assert.ok(startIdx !== -1, `marker not found in HomeTab.tsx: ${startMarker}`);
  let endIdx = extractOneBraceBlock(src, startIdx);
  while (true) {
    const elseMatch = /^\s*else\b/.exec(src.slice(endIdx + 1));
    if (!elseMatch) break;
    const elseKeywordIdx = endIdx + 1 + elseMatch[0].indexOf('else');
    endIdx = extractOneBraceBlock(src, elseKeywordIdx);
  }
  return src.slice(startIdx, endIdx + 1);
}

// buildQuery's status branch (feeds the actual bill list query)
const buildQueryBlock = extractBraceMatchedBlock(source, "if (statusFilter === 'active') {");
// loadStatusOnlyCount's status branch (feeds the empty-state decision)
const allBlocks = [];
{
  let searchFrom = 0;
  while (true) {
    const idx = source.indexOf("if (statusFilter === 'active') {", searchFrom);
    if (idx === -1) break;
    allBlocks.push(extractBraceMatchedBlock(source, source.slice(idx)));
    searchFrom = idx + 1;
  }
}
assert.equal(allBlocks.length, 2, 'expected exactly two status-filter branches in HomeTab.tsx (buildQuery + loadStatusOnlyCount)');
const [, statusOnlyBlock] = allBlocks;
assert.equal(buildQueryBlock, allBlocks[0]);

function makeMockQuery() {
  const calls = [];
  const q = {
    eq: (...args) => { calls.push(['eq', ...args]); return q; },
    neq: (...args) => { calls.push(['neq', ...args]); return q; },
    not: (...args) => { calls.push(['not', ...args]); return q; },
  };
  q.__calls = calls;
  return q;
}

function runBlock(block, statusFilter, requiresCommitteeReport) {
  const q = makeMockQuery();
   
  const fn = new Function('statusFilter', 'requiresCommitteeReport', 'q', `${block}\nreturn q;`);
  fn(statusFilter, requiresCommitteeReport, q);
  return q.__calls;
}

test("statusFilter='all': buildQuery and loadStatusOnlyCount both exclude pending_review", () => {
  const listCalls = runBlock(buildQueryBlock, 'all', false);
  const countCalls = runBlock(statusOnlyBlock, 'all', false);
  assert.deepEqual(listCalls, [['neq', 'status', 'pending_review']]);
  assert.deepEqual(countCalls, [['neq', 'status', 'pending_review']]);
  assert.deepEqual(listCalls, countCalls, 'list query and status-only count query must apply identical status filtering');
});

test("statusFilter='active': both branches match on active status (and committee gate when required)", () => {
  for (const requiresCommitteeReport of [false, true]) {
    const listCalls = runBlock(buildQueryBlock, 'active', requiresCommitteeReport);
    const countCalls = runBlock(statusOnlyBlock, 'active', requiresCommitteeReport);
    assert.deepEqual(listCalls, countCalls);
  }
});

test("statusFilter='passed': both branches match on passed status only", () => {
  const listCalls = runBlock(buildQueryBlock, 'passed', false);
  const countCalls = runBlock(statusOnlyBlock, 'passed', false);
  assert.deepEqual(listCalls, [['eq', 'status', 'passed']]);
  assert.deepEqual(listCalls, countCalls);
});
