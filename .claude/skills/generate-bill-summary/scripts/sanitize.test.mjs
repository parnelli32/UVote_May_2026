// Run with:
//   node --experimental-strip-types --test .claude/skills/generate-bill-summary/scripts/sanitize.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitize } from './sanitize.mjs';

test('strips zero-width space', () => {
  const r = sanitize('hello​world');
  assert.equal(r.text, 'helloworld');
  assert.ok(r.strippedCodepoints.includes('U+200B'));
});

test('strips bidi override characters (Trojan Source / CVE-2021-42574 pattern)', () => {
  const r = sanitize('normal ‮reversed‬ text');
  assert.equal(r.text, 'normal reversed text');
  assert.ok(r.strippedCodepoints.includes('U+202E'));
  assert.ok(r.strippedCodepoints.includes('U+202C'));
});

test('strips Unicode Tag block used to smuggle hidden ASCII payloads', () => {
  const hidden = String.fromCodePoint(0xe0041, 0xe0042); // TAG LATIN CAPITAL LETTER A, B
  const r = sanitize(`visible${hidden}text`);
  assert.equal(r.text, 'visibletext');
});

test('leaves ordinary bill text untouched', () => {
  const input = "This bill requires... Violations are Class III offenses. Takes effect 180 days after signing.";
  const r = sanitize(input);
  assert.equal(r.text, input);
  assert.equal(r.strippedCount, 0);
  assert.deepEqual(r.strippedCodepoints, []);
});

test('handles null/empty input without throwing', () => {
  assert.deepEqual(sanitize(''), { text: '', strippedCount: 0, strippedCodepoints: [] });
  assert.deepEqual(sanitize(null), { text: '', strippedCount: 0, strippedCodepoints: [] });
});

test('strips multiple distinct suspect characters and reports each once', () => {
  const r = sanitize('a​b​c‪d');
  assert.equal(r.text, 'abcd');
  assert.deepEqual(r.strippedCodepoints, ['U+200B', 'U+202A']);
});
