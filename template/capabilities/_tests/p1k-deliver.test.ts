/** P1K — deliver tools: loudnorm (two-pass + silence fallback), disk guard, render presets. All live, no API spend. */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test, assert, assertEqual } from './harness';
import { ensureFixtures, FX_DIR, lastEnvelope, runTsx } from './fixtures';
import { presetArgs } from '../deliver/render-preset';

// ── deliver/loudnorm.ts ─────────────────────────────────────────────────────────

test('P1K.1 loudnorm.ts two-pass normalizes a clip with real audio (linear mode)', () => {
  const fx = ensureFixtures();
  const out = path.join(FX_DIR, 'clip-loudnorm.mp4');
  const r = runTsx('capabilities/deliver/loudnorm.ts', ['--in', fx.clipMp4, '--out', out, '--project', '_tests']);
  assertEqual(r.status, 0, `loudnorm exit:\n${r.stderr.slice(-800)}`);
  const env = lastEnvelope(r.stdout);
  assert(env.success && fs.existsSync(out) && fs.statSync(out).size > 0, 'normalized mp4 written');
  assertEqual(env.metrics.twoPass, true, 'a measurable source must take the two-pass linear path');
  const target = env.metrics.target as { i: number; tp: number };
  assert(target.i === -14 && target.tp === -1, 'targets the -14 LUFS / -1 dBTP delivery contract');
});

test('P1K.2 loudnorm.ts BYPASSES the filter on a digitally-silent source (-inf measurement)', () => {
  // Deeper than the V5 F10 guard: dynamic-mode loudnorm on exact-zero samples emits NaN/±Inf
  // and the aac encoder dies — a silent source must be delivered as-is, not "normalized".
  const fx = ensureFixtures();
  const out = path.join(FX_DIR, 'silent-loudnorm.mp4');
  const r = runTsx('capabilities/deliver/loudnorm.ts', ['--in', fx.silentMp4, '--out', out, '--project', '_tests']);
  assertEqual(r.status, 0, `silent-source loudnorm must not fail:\n${r.stderr.slice(-800)}\n${r.stdout.slice(-800)}`);
  const env = lastEnvelope(r.stdout);
  assertEqual(env.metrics.twoPass, false, 'no linear pass on silence');
  assertEqual(env.metrics.bypassed, true, 'filter bypassed — nothing to normalize');
  assert((env as { warnings?: string[] }).warnings?.some((w) => w.includes('digital silence')) === true, 'warning surfaced to the caller');
  assert(fs.existsSync(out) && fs.statSync(out).size > 0, 'output still delivered');
});

test('P1K.3 loudnorm.ts rejects a missing input with a failure envelope', () => {
  const r = runTsx('capabilities/deliver/loudnorm.ts', ['--in', path.join(FX_DIR, 'nope.mp4')]);
  assert(r.status !== 0, 'non-zero exit');
  const env = lastEnvelope(r.stdout);
  assert(env.success === false && /not found/.test(env.error ?? ''), `clear error, got: ${env.error}`);
});

// ── deliver/check-disk-space.ts ─────────────────────────────────────────────────

test('P1K.4 check-disk-space.ts passes on a sane threshold and reports real numbers', () => {
  const r = runTsx('capabilities/deliver/check-disk-space.ts', ['--path', FX_DIR, '--min-gb', '0.001', '--project', '_tests']);
  assertEqual(r.status, 0, `disk guard exit:\n${r.stderr.slice(-400)}`);
  const m = lastEnvelope(r.stdout).metrics as { freeGb: number; totalGb: number; ok: boolean };
  assert(m.ok === true, 'ok flagged');
  assert(m.freeGb > 0 && m.totalGb >= m.freeGb, `plausible numbers: free=${m.freeGb} total=${m.totalGb}`);
});

test('P1K.5 check-disk-space.ts BLOCKS when free space is below the threshold', () => {
  const r = runTsx('capabilities/deliver/check-disk-space.ts', ['--path', FX_DIR, '--min-gb', '99999999']);
  assert(r.status !== 0, 'low disk must exit non-zero (the render must not start)');
  const env = lastEnvelope(r.stdout);
  assert(env.success === false && /free space before rendering/.test(env.error ?? ''), `actionable error, got: ${env.error}`);
});

// ── deliver/render-preset.ts ────────────────────────────────────────────────────

test('P1K.6 presetArgs builds the right codec recipe per preset family', () => {
  const v = presetArgs('vertical-ad', 'MyComp', 'p/clip');
  assertEqual(v.ext, 'mp4', 'social mp4');
  assert(v.args.includes('--codec=h264') && v.args.includes('--crf=18') && v.args.includes('--pixel-format=yuv420p'), `h264 recipe: ${v.args}`);
  assertEqual(v.args[1], 'out/p/clip.mp4', 'outName may carry path segments');

  const t = presetArgs('transparent-overlay', 'Overlay', 'ov');
  assertEqual(t.ext, 'mov', 'alpha = mov');
  assert(t.args.includes('--codec=prores') && t.args.includes('--proresProfile=4444') && t.args.includes('--pixel-format=yuva444p10le'), `prores 4444 alpha recipe: ${t.args}`);

  const g = presetArgs('scene-clip-greenkey', 'Scene', 's');
  assert(g.args.includes('--crf=15'), 'green-key clip uses the low-crf recipe (keying hates blockiness)');

  const y4 = presetArgs('youtube-4k', 'Main', 'm');
  assert(y4.args.includes('--scale=2') && y4.args.includes('--crf=16'), '4K upscales with crf 16');

  let threw = false;
  try { presetArgs('bogus' as never, 'X', 'x'); } catch { threw = true; }
  assert(threw, 'unknown preset throws');
});

test('P1K.7 presetArgs caps --concurrency at the machine cores (GATE V4 live-find)', () => {
  const cores = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  for (const preset of ['vertical-ad', 'youtube-1080'] as const) {
    const conc = presetArgs(preset, 'C', 'c').args.find((a) => a.startsWith('--concurrency='));
    assert(!!conc, 'concurrency always pinned');
    const n = Number((conc as string).split('=')[1]);
    assert(n >= 1 && n <= cores, `concurrency ${n} must be within [1, ${cores}]`);
  }
});

test('P1K.8 render-preset.ts --dry-run plans the local remotion argv without rendering', () => {
  const r = runTsx('capabilities/deliver/render-preset.ts', ['--preset', 'vertical-ad', '--comp', 'DemoWelcome', '--out', '_tests/dryrun', '--dry-run', '--project', '_tests']);
  assertEqual(r.status, 0, `dry-run exit:\n${r.stderr.slice(-400)}`);
  const m = lastEnvelope(r.stdout).metrics as { dryRun: boolean; argv: string[] };
  assert(m.dryRun === true, 'dryRun flagged');
  assertEqual(m.argv[0], 'remotion', 'remotion CLI');
  assertEqual(m.argv[1], 'render', 'render subcommand');
  assertEqual(m.argv[2], 'DemoWelcome', 'comp id');
  assertEqual(m.argv[3], 'out/_tests/dryrun.mp4', 'output path');
  assert(!fs.existsSync(path.join(FX_DIR, '..', '..', '_tests', 'dryrun.mp4')), 'nothing rendered');
});

test('P1K.9 render-preset.ts without --preset/--comp fails with usage', () => {
  const r = runTsx('capabilities/deliver/render-preset.ts', ['--dry-run']);
  assert(r.status !== 0, 'non-zero exit');
  assert(/usage: --preset/.test(lastEnvelope(r.stdout).error ?? ''), 'usage in the failure envelope');
});
