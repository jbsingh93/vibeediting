/** P4W — the VFX EXECUTABLE layer, run live (P4V covers the pure router/cost/cache/sanitize logic):
 *  color-match transfer.py (Reinhard LAB, image + video + EMA), the match.ts launcher envelope,
 *  and the pure-ffmpeg compositor fallback. CPU-only, offline, no API spend. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertEqual, assertIncludes } from './harness';
import { ensureFixtures, FX_DIR, lastEnvelope, runPy, runTsx } from './fixtures';

test('P4W.1 transfer.py shifts a still toward the reference LAB stats (image path)', () => {
  const fx = ensureFixtures();
  const out = path.join(FX_DIR, 'cm-image.png');
  const r = runPy('capabilities/vfx/color-match/transfer.py', ['--in', fx.imagePng, '--reference', fx.orangePng, '--out', out, '--project', '_tests']);
  assertEqual(r.status, 0, `transfer.py exit:\n${r.stderr.slice(-800)}`);
  const env = lastEnvelope(r.stdout);
  assert(env.success && fs.existsSync(out) && fs.statSync(out).size > 0, 'graded still written');
  const m = env.metrics as { frames: number; ref_mean_lab: number[] };
  assertEqual(m.frames, 1, 'single frame');
  assert(Array.isArray(m.ref_mean_lab) && m.ref_mean_lab.length === 3, 'reference LAB stats reported');
  assert(fs.readFileSync(out).length !== fs.readFileSync(fx.imagePng).length || !fs.readFileSync(out).equals(fs.readFileSync(fx.imagePng)), 'output differs from source (grade applied)');
});

test('P4W.2 transfer.py grades a VIDEO per-frame with temporal EMA and remuxes via the full ffmpeg', () => {
  const fx = ensureFixtures();
  const out = path.join(FX_DIR, 'cm-video.mp4');
  const r = runPy('capabilities/vfx/color-match/transfer.py', ['--in', fx.clipMp4, '--reference', fx.orangePng, '--out', out, '--ema', '0.1', '--project', '_tests']);
  assertEqual(r.status, 0, `transfer.py video exit:\n${r.stderr.slice(-800)}`);
  const m = lastEnvelope(r.stdout).metrics as { frames: number; fps: number; ema: number };
  assert(m.frames >= 30, `all frames graded (got ${m.frames} of a 2s/30fps clip)`);
  assertEqual(m.ema, 0.1, 'EMA anti-flicker engaged');
  assert(fs.existsSync(out) && fs.statSync(out).size > 0, 'H.264 deliverable written');
});

test('P4W.3 match.ts launcher wraps transfer.py in the capability envelope contract', () => {
  const fx = ensureFixtures();
  const out = path.join(FX_DIR, 'cm-launcher.png');
  const r = runTsx('capabilities/vfx/color-match/match.ts', ['--in', fx.imagePng, '--reference', fx.orangePng, '--out', out, '--project', '_tests']);
  assertEqual(r.status, 0, `match.ts exit:\n${r.stderr.slice(-800)}`);
  const env = lastEnvelope(r.stdout);
  assertEqual(env.capability, 'vfx/color-match', 'envelope capability id');
  assert(env.success && env.outputs[0] === out && fs.existsSync(out), 'inner outputs surfaced into the launcher envelope');
  assertEqual((env.metrics as { frames: number }).frames, 1, 'inner metrics surfaced');
});

test('P4W.4 match.ts rejects missing inputs with clear errors', () => {
  const fx = ensureFixtures();
  const r = runTsx('capabilities/vfx/color-match/match.ts', ['--in', fx.imagePng, '--reference', fx.orangePng]);
  assert(r.status !== 0, 'non-zero exit');
  assertIncludes(lastEnvelope(r.stdout).error ?? '', 'missing --out', 'missing --out named');
});

test('P4W.5 composite.ts with no layers is a clean passthrough copy of the base', () => {
  const fx = ensureFixtures();
  const out = path.join(FX_DIR, 'comp-pass.mp4');
  const r = runTsx('capabilities/vfx/compositor/composite.ts', ['--base', fx.clipMp4, '--out', out, '--project', '_tests']);
  assertEqual(r.status, 0, `composite passthrough exit:\n${r.stderr.slice(-600)}`);
  const env = lastEnvelope(r.stdout);
  const m = env.metrics as { stages: string[]; baseStreams: string };
  assert(m.stages.length === 0 && m.baseStreams === 'passthrough', 'no stages ran');
  assertEqual(fs.statSync(out).size, fs.statSync(fx.clipMp4).size, 'byte-identical copy of the base');
});

test('P4W.6 composite.ts screen-blends a VFX clip atop the base via ffmpeg (live)', () => {
  const fx = ensureFixtures();
  const out = path.join(FX_DIR, 'comp-blend.mp4');
  const r = runTsx('capabilities/vfx/compositor/composite.ts', ['--base', fx.clipMp4, '--screen-blend', fx.sceneMp4, '--out', out, '--project', '_tests']);
  assertEqual(r.status, 0, `screen-blend exit:\n${r.stderr.slice(-800)}`);
  const env = lastEnvelope(r.stdout);
  const m = env.metrics as { stages: string[] };
  assert(m.stages.length === 1 && m.stages[0] === 'screenBlend', 'screenBlend stage recorded');
  assert(fs.existsSync(out) && fs.statSync(out).size > 0, 'blended mp4 written');
  assert(!fs.existsSync(path.join(FX_DIR, '.composite-A-comp-blend.mp4')), 'intermediates cleaned');
});

test('P4W.7 composite.ts rejects a missing base plate', () => {
  const r = runTsx('capabilities/vfx/compositor/composite.ts', ['--base', path.join(FX_DIR, 'nope.mp4'), '--out', path.join(FX_DIR, 'x.mp4')]);
  assert(r.status !== 0, 'non-zero exit');
  assertIncludes(lastEnvelope(r.stdout).error ?? '', 'base plate not found', 'base named');
});
