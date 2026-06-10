/** P1P (VQ.6.2) — perception-council (CONCEPTUALIZE) + gemini-council (JUDGE) CLI fail-fast guards.
 *
 *  Both councils must reject a missing `--in`, a nonexistent `--in` file, or a missing GEMINI key
 *  BEFORE any Files-API upload — proven offline with an empty or fake key (no network, no spend).
 *  The guards live inside runCapability(), so a failure is the JSON error envelope on stdout + exit≠0
 *  (unlike the older console.error guards in gemini-video-review). Plus: model pinning (never Gemini
 *  2.5; resolved via the SSOT visualCortexModel), graceful missing-transcript/plan parse, and the
 *  offline-safe gemini-client knobs + roster-augmentation flags. Live behaviour (real upload, scored
 *  ruleChecks, the conceptualization fusion) is the live tier — VQ.6.4 / the runbook. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertEqual, assertIncludes } from './harness';
import { ensureFixtures, FX_DIR, lastEnvelope, runTsxEnv } from './fixtures';
import { REPO_ROOT } from '../_env/contract';
import { parseJsonLoose, resolutionEnum, thinkingEnum } from '../perception/gemini-client';
import { rosterFor, specialistById, wantsReelSegmentLens, wantsScreencastLens } from '../perception/specialists';

const NO_GEMINI = { GEMINI_API_KEY: '', GOOGLE_API_KEY: '' };
const FAKE_GEMINI = { GEMINI_API_KEY: 'unit-test-fake-key', GOOGLE_API_KEY: '' };
const COUNCILS = [
  'capabilities/perception/perception-council.ts',
  'capabilities/perception/gemini-council.ts',
];

for (const rel of COUNCILS) {
  const name = path.basename(rel);

  test(`P1P ${name} without --in fails fast with a clear envelope (no upload)`, () => {
    const r = runTsxEnv(rel, [], FAKE_GEMINI);
    assert(r.status !== 0, 'non-zero exit');
    const env = lastEnvelope(r.stdout);
    assert(!env.success, 'failure envelope on stdout');
    assertIncludes(String(env.error), '--in', 'names the missing --in');
  });

  test(`P1P ${name} checks the --in file exists BEFORE any upload`, () => {
    const r = runTsxEnv(rel, ['--in', path.join(FX_DIR, 'no-such.mp4')], FAKE_GEMINI);
    assert(r.status !== 0, 'non-zero exit');
    const env = lastEnvelope(r.stdout);
    assertIncludes(String(env.error), 'not found', 'clear file error, fired before the Files-API call');
    assert(!r.stdout.includes('unit-test-fake-key') && !r.stderr.includes('unit-test-fake-key'), 'never echoes a key value');
  });

  test(`P1P ${name} requires a GEMINI key — presence check only, before upload (no value printed)`, () => {
    const fx = ensureFixtures();
    const r = runTsxEnv(rel, ['--in', fx.clipMp4], NO_GEMINI);
    assert(r.status !== 0, 'non-zero exit');
    assertIncludes(String(lastEnvelope(r.stdout).error), 'GEMINI_API_KEY', 'names the missing key');
  });
}

test('P1P gemini-council tolerates a missing --transcript/--plan and still guards the key', () => {
  const fx = ensureFixtures();
  const r = runTsxEnv('capabilities/perception/gemini-council.ts', [
    '--in', fx.clipMp4, '--transcript', path.join(FX_DIR, 'no-such.json'), '--plan', path.join(FX_DIR, 'no-such.md'),
  ], NO_GEMINI);
  assert(r.status !== 0, 'non-zero exit');
  assertIncludes(String(lastEnvelope(r.stdout).error), 'GEMINI_API_KEY', 'missing transcript/plan is non-fatal; key guard still fires');
});

test('P1P both council CLIs resolve the visual cortex via the SSOT (never Gemini 2.5)', () => {
  for (const rel of COUNCILS) {
    const code = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    assertIncludes(code, 'visualCortexModel', `${rel}: resolves the model via the SSOT helper, not a hardcoded id`);
    assert(!/gemini-2\.5/.test(code), `${rel}: never Gemini 2.5`);
  }
});

test('P1P gemini-client thinking/resolution enums are pure + offline-safe', () => {
  assert(thinkingEnum('high') !== undefined, 'high maps to a ThinkingLevel');
  assert(thinkingEnum('minimal') !== undefined, 'minimal maps to a ThinkingLevel');
  assertEqual(thinkingEnum(undefined), undefined, 'undefined → undefined (Gemini-3 default thinking)');
  assert(resolutionEnum('low') !== undefined, 'low maps to a MediaResolution');
  assert(resolutionEnum('high') !== undefined, 'high maps to a MediaResolution');
  assertEqual(resolutionEnum('default'), undefined, 'default → undefined (API default resolution)');
});

test('P1P parseJsonLoose survives the real Gemini failure shapes (VQ.8 live-found)', () => {
  // The live-found case: TWO complete objects back-to-back ("Unexpected non-whitespace character
  // after JSON") — the first balanced object must win, not a slice spanning both.
  const twin = parseJsonLoose('{"specialist":"performance","score":88}\n{"specialist":"performance","score":12}') as { score: number };
  assertEqual(twin.score, 88, 'first balanced object wins over a duplicate trailing object');
  // Trailing prose after a complete object.
  const prose = parseJsonLoose('{"verdict":"ship"} Hope this helps!') as { verdict: string };
  assertEqual(prose.verdict, 'ship', 'trailing prose tolerated');
  // Braces inside string values must not confuse the balancer.
  const braces = parseJsonLoose('noise {"note":"a {weird} value","ok":true} more noise') as { ok: boolean };
  assertEqual(braces.ok, true, 'braces inside strings handled');
  // Fenced output still parses.
  const fenced = parseJsonLoose('```json\n{"a":1}\n```') as { a: number };
  assertEqual(fenced.a, 1, 'fenced JSON stripped');
});

test('P1P roster-augmentation flags opt the sub-lenses in by flag OR context', () => {
  // perceive vs judge split + sub-lenses resolve by id.
  assert(rosterFor('perceive').every((s) => s.id !== 'brand'), 'brand is judge-only — not in the perceive roster');
  assert(rosterFor('judge').some((s) => s.id === 'brand'), 'brand runs in the judge roster');
  assert(specialistById('screencast') !== undefined && specialistById('reel-segment') !== undefined, 'sub-lenses resolve by id');
  // screencast lens
  assertEqual(wantsScreencastLens(true, undefined), true, 'explicit --screencast wins');
  assertEqual(wantsScreencastLens(false, '9:16 educator reel, 30s'), false, 'a plain reel does not trigger screencast');
  assert(wantsScreencastLens(false, 'a screencast demo tutorial'), 'a screencast/demo context triggers the lens');
  // reel-segment lens
  assertEqual(wantsReelSegmentLens(true, undefined), true, 'explicit --reel-segments wins');
  assert(wantsReelSegmentLens(false, 'find the best clips for a reel'), 'a best-clips context triggers the lens');
});
