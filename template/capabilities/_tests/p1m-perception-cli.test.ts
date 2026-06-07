/** P1M — perception/gemini-video-review + perception/cut-doctor CLIs.
 *  Review: arg/key/file guards fire before any upload (no network). Cut-doctor: the DETERMINISTIC
 *  pipeline runs LIVE — --transcript skips Whisper, --no-gemini skips Gemini, ffmpeg scene-detect
 *  finds the fixture's hard cut and the Whisper-timing classifier must flag it as mid-sentence. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertEqual, assertIncludes } from './harness';
import { ensureFixtures, FX_DIR, runTsx, runTsxEnv } from './fixtures';
import { REPO_ROOT } from '../_env/contract';

const NO_GEMINI = { GEMINI_API_KEY: '', GOOGLE_API_KEY: '' };
const FAKE_GEMINI = { GEMINI_API_KEY: 'unit-test-fake-key', GOOGLE_API_KEY: '' };

test('P1M.1 gemini-video-review without args fails with usage', () => {
  const r = runTsxEnv('capabilities/perception/gemini-video-review.ts', [], FAKE_GEMINI);
  assert(r.status !== 0, 'non-zero exit');
  assertIncludes(r.stderr, 'Usage:', 'usage shown');
});

test('P1M.2 gemini-video-review rejects an unknown --mode', () => {
  const r = runTsxEnv('capabilities/perception/gemini-video-review.ts', ['x.mp4', '--mode', 'banana'], FAKE_GEMINI);
  assert(r.status !== 0, 'non-zero exit');
  assertIncludes(r.stderr, 'Unknown --mode', 'mode named');
});

test('P1M.3 gemini-video-review requires GEMINI_API_KEY (presence check only — no value printed)', () => {
  const r = runTsxEnv('capabilities/perception/gemini-video-review.ts', ['x.mp4'], NO_GEMINI);
  assert(r.status !== 0, 'non-zero exit');
  assertIncludes(r.stderr, 'GEMINI_API_KEY', 'names the missing key');
});

test('P1M.4 gemini-video-review checks the file exists BEFORE uploading', () => {
  const r = runTsxEnv('capabilities/perception/gemini-video-review.ts', [path.join(FX_DIR, 'no-such.mp4')], FAKE_GEMINI);
  assert(r.status !== 0, 'non-zero exit');
  assertIncludes(r.stderr, 'File not found', 'clear file error (and no network attempted)');
});

test('P1M.5 visual-cortex model default stays pinned to gemini-3.1-flash-lite (hard rule 2)', () => {
  for (const rel of ['capabilities/perception/gemini-video-review.ts', 'capabilities/perception/cut-doctor.ts']) {
    const code = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    assertIncludes(code, "'gemini-3.1-flash-lite'", `${rel}: pinned default`);
    assert(!/gemini-2\.5/.test(code), `${rel}: never Gemini 2.5`);
  }
});

test('P1M.6 cut-doctor LIVE deterministic run: ffmpeg finds the hard cut, Whisper timing flags it mid-sentence', () => {
  const fx = ensureFixtures();
  const prefix = path.join(FX_DIR, 'cutdoc');
  const r = runTsx('capabilities/perception/cut-doctor.ts', [
    fx.sceneMp4, '--transcript', fx.capsJson, '--no-gemini', '--out', prefix, '--project-fps', '30',
  ]);
  assertEqual(r.status, 0, `cut-doctor exit:\n${r.stderr.slice(-800)}\n${r.stdout.slice(-400)}`);
  const jsonPath = `${prefix}.cuts.json`;
  assert(fs.existsSync(jsonPath) && fs.existsSync(`${prefix}.cuts.md`), 'cuts.json + cuts.md written');
  const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as {
    cutSource: string;
    cuts: { timeMs: number; classification: string; flagged: boolean; suggestMs?: number; suggestFrame?: number }[];
  };
  assertIncludes(report.cutSource, 'ffmpeg', 'full ffmpeg → frame-accurate cut discovery');
  assert(report.cuts.length >= 1, 'the testsrc→mandelbrot hard cut detected');
  const flagged = report.cuts.find((c) => c.flagged);
  assert(!!flagged, 'a cut landing inside continuous speech must be flagged');
  assert(
    flagged!.classification === 'mid-sentence' || flagged!.classification === 'dangling-clause',
    `speech runs 0–2.1s with no gap at the ~1s cut → mid-sentence/dangling, got ${flagged!.classification}`,
  );
  assert(typeof flagged!.suggestMs === 'number' && flagged!.suggestMs! > flagged!.timeMs, 'deterministic fix: hold until the sentence ends');
  assert(typeof flagged!.suggestFrame === 'number', 'fix carries the frame number at --project-fps');
});

test('P1M.7 cut-doctor rejects a missing video / missing transcript with clear errors', () => {
  const fx = ensureFixtures();
  const r1 = runTsx('capabilities/perception/cut-doctor.ts', [path.join(FX_DIR, 'no-such.mp4'), '--no-gemini']);
  assert(r1.status !== 0 && /File not found/.test(r1.stderr), 'missing video named');
  const r2 = runTsx('capabilities/perception/cut-doctor.ts', [fx.sceneMp4, '--transcript', path.join(FX_DIR, 'no-such.json'), '--no-gemini']);
  assert(r2.status !== 0 && /Transcript not found/.test(r2.stderr), 'missing transcript named');
});
