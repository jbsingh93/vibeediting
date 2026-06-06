/** P1H — deliver/export-premiere-xml: FCP7 XMEML helpers + buildXmeml/buildCsv + the CLI integration. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertEqual, assertIncludes } from './harness';
import { ensureFixtures, lastEnvelope, runTsx } from './fixtures';
import { REPO_ROOT } from '../_env/contract';
import {
  msToFrame,
  framesToTimecode,
  pathToUrl,
  colorRgba,
  resolveRate,
  buildXmeml,
  buildCsv,
  type XmemlSource,
} from '../deliver/export-premiere-xml';

const SRC: XmemlSource = {
  fps: 25,
  ntsc: false,
  width: 1920,
  height: 1080,
  durationFrames: 15000,
  hasAudio: true,
  filePath: 'C:\\Media\\my source.mp4',
  fileName: 'my source.mp4',
};

// ── P1H.1 pure helpers ───────────────────────────────────────────────────────
test('P1H.1 msToFrame — 12000ms@25 → 300 (exact integer rate)', () => {
  assertEqual(msToFrame(12000, 25, false), 300, '25fps');
  assertEqual(msToFrame(34000, 25, false), 850, '34s@25');
  assertEqual(msToFrame(0, 25, false), 0, 'zero');
});

test('P1H.1 msToFrame — 29.97 NTSC uses the rational rate (no decimal drift)', () => {
  // 1000s @ 29.97 = 1000 * 30000/1001 ≈ 29970.03 → 29970
  assertEqual(msToFrame(1000_000, 30, true), 29970, 'long-clip ntsc');
  // round-trip a 1s point and back is stable
  const f = msToFrame(1001, 30, true); // ≈ 30
  assertEqual(f, 30, '1001ms@29.97 → 30');
});

test('P1H.1 msToFrame — boundary off-by-one rounds, not truncates', () => {
  // 19.98ms @ 25 = 0.4995 frames → rounds to 0; 21ms → 0.525 → 1
  assertEqual(msToFrame(19, 25, false), 0, 'rounds down');
  assertEqual(msToFrame(21, 25, false), 1, 'rounds up');
});

test('P1H.1 framesToTimecode — 300@25 → 00:00:12:00 (NDF, colon)', () => {
  assertEqual(framesToTimecode(300, 25, false, false), '00:00:12:00', 'ndf');
  assertEqual(framesToTimecode(0, 25, false, false), '00:00:00:00', 'zero');
});

test('P1H.1 framesToTimecode — DF uses ; separator and the Duncan algorithm', () => {
  const tc = framesToTimecode(17982, 30, true, true); // 10 min of 29.97 DF
  assert(tc.includes(';'), `DF must use ';' separator, got ${tc}`);
  assertEqual(tc, '00:10:00;00', 'canonical 10-minute DF value');
  // NDF of the same timebase keeps the colon
  assert(framesToTimecode(900, 30, true, false).includes(':'), 'NDF keeps colon');
});

test('P1H.1 pathToUrl — Windows path → URL-encoded file://localhost', () => {
  assertEqual(pathToUrl('C:\\a b\\v.mp4'), 'file://localhost/C:/a%20b/v.mp4', 'windows w/ space');
  assertEqual(pathToUrl('C:\\Media\\clip.mp4'), 'file://localhost/C:/Media/clip.mp4', 'no space');
  assertEqual(pathToUrl('/home/x/a b.mp4'), 'file://localhost/home/x/a%20b.mp4', 'posix abs no doubled slash');
});

test('P1H.1 colorRgba — 8 colors + green default for unknown', () => {
  assertEqual(colorRgba('red').r, 255, 'red r');
  assertEqual(colorRgba('red').g, 38, 'red g');
  const green = colorRgba('green');
  assertEqual(`${green.r},${green.g},${green.b}`, '0,160,0', 'green');
  assertEqual(colorRgba(undefined).g, 160, 'missing → green');
  assertEqual(colorRgba('chartreuse').g, 160, 'unknown → green');
  assertEqual(colorRgba('blue').a, 0, 'alpha always 0');
});

test('P1H.1 resolveRate — integer rates NDF, /1.001 rates → ntsc', () => {
  assertEqual(JSON.stringify(resolveRate(25)), JSON.stringify({ fps: 25, ntsc: false }), '25');
  // exact 30.0 must NOT be misread as 29.97 (they differ by only 0.03) — the epsilon-too-wide bug
  assertEqual(JSON.stringify(resolveRate(30)), JSON.stringify({ fps: 30, ntsc: false }), '30 exact → NDF');
  assertEqual(JSON.stringify(resolveRate(60)), JSON.stringify({ fps: 60, ntsc: false }), '60 exact → NDF');
  assertEqual(JSON.stringify(resolveRate(29.97)), JSON.stringify({ fps: 30, ntsc: true }), '29.97');
  assertEqual(JSON.stringify(resolveRate(30000 / 1001)), JSON.stringify({ fps: 30, ntsc: true }), '29.97 rational');
  assertEqual(JSON.stringify(resolveRate(23.976)), JSON.stringify({ fps: 24, ntsc: true }), '23.976');
  assertEqual(JSON.stringify(resolveRate(60000 / 1001)), JSON.stringify({ fps: 60, ntsc: true }), '59.94 rational');
});

// ── P1H.1 buildXmeml (2-segment fixture) ──────────────────────────────────────
const SEGMENTS = [
  { startMs: 12000, endMs: 34000, name: 'hook om X', comment: 'ages 18-35', color: 'red' },
  { startMs: 60000, endMs: 72000, name: 'payoff', color: 'blue' },
];

test('P1H.1 buildXmeml — well-formed XMEML root + dimensions', () => {
  const xml = buildXmeml({ source: SRC, segments: SEGMENTS, name: 'Reels — bedste', layout: 'both' });
  assertIncludes(xml, '<!DOCTYPE xmeml>', 'doctype');
  assertIncludes(xml, '<xmeml version="4">', 'version 4');
  assertIncludes(xml, '<width>1920</width>', 'width');
  assertIncludes(xml, '<timebase>25</timebase>', 'timebase');
  assertIncludes(xml, '<ntsc>FALSE</ntsc>', 'ntsc false');
});

test('P1H.1 buildXmeml — exactly 2 video clipitems + 2 range markers', () => {
  const xml = buildXmeml({ source: SRC, segments: SEGMENTS, name: 'T', layout: 'both' });
  const videoClips = (xml.match(/<clipitem id="clipitem-v-/g) ?? []).length;
  assertEqual(videoClips, 2, 'two video clipitems');
  const markers = (xml.match(/<marker>/g) ?? []).length;
  assertEqual(markers, 2, 'two markers');
});

test('P1H.1 buildXmeml — markers are RANGE (out != -1) at timeline frames', () => {
  const xml = buildXmeml({ source: SRC, segments: SEGMENTS, name: 'T', layout: 'both' });
  assert(!/<out>-1<\/out>/.test(xml), 'no single-point (-1) markers in both-layout');
  // segment 1: src 300..850 (len 550) → timeline marker in=0 out=550
  assertIncludes(xml, '<in>0</in>\n          <out>550</out>', 'first marker timeline range 0..550');
  // segment 2 lays after: timeline 550..850 (len 300)
  assertIncludes(xml, '<in>550</in>\n          <out>850</out>', 'second marker timeline range 550..850');
});

test('P1H.1 buildXmeml — source <in>/<out> frame integers correct', () => {
  const xml = buildXmeml({ source: SRC, segments: SEGMENTS, name: 'T', layout: 'both' });
  assertIncludes(xml, '<in>300</in>\n              <out>850</out>', 'clip1 source 12s..34s → 300..850');
  assertIncludes(xml, '<in>1500</in>\n              <out>1800</out>', 'clip2 source 60s..72s → 1500..1800');
});

test('P1H.1 buildXmeml — <pathurl> declared exactly once (file referenced by id after)', () => {
  const xml = buildXmeml({ source: SRC, segments: SEGMENTS, name: 'T', layout: 'both' });
  const pathurls = (xml.match(/<pathurl>/g) ?? []).length;
  assertEqual(pathurls, 1, 'single pathurl');
  assertIncludes(xml, 'file://localhost/C:/Media/my%20source.mp4', 'encoded url');
});

test('P1H.1 buildXmeml — sequence timecode pinned to frame 0 (01:00:00:00 offset guard)', () => {
  const xml = buildXmeml({ source: SRC, segments: SEGMENTS, name: 'T', layout: 'both' });
  assertIncludes(xml, '<frame>0</frame><displayformat>NDF</displayformat>', 'frame-0 NDF start');
});

test('P1H.1 buildXmeml — marker comment carries "fra <tc> til <tc>" + valid RGBA block', () => {
  const xml = buildXmeml({ source: SRC, segments: SEGMENTS, name: 'T', layout: 'both' });
  assertIncludes(xml, 'fra 00:00:12:00 til 00:00:34:00 — ages 18-35', 'source TC + comment');
  assertIncludes(xml, '<red>255</red>\n          <green>38</green>\n          <blue>38</blue>\n          <alpha>0</alpha>', 'red RGBA');
});

test('P1H.1 buildXmeml — layouts: assembly drops markers, annotate is single full clip', () => {
  const asm = buildXmeml({ source: SRC, segments: SEGMENTS, name: 'T', layout: 'assembly' });
  assertEqual((asm.match(/<marker>/g) ?? []).length, 0, 'assembly = no markers');
  const ann = buildXmeml({ source: SRC, segments: SEGMENTS, name: 'T', layout: 'annotate' });
  assertEqual((ann.match(/<clipitem id="clipitem-v-/g) ?? []).length, 1, 'annotate = one clip');
  assertEqual((ann.match(/<marker>/g) ?? []).length, 2, 'annotate keeps markers');
  // annotate markers sit at SOURCE positions (300..850), not timeline 0..550
  assertIncludes(ann, '<in>300</in>\n          <out>850</out>', 'annotate marker at source frames');
});

test('P1H.1 buildCsv — header + one row per segment, source timecodes', () => {
  const csv = buildCsv(SRC, SEGMENTS);
  const lines = csv.trim().split('\r\n');
  assertEqual(lines.length, 3, 'header + 2 rows');
  assertIncludes(lines[0], 'Timecode In', 'header');
  assertIncludes(lines[1], '00:00:12:00', 'row1 in tc');
  assertIncludes(lines[1], '00:00:34:00', 'row1 out tc');
});

// ── P1H.5 integration: the CLI end-to-end on the clip.mp4 fixture ─────────────
test('P1H.5 CLI — auto-probes --in, writes valid .xml + .csv, envelope success', () => {
  const fx = ensureFixtures();
  const tmpSeg = path.join(REPO_ROOT, 'out', 'work', '_tests', 'premiere-segments.json');
  // clip.mp4 is 2s @ 30fps — keep segments inside that span
  fs.writeFileSync(
    tmpSeg,
    JSON.stringify({
      segments: [
        { startMs: 200, endMs: 800, name: 'intro', comment: 'reels-fit 0.9', color: 'red' },
        { startMs: 1000, endMs: 1800, name: 'point', color: 'blue' },
      ],
    }),
  );
  const r = runTsx('capabilities/deliver/export-premiere-xml.ts', ['--in', fx.clipMp4, '--segments', tmpSeg, '--project', '_tests', '--name', 'P1H Test']);
  assertEqual(r.status, 0, `exit:\n${r.stderr.slice(-600)}`);
  const env = lastEnvelope(r.stdout);
  assert(env.success, 'envelope success');
  assertEqual(env.metrics.segments as number, 2, 'metrics.segments');
  const xmlPath = env.outputs.find((p) => p.endsWith('.xml'));
  const csvPath = env.outputs.find((p) => p.endsWith('.csv'));
  assert(!!xmlPath && fs.existsSync(xmlPath), '.xml written');
  assert(!!csvPath && fs.existsSync(csvPath), '.csv written');
  const xml = fs.readFileSync(xmlPath as string, 'utf8');
  assertIncludes(xml, '<xmeml version="4">', 'round-trips xmeml root');
  assertEqual((xml.match(/<marker>/g) ?? []).length, 2, 'two markers in output');
  assertIncludes(xml, '<frame>0</frame>', 'offset guard present');
});

test('P1H.5 CLI — rejects endMs <= startMs', () => {
  const fx = ensureFixtures();
  const tmpSeg = path.join(REPO_ROOT, 'out', 'work', '_tests', 'premiere-bad.json');
  fs.writeFileSync(tmpSeg, JSON.stringify({ segments: [{ startMs: 1000, endMs: 500, name: 'bad' }] }));
  const r = runTsx('capabilities/deliver/export-premiere-xml.ts', ['--in', fx.clipMp4, '--segments', tmpSeg, '--project', '_tests']);
  assertEqual(r.status, 1, 'non-zero exit on bad segment');
  assert(!lastEnvelope(r.stdout).success, 'envelope reports failure');
});
