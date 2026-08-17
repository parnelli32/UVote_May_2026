// Focused regression test for the superseded-bill votability gate added in
// isBillVotable (src/lib/billUtils.ts). Imports the real source file
// directly via Node 22's --experimental-strip-types, the same pattern
// format_gate.mjs uses to test parseSummaryIntoSections against the live
// implementation instead of a reimplementation of it.
//
// Run with:
//   node --experimental-strip-types --test scripts/isBillVotable.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

const billUtilsUrl = new URL('../src/lib/billUtils.ts', import.meta.url);
const { isBillVotable } = await import(billUtilsUrl);

test('a superseded active bill is never votable, regardless of committee-report gate', () => {
  const base = { status: 'active', reported_from_committee_at: '2026-01-01T00:00:00Z' };
  assert.equal(isBillVotable(base, false), true, 'sanity: non-superseded active bill is votable');
  assert.equal(
    isBillVotable({ ...base, superseded_at: '2026-08-17T00:00:00Z' }, false),
    false,
    'superseded_at set must block votability even when committee-report gate is satisfied'
  );
  assert.equal(
    isBillVotable({ ...base, superseded_at: '2026-08-17T00:00:00Z' }, true),
    false,
    'superseded_at set must block votability when requiresCommitteeReport is also true'
  );
});

test('superseded_at null or absent does not affect the existing committee-report gate behavior', () => {
  const reportedOut = { status: 'active', reported_from_committee_at: '2026-01-01T00:00:00Z', superseded_at: null };
  const stillInCommittee = { status: 'active', reported_from_committee_at: null, superseded_at: null };
  const noSupersededField = { status: 'active', reported_from_committee_at: '2026-01-01T00:00:00Z' };

  assert.equal(isBillVotable(reportedOut, true), true);
  assert.equal(isBillVotable(stillInCommittee, true), false);
  assert.equal(isBillVotable(stillInCommittee, false), true);
  assert.equal(isBillVotable(noSupersededField, true), true);
});

test('a superseded but non-active bill is still correctly rejected by the status check first', () => {
  assert.equal(
    isBillVotable({ status: 'passed', superseded_at: '2026-08-17T00:00:00Z' }, false),
    false
  );
});
