// Regression test for parseSummaryIntoSections / splitSummaryCoreAndDetail
// (src/lib/billUtils.ts) covering the 5th "Key Question(s)" section added
// alongside the original four-part summary format. Imports the real source
// file directly via Node 22's --experimental-strip-types, the same pattern
// isBillVotable.test.mjs and format_gate.mjs use to test against the live
// implementation instead of a reimplementation of it.
//
// Run with:
//   node --experimental-strip-types --test scripts/billUtilsSections.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

const billUtilsUrl = new URL('../src/lib/billUtils.ts', import.meta.url);
const { parseSummaryIntoSections, splitSummaryCoreAndDetail } = await import(billUtilsUrl);

test('a well-formed 5-section summary parses correctly with a singular Key question label', () => {
  const summary = '1. one 2. two 3. three 4. four 5. Is this the right tradeoff?';
  const sections = parseSummaryIntoSections(summary);
  assert.equal(sections.length, 5);
  assert.deepEqual(sections.map((s) => s.text), [
    'one',
    'two',
    'three',
    'four',
    'Is this the right tradeoff?',
  ]);
  assert.equal(sections[0].label, 'What this bill does');
  assert.equal(sections[1].label, 'Who it affects');
  assert.equal(sections[2].label, 'If it passes');
  assert.equal(sections[3].label, "If it doesn't pass");
  assert.equal(sections[4].label, 'Key question');
});

test('a well-formed 5-section summary with multiple questions gets a plural Key questions label', () => {
  const summary = '1. one 2. two 3. three 4. four 5. Is A the right call? Does B outweigh the cost?';
  const sections = parseSummaryIntoSections(summary);
  assert.equal(sections.length, 5);
  assert.equal(sections[4].label, 'Key questions');
  assert.equal(sections[4].text, 'Is A the right call? Does B outweigh the cost?');
});

test('a legacy 4-section summary (no 5th marker) parses exactly as it did before this change', () => {
  const summary = '1. one 2. two 3. three 4. four';
  const sections = parseSummaryIntoSections(summary);
  assert.equal(sections.length, 4);
  assert.deepEqual(sections.map((s) => s.text), ['one', 'two', 'three', 'four']);
  assert.deepEqual(sections.map((s) => s.label), [
    'What this bill does',
    'Who it affects',
    'If it passes',
    "If it doesn't pass",
  ]);
});

test('a legacy multi-line 4-section summary also parses unaffected', () => {
  const summary = '1. one\n2. two\n3. three\n4. four';
  const sections = parseSummaryIntoSections(summary);
  assert.equal(sections.length, 4);
  assert.deepEqual(sections.map((s) => s.label), [
    'What this bill does',
    'Who it affects',
    'If it passes',
    "If it doesn't pass",
  ]);
});

test('[[READ MORE]] splits after the 5th section, not the 4th', () => {
  const core = '1. one 2. two 3. three 4. four 5. Is this fair?';
  const detail = 'Extra itemized appropriations detail.';
  const full = `${core} [[READ MORE]] ${detail}`;
  const { core: splitCore, detail: splitDetail } = splitSummaryCoreAndDetail(full);
  assert.equal(splitCore, core);
  assert.equal(splitDetail, detail);

  const sections = parseSummaryIntoSections(splitCore);
  assert.equal(sections.length, 5);
  assert.equal(sections[4].text, 'Is this fair?');
  // The detail text must never leak into section 4 or 5.
  assert.ok(!sections[3].text.includes('Extra itemized'));
  assert.ok(!sections[4].text.includes('Extra itemized'));
});

test('a stray 6. marker does not corrupt section 5 — it is absorbed into section 5 text, matching the real parser\'s established behavior for an out-of-range marker', () => {
  const summary = '1. one 2. two 3. three 4. four 5. Is this fair? 6. six';
  const sections = parseSummaryIntoSections(summary);
  assert.equal(sections.length, 5);
  assert.match(sections[4].text, /^Is this fair\? 6\. six$/);
  // Sections 1-4 must remain untouched by the stray marker.
  assert.equal(sections[0].text, 'one');
  assert.equal(sections[1].text, 'two');
  assert.equal(sections[2].text, 'three');
  assert.equal(sections[3].text, 'four');
});

test('a summary with no marker at all still falls back to a single section under "What this bill does"', () => {
  const sections = parseSummaryIntoSections('Just plain prose, no structure.');
  assert.equal(sections.length, 1);
  assert.equal(sections[0].label, 'What this bill does');
});

test('splitSummaryCoreAndDetail with no marker treats the whole 5-section string as core', () => {
  const summary = '1. one 2. two 3. three 4. four 5. Is this fair?';
  const { core, detail } = splitSummaryCoreAndDetail(summary);
  assert.equal(core, summary);
  assert.equal(detail, null);
  const sections = parseSummaryIntoSections(core);
  assert.equal(sections.length, 5);
});
