// Exercises the format gate against the REAL parseSummaryIntoSections from
// src/lib/billUtils.ts (imported by format_gate.mjs, not reimplemented).
// Run with:
//   node --experimental-strip-types --test .claude/skills/generate-bill-summary/scripts/format_gate.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFormatGate } from './format_gate.mjs';

test('well-formed 4-section inline summary passes', () => {
  const r = runFormatGate('1. one 2. two 3. three 4. four');
  assert.equal(r.pass, true);
  assert.equal(r.sectionCount, 4);
  assert.deepEqual(r.sections.map((s) => s.text), ['one', 'two', 'three', 'four']);
});

test('a 5th marker is silently absorbed into section 4, not dropped or errored (verified against the real parser, per SKILL.md #5 / report §18)', () => {
  const r = runFormatGate('1. one 2. two 3. three 4. four 5. five');
  assert.equal(r.sectionCount, 4);
  assert.equal(r.pass, true); // structurally still 4 non-empty sections
  assert.match(r.sections[3].text, /four 5\. five$/); // proves absorption, not truncation
  assert.ok(r.warnings.some((w) => w.includes("'5.' marker")));
});

test('missing a section (only 3 markers) fails the gate', () => {
  const r = runFormatGate('1. one 2. two 3. three');
  assert.equal(r.pass, false);
  assert.equal(r.sectionCount, 3);
});

test('no markers at all falls back to a single section and fails the gate', () => {
  const r = runFormatGate('Just plain prose with no inline structure at all.');
  assert.equal(r.pass, false);
  assert.equal(r.sectionCount, 1);
});

test('empty/null summary fails the gate', () => {
  const r = runFormatGate(null);
  assert.equal(r.pass, false);
  assert.equal(r.sectionCount, 0);
});

test('multi-line Option B format (marker at start of its own line) also parses to 4 sections', () => {
  const r = runFormatGate('1. one\n2. two\n3. three\n4. four');
  assert.equal(r.pass, true);
  assert.equal(r.sectionCount, 4);
});

test('a marker separated from the next by only whitespace collapses (real parser quirk, empirically confirmed) and the gate correctly fails it', () => {
  // "2." followed by whitespace then "3. three" does not yield an empty
  // section 2 the way you might expect — the real regex's non-greedy
  // capture absorbs "3. three" into section 2, dropping the section count
  // to 3. This test locks in that real, observed behavior rather than an
  // assumption about it.
  const r = runFormatGate('1. one 2.    3. three 4. four');
  assert.equal(r.sectionCount, 3);
  assert.equal(r.pass, false);
});

test('word count outside 120-180 soft target produces a warning but does not itself fail a structurally valid summary', () => {
  const short = '1. a 2. b 3. c 4. d';
  const r = runFormatGate(short);
  assert.equal(r.pass, true);
  assert.ok(r.warnings.some((w) => w.includes('Word count')));
});
