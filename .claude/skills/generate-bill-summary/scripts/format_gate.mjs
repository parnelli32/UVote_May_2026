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
// Exit code 0 = pass (exactly 4 non-empty sections), 1 = fail.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const billUtilsUrl = new URL('../../../../src/lib/billUtils.ts', import.meta.url);
const { parseSummaryIntoSections } = await import(billUtilsUrl);

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Runs the real parser and applies the deterministic pass/fail gate:
 *  exactly 4 sections, all non-empty. */
export function runFormatGate(summary) {
  const sections = parseSummaryIntoSections(summary);
  const nonEmpty = sections.every((s) => s.text.trim().length > 0);
  const pass = sections.length === 4 && nonEmpty;
  const totalWords = wordCount(summary ?? '');

  const warnings = [];
  const hasFifthMarker = /(?:^|\s)5\.\s/.test((summary ?? '').trim());
  if (hasFifthMarker) {
    warnings.push(
      "A '5.' marker was detected in the input. The real parser has no 5th " +
      'section: depending on exact spacing this content is silently absorbed ' +
      "into section 4's text (confirmed empirically — see the skill's test " +
      'suite) rather than causing an error. Never emit a 5-marker summary; ' +
      "this warning exists to catch it if the generation step accidentally does."
    );
  }
  if (pass && (totalWords < 100 || totalWords > 220)) {
    warnings.push(
      `Word count (${totalWords}) is well outside the 120-180 soft target. ` +
      'Confirm this is proportionate to the bill\'s actual complexity (see ' +
      'Criterion 9 in SKILL.md), not padding or unwarranted truncation.'
    );
  }

  return { pass, sectionCount: sections.length, sections, wordCount: totalWords, warnings };
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
