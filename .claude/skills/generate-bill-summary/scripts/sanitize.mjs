#!/usr/bin/env node
// Strips invisible/bidi-control/tag-block Unicode from extracted bill text
// before it reaches a generation prompt. Required, independent of every
// other requirement in the skill: a human reading a bill PDF visually
// cannot be misled by an invisible character (it renders as nothing), but
// an LLM ingesting extracted text as generation input can act on hidden
// instructions a human reviewer would never see or think to check for.
//
// Pattern borrowed from book_to_skill/sanitize.py (github.com/virgiliojr94/
// book-to-skill), which strips the same three families for the same reason
// (untrusted-document-into-agent-context supply chain):
//   - Zero-width / invisible format characters (U+200B-200D, U+FEFF,
//     U+2060-2064, U+206A-206F)
//   - Bidi control / "Trojan Source" characters, CVE-2021-42574
//     (U+061C, U+200E-200F, U+202A-202E, U+2066-2069)
//   - Unicode Tag block, used to smuggle hidden ASCII payloads
//     (U+E0000-U+E007F)
//
// Usage:
//   node --experimental-strip-types sanitize.mjs --file path/to/extracted.txt
//   echo "<text>" | node --experimental-strip-types sanitize.mjs

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SUSPECT_PATTERN =
  /[​-‏﻿⁠-⁤⁪-⁯؜‪-‮⁦-⁩\u{E0000}-\u{E007F}]/gu;

/** Strips suspect codepoints and reports what was found, so a caller can
 *  surface "N hidden characters were stripped from this source document" in
 *  its self-report rather than silently cleaning and saying nothing. */
export function sanitize(text) {
  if (!text) return { text: text ?? '', strippedCount: 0, strippedCodepoints: [] };
  const found = new Set();
  for (const match of text.matchAll(SUSPECT_PATTERN)) {
    found.add('U+' + match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
  }
  const cleaned = text.replace(SUSPECT_PATTERN, '');
  return {
    text: cleaned,
    strippedCount: text.length - cleaned.length,
    strippedCodepoints: [...found].sort(),
  };
}

function readCliInput() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    return readFileSync(args[fileIdx + 1], 'utf8');
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
  const result = sanitize(input);
  if (process.argv.includes('--report-only')) {
    console.log(JSON.stringify({ strippedCount: result.strippedCount, strippedCodepoints: result.strippedCodepoints }, null, 2));
  } else {
    process.stdout.write(result.text);
    if (result.strippedCount > 0) {
      console.error(
        `[sanitize] stripped ${result.strippedCount} suspect character(s): ${result.strippedCodepoints.join(', ')}`
      );
    }
  }
}
