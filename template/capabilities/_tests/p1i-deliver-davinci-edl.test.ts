/** P1I — deliver/export-davinci-edl: CMX3600 EDL helpers + buildEdl + the CLI integration. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertEqual, assertIncludes } from './harness';
import { ensureFixtures, lastEnvelope, runTsx } from './fixtures';
import { REPO_ROOT } from '../_env/contract';
import { colorToEdl, asciiFold, reelName, tcToFrames, buildEdl, type EdlSource } from '../deliver/export-davinci-edl';

const SRC: EdlSource = { fps: 25, ntsc: false, durationFrames: 15000, hasAudio: true, fileName: 'min kilde.mp4' };
const SEGMENTS = [
  { startMs: 12000, endMs: 34000, name: 'hook om X', comment: 'ages 18-35', color: 'red' },
  { startMs: 60000, endMs: 72000, name: 'påstående påstand', color: 'blue' },
];

// ── P1I.1 pure helpers ───────────────────────────────────────────────────────
test('P1I.1 colorToEdl — 8 marker colors → portable keywords, unknown → RED', () => {
  assertEqual(colorToEdl('red'), 'RED', 'red');
  assertEqual(colorToEdl('blue'), 'BLUE', 'blue');
  assertEqual(colorToEdl('orange'), 'YELLOW', 'orange → nearest classic');
  assertEqual(colorToEdl(undefined), 'GREEN', 'missing → green default');
  assertEqual(colorToEdl('chartreuse'), 'RED', 'unknown → RED (OTIO fallback)');
});

test('P1I.1 asciiFold — Danish ø/æ/å fold, non-ASCII stripped', () => {
  assertEqual(asciiFold('Bælgø'), 'Baelgo', 'æ→ae, ø→o');
  assertEqual(asciiFold('påstående'), 'paastaaende', 'å→aa');
  assertEqual(asciiFold('Før—efter'), 'Forefter', 'ø folds, em-dash stripped (not hyphenated)');
  assertEqual(asciiFold('café déjà'), 'cafe deja', 'accents stripped via NFKD');
  assert(!/[^\x20-\x7e]/.test(asciiFold('emoji 🎬 test')), 'emoji removed → pure ASCII');
});

test('P1I.1 reelName — ≤8 alnum upper, fallback AX', () => {
  assertEqual(reelName('min kilde.mp4'), 'MINKILDE', '≤8 alnum upper');
  assertEqual(reelName('1.mp4'), '1MP4', 'short');
  assertEqual(reelName(''), 'AX', 'empty → AX');
  assertEqual(reelName('ø!!!'), 'O', 'folds then strips punctuation');
});

test('P1I.1 tcToFrames — parse start TC at timebase', () => {
  assertEqual(tcToFrames('01:00:00:00', 25), 90000, '1h @25 = 90000');
  assertEqual(tcToFrames('00:00:00:00', 30), 0, 'zero');
  assertEqual(tcToFrames('00:00:02:12', 25), 62, '2s+12f @25');
});

// ── P1I.1 buildEdl ─────────────────────────────────────────────────────────
test('P1I.1 buildEdl annotate — header + single full event + one LOC per segment', () => {
  const edl = buildEdl({ source: SRC, segments: SEGMENTS, layout: 'annotate', startTcFrames: 90000, title: 'Vibe Timeline' });
  assertIncludes(edl, 'TITLE: VIBE TIMELINE', 'title uppercased');
  assertIncludes(edl, 'FCM: NON-DROP FRAME', 'fcm ndf');
  assertEqual((edl.match(/^001 /m) ? 1 : 0), 1, 'one event 001');
  assert(!/^002 /m.test(edl), 'annotate = single event (no 002)');
  assertEqual((edl.match(/\* LOC:/g) ?? []).length, 2, 'two LOC markers');
  // full-length event: src 0..15000, rec 01:00:00:00..01:10:00:00 (90000..105000 @25)
  assertIncludes(edl, '00:00:00:00 00:10:00:00 01:00:00:00 01:10:00:00', 'full-length event range');
});

test('P1I.1 buildEdl annotate — LOC record TC = startTc + source frame, color + ASCII name', () => {
  const edl = buildEdl({ source: SRC, segments: SEGMENTS, layout: 'annotate', startTcFrames: 90000, title: 'T' });
  // seg1 start 12000ms@25 = frame 300; rec = 90000+300 = 90300 = 01:00:12:00
  assertIncludes(edl, '* LOC: 01:00:12:00 RED', 'marker1 at 01:00:12:00 RED');
  assertIncludes(edl, 'hook om X - ages 18-35', 'marker1 label folds name + comment');
  // seg2 start 60000ms@25 = 1500; rec = 91500 = 01:01:00:00; name folded å→aa
  assertIncludes(edl, '* LOC: 01:01:00:00 BLUE', 'marker2 at 01:01:00:00 BLUE');
  assertIncludes(edl, 'paastaaende paastand', 'marker2 name ASCII-folded');
});

test('P1I.1 buildEdl assembly — one contiguous event per segment, AA/V channel', () => {
  const edl = buildEdl({ source: SRC, segments: SEGMENTS, layout: 'assembly', startTcFrames: 90000, title: 'T' });
  assert(/^001 /m.test(edl) && /^002 /m.test(edl), 'two events');
  assertEqual((edl.match(/\* LOC:/g) ?? []).length, 2, 'one LOC per event');
  assertIncludes(edl, 'AA/V', 'audio source → AA/V channel');
  // event1 src 300..850 (12s..34s), rec contiguous from 90000: 90000..90550
  assertIncludes(edl, '00:00:12:00 00:00:34:00 01:00:00:00 01:00:22:00', 'event1 src+rec frames');
  // event2 (src 1500..1800, len 300) lays right after: rec 90550..90850 = 01:00:22:00..01:00:34:00
  assertIncludes(edl, '00:01:00:00 00:01:12:00 01:00:22:00 01:00:34:00', 'event2 src+record range');
});

test('P1I.1 buildEdl — video-only source uses V channel', () => {
  const edl = buildEdl({ source: { ...SRC, hasAudio: false }, segments: SEGMENTS, layout: 'assembly', startTcFrames: 90000, title: 'T' });
  assert(/ V {4}C/.test(edl) || /\sV\s+C/.test(edl), 'V (not AA/V) channel');
  assert(!edl.includes('AA/V'), 'no AA/V when no audio');
});

test('P1I.1 buildEdl — 999-event cap throws', () => {
  const many = Array.from({ length: 1000 }, (_, i) => ({ startMs: i * 10, endMs: i * 10 + 5, name: `m${i}` }));
  let threw = false;
  try {
    buildEdl({ source: SRC, segments: many, layout: 'assembly', startTcFrames: 0, title: 'T' });
  } catch {
    threw = true;
  }
  assert(threw, 'throws past 999 events');
});

test('P1I.1 buildEdl — NTSC 29.97 emits DROP FRAME + ; separator', () => {
  const edl = buildEdl({ source: { fps: 30, ntsc: true, durationFrames: 1800, hasAudio: false, fileName: 'a.mp4' }, segments: [{ startMs: 1000, endMs: 2000, name: 'x' }], layout: 'annotate', startTcFrames: 0, title: 'T' });
  assertIncludes(edl, 'FCM: DROP FRAME', 'drop-frame FCM');
  assert(/\* LOC: \d\d:\d\d:\d\d;\d\d/.test(edl), 'LOC uses ; (drop-frame) separator');
});

// ── P1I.5 integration: the CLI end-to-end on the clip.mp4 fixture ─────────────
test('P1I.5 CLI — auto-probes --in, writes a valid .edl, envelope success', () => {
  const fx = ensureFixtures();
  const tmpSeg = path.join(REPO_ROOT, 'out', 'work', '_tests', 'davinci-segments.json');
  fs.writeFileSync(
    tmpSeg,
    JSON.stringify({
      segments: [
        { startMs: 200, endMs: 800, name: 'intro', comment: 'reels-fit 0.9', color: 'red' },
        { startMs: 1000, endMs: 1800, name: 'pointe', color: 'blue' },
      ],
    }),
  );
  const r = runTsx('capabilities/deliver/export-davinci-edl.ts', ['--in', fx.clipMp4, '--segments', tmpSeg, '--project', '_tests', '--name', 'P1I Test']);
  assertEqual(r.status, 0, `exit:\n${r.stderr.slice(-600)}`);
  const env = lastEnvelope(r.stdout);
  assert(env.success, 'envelope success');
  assertEqual(env.metrics.segments as number, 2, 'metrics.segments');
  const edlPath = env.outputs.find((p) => p.endsWith('.edl'));
  assert(!!edlPath && fs.existsSync(edlPath), '.edl written');
  const edl = fs.readFileSync(edlPath as string, 'utf8');
  assertIncludes(edl, 'TITLE: P1I TEST', 'title');
  assertIncludes(edl, 'FCM: NON-DROP FRAME', 'fcm (clip.mp4 is 30fps integer)');
  assertEqual((edl.match(/\* LOC:/g) ?? []).length, 2, 'two markers');
});

test('P1I.5 CLI — rejects endMs <= startMs', () => {
  const fx = ensureFixtures();
  const tmpSeg = path.join(REPO_ROOT, 'out', 'work', '_tests', 'davinci-bad.json');
  fs.writeFileSync(tmpSeg, JSON.stringify({ segments: [{ startMs: 1000, endMs: 500, name: 'bad' }] }));
  const r = runTsx('capabilities/deliver/export-davinci-edl.ts', ['--in', fx.clipMp4, '--segments', tmpSeg, '--project', '_tests']);
  assertEqual(r.status, 1, 'non-zero exit');
  assert(!lastEnvelope(r.stdout).success, 'envelope reports failure');
});
