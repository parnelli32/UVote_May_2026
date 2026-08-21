#!/usr/bin/env node
// Format gate for UVote bill summaries.
//
// Validates a candidate `summary` string against the REAL
// parseSummaryIntoSections in src/lib/billUtils.ts by importing that file
// directly (Node 22's --experimental-strip-types loads .ts with no build
// step) rather than reimplementing its regex. That's the point: this gate
// can never silently drift from what the live frontend actually does,
// because it *is* what the live frontend does.
//
// Usage:
//   node --experimental-strip-types format_gate.mjs "<summary text>"
//   node --experimental-strip-types format_gate.mjs --file path/to/summary.txt
//   echo "<summary text>" | node --experimental-strip-types format_gate.mjs
//
// Exit code 0 = pass (exactly 5 non-empty sections in the mandatory core,
// the 5th being Key Question(s)), 1 = fail. If the input carries a
// `[[READ MORE]]`-delimited expandable detail suffix (see
// splitSummaryCoreAndDetail in billUtils.ts), that detail is split off first
// — the 5-section/word-count gate applies to the mandatory core alone,
// matching the frontend's own split-before-parse requirement (the real
// parser's final section capture would otherwise silently swallow the
// marker and all detail text into Part 5).

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const billUtilsUrl = new URL('../../../../src/lib/billUtils.ts', import.meta.url);
const { parseSummaryIntoSections, splitSummaryCoreAndDetail } = await import(billUtilsUrl);

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Runs the real parser and applies the deterministic pass/fail gate:
 *  exactly 5 non-empty sections in the mandatory core — the four original
 *  parts plus Key Question(s) — (expandable detail, if present, is split
 *  off first and reported separately). */
export function runFormatGate(summary) {
  const { core, detail } = splitSummaryCoreAndDetail(summary);
  const sections = parseSummaryIntoSections(core);
  const nonEmpty = sections.every((s) => s.text.trim().length > 0);
  const pass = sections.length === 5 && nonEmpty;
  const coreWords = wordCount(core ?? '');
  const detailWords = detail ? wordCount(detail) : 0;

  const warnings = [];
  const hasSixthMarker = /(?:^|\s)6\.\s/.test((core ?? '').trim());
  if (hasSixthMarker) {
    warnings.push(
      "A '6.' marker was detected in the input. The real parser has no 6th " +
      'section: depending on exact spacing this content is silently absorbed ' +
      "into section 5's text (same mechanism previously observed for a stray " +
      "'5.' marker against the 4-section parser — see the skill's test suite) " +
      'rather than causing an error. Never emit a 6-marker summary; this ' +
      'warning exists to catch it if the generation step accidentally does.'
    );
  }
  if (pass) {
    const keyQuestionText = sections[4].text;
    const questionMarkCount = (keyQuestionText.match(/\?/g) ?? []).length;
    if (questionMarkCount === 0) {
      warnings.push(
        'Section 5 (Key Question(s)) contains no literal \'?\' — every Key ' +
        'Question(s) section must pose at least one actual question, not a ' +
        'restatement of Part 1 or other declarative content.'
      );
    } else if (questionMarkCount > 5) {
      warnings.push(
        `Section 5 (Key Question(s)) contains ${questionMarkCount} '?' — ` +
        'above the hard ceiling of 5 questions per SKILL.md Step 7.5. ' +
        'Consolidate to the most load-bearing, genuinely distinct axes.'
      );
    }
  }
  // The 120-180 word soft target is scoped to Parts 1-4 only (matches the
  // product target displayed by BillsTab.tsx's Summary field label, which
  // computes the same Parts-1-4 count via its own partsOneToFourWordCount
  // helper) — Part 5 (Key Question(s)) is deliberately excluded from this
  // check. A modest total overage from adding Key Question(s) content is
  // expected and healthy, the same tolerance already granted under
  // Criterion 9.
  const partsOneToFourWords = pass
    ? sections.slice(0, 4).reduce((sum, s) => sum + wordCount(s.text), 0)
    : 0;
  if (pass && (partsOneToFourWords < 100 || partsOneToFourWords > 220)) {
    warnings.push(
      `Parts 1-4 word count (${partsOneToFourWords}) is well outside the 120-180 soft target. ` +
      'Confirm this is proportionate to the bill\'s actual complexity (see ' +
      'Criterion 9 in SKILL.md), not padding or unwarranted truncation. If the ' +
      'bill genuinely needs more room, move the supplementary material into ' +
      "expandable detail (a '[[READ MORE]]' suffix) rather than inflating the " +
      'mandatory core — Parts 1-4 alone must satisfy all 9 rubric criteria.'
    );
  }

  return {
    pass,
    sectionCount: sections.length,
    sections,
    wordCount: coreWords,
    partsOneToFourWordCount: partsOneToFourWords,
    hasDetail: detail !== null,
    detailWordCount: detailWords,
    warnings,
  };
}

function readCliInput() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    return readFileSync(args[fileIdx + 1], 'utf8');
  }
  if (args.length > 0) {
    return args.join(' ');
  }
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const input = readCliInput();
  const result = runFormatGate(input);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.pass ? 0 : 1);
}
