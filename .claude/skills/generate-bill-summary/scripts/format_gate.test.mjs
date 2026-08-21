// Exercises the format gate against the REAL parseSummaryIntoSections from
// src/lib/billUtils.ts (imported by format_gate.mjs, not reimplemented).
// Run with:
//   node --experimental-strip-types --test .claude/skills/generate-bill-summary/scripts/format_gate.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFormatGate } from './format_gate.mjs';

test('well-formed 5-section inline summary passes', () => {
  const r = runFormatGate('1. one 2. two 3. three 4. four 5. Is this a fair question?');
  assert.equal(r.pass, true);
  assert.equal(r.sectionCount, 5);
  assert.deepEqual(r.sections.map((s) => s.text), [
    'one',
    'two',
    'three',
    'four',
    'Is this a fair question?',
  ]);
  assert.equal(r.sections[4].label, 'Key question');
});

test('a 6th marker is silently absorbed into section 5, not dropped or errored (mirrors the previous 4-section parser\'s 5-marker behavior)', () => {
  const r = runFormatGate('1. one 2. two 3. three 4. four 5. Is this fair? 6. six');
  assert.equal(r.sectionCount, 5);
  assert.equal(r.pass, true); // structurally still 5 non-empty sections
  assert.match(r.sections[4].text, /fair\? 6\. six$/); // proves absorption, not truncation
  assert.ok(r.warnings.some((w) => w.includes("'6.' marker")));
});

test('missing a section (only 4 markers) fails the gate', () => {
  const r = runFormatGate('1. one 2. two 3. three 4. four');
  assert.equal(r.pass, false);
  assert.equal(r.sectionCount, 4);
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

test('multi-line Option B format (marker at start of its own line) also parses to 5 sections', () => {
  const r = runFormatGate('1. one\n2. two\n3. three\n4. four\n5. Is this fair?');
  assert.equal(r.pass, true);
  assert.equal(r.sectionCount, 5);
  assert.equal(r.sections[4].label, 'Key question');
});

test('a marker separated from the next by only whitespace collapses (real parser quirk, empirically confirmed) and the gate correctly fails it', () => {
  // "2." followed by whitespace then "3. three" does not yield an empty
  // section 2 the way you might expect — the real regex's non-greedy
  // capture absorbs "3. three" into section 2, dropping the section count
  // to 4. This test locks in that real, observed behavior rather than an
  // assumption about it.
  const r = runFormatGate('1. one 2.    3. three 4. four 5. Is this fair?');
  assert.equal(r.sectionCount, 4);
  assert.equal(r.pass, false);
});

test('word count outside 120-180 soft target produces a warning but does not itself fail a structurally valid summary', () => {
  const short = '1. a 2. b 3. c 4. d 5. Is this fair?';
  const r = runFormatGate(short);
  assert.equal(r.pass, true);
  assert.ok(r.warnings.some((w) => w.includes('word count')));
});

test('a [[READ MORE]] suffix is split off before parsing — core alone is gated, detail is reported separately', () => {
  const core = '1. one 2. two 3. three 4. four 5. Is this fair?';
  const detail = 'Extra itemized detail that would otherwise be absorbed into section 5.';
  const r = runFormatGate(`${core} [[READ MORE]] ${detail}`);
  assert.equal(r.pass, true);
  assert.equal(r.sectionCount, 5);
  assert.deepEqual(r.sections.map((s) => s.text), [
    'one',
    'two',
    'three',
    'four',
    'Is this fair?',
  ]);
  assert.equal(r.hasDetail, true);
  assert.ok(r.detailWordCount > 0);
});

test('a summary with no [[READ MORE]] marker reports no detail (backward compatible with every summary generated before this convention existed)', () => {
  const r = runFormatGate('1. one 2. two 3. three 4. four 5. Is this fair?');
  assert.equal(r.hasDetail, false);
  assert.equal(r.detailWordCount, 0);
});

test('core word count gate applies to Parts 1-4 only, not the full 5-part core or core+detail combined', () => {
  // A well-formed Parts-1-4 block sized inside the 120-180 target, plus a
  // long Key Question(s) section and a long detail block, must not trip the
  // soft-target warning — that warning is specifically about the Parts 1-4
  // reading load citizens always see, matching BillsTab.tsx's displayed
  // target, not Part 5 or the optional expandable detail.
  const filler = (n) => Array(n).fill('word').join(' ');
  const core = `1. ${filler(35)} 2. ${filler(35)} 3. ${filler(35)} 4. ${filler(35)} 5. ${filler(60)}?`;
  const longDetail = Array(150).fill('word').join(' ');
  const r = runFormatGate(`${core} [[READ MORE]] ${longDetail}`);
  assert.equal(r.pass, true);
  assert.ok(!r.warnings.some((w) => w.includes('word count')));
});

test('section 5 with zero question marks warns as malformed', () => {
  const r = runFormatGate('1. one 2. two 3. three 4. four 5. This is a declarative statement.');
  assert.equal(r.pass, true);
  assert.ok(r.warnings.some((w) => w.includes('no literal')));
  assert.equal(r.sections[4].label, 'Key questions');
});

test('section 5 with more than 5 question marks warns as a ceiling violation', () => {
  const questions = 'Is A? Is B? Is C? Is D? Is E? Is F?';
  const r = runFormatGate(`1. one 2. two 3. three 4. four 5. ${questions}`);
  assert.equal(r.pass, true);
  assert.ok(r.warnings.some((w) => w.includes('ceiling')));
});

test('section 5 label is plural for more than one question', () => {
  const r = runFormatGate('1. one 2. two 3. three 4. four 5. Is A fair? Is B fair?');
  assert.equal(r.sections[4].label, 'Key questions');
});
