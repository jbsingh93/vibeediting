import { test, assert, assertEqual, assertThrows } from './harness';
import { parseCaptions, normalizeWord, makeEmphasisMatcher } from '../../src/components/captions';
import { ensureFixtures } from './fixtures';
import * as fs from 'node:fs';

test('P0.5 parseCaptions accepts a real Whisper-shaped captions file', () => {
  const fx = ensureFixtures();
  const caps = parseCaptions(JSON.parse(fs.readFileSync(fx.capsJson, 'utf8')));
  assert(caps.length > 0, 'no captions parsed');
  assert(typeof caps[0].text === 'string' && typeof caps[0].startMs === 'number', 'caption shape is wrong');
});

test('P0.5 parseCaptions defaults missing timestampMs/confidence to null', () => {
  const [c] = parseCaptions([{ text: 'a', startMs: 0, endMs: 1 }]);
  assertEqual(c.timestampMs, null, 'timestampMs should default to null');
  assertEqual(c.confidence, null, 'confidence should default to null');
});

test('P0.5 parseCaptions rejects malformed data', async () => {
  await assertThrows(() => parseCaptions('not an array'), 'should reject a non-array');
  await assertThrows(() => parseCaptions([{ startMs: 0 }]), 'should reject missing text/endMs');
  await assertThrows(() => parseCaptions([{ text: 'a', startMs: 'x', endMs: 1 }]), 'should reject a non-number startMs');
});

test('P0.5 normalizeWord strips punctuation + casing', () => {
  assertEqual(normalizeWord('Winner.'), 'winner');
  assertEqual(normalizeWord(' AI! '), 'ai');
  assertEqual(normalizeWord('5.000'), '5000');
});

test('P0.5 emphasis matcher is punctuation-insensitive on both sides (incl. accented glyphs)', () => {
  const m = makeEmphasisMatcher(['winner', '5.000', 'café']);
  assert(m('winner.'), 'should match "winner."');
  assert(m('Winner'), 'should match "Winner"');
  assert(m('café,'), 'should match "café,"');
  assert(m('5.000'), 'should match "5.000"');
  assert(!m('loser'), 'should NOT match "loser"');
});
