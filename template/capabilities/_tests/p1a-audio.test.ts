/** P1A — audio mastering: Pedalboard chain, true-peak loudness finalize, mix/duck. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertEqual } from './harness';
import { ensureFixtures, FX_DIR, lastEnvelope, runPy, runTsx } from './fixtures';

test('P1A.1/.4/.5 master.py runs the creative chain (course-mic-lift profile)', () => {
  const fx = ensureFixtures();
  const out = path.join(FX_DIR, 'mastered.wav');
  const r = runPy('capabilities/audio/master.py', ['--in', fx.voiceWav, '--out', out, '--profile', 'course-mic-lift']);
  assertEqual(r.status, 0, `master.py exit:\n${r.stderr.slice(-600)}`);
  const env = lastEnvelope(r.stdout);
  assert(env.success && fs.existsSync(out), 'mastered output written');
  const chain = (env.metrics.chain as string[]) ?? [];
  assert(chain.includes('Compressor') && chain.includes('Limiter'), `chain missing dynamics: ${chain}`);
});

test('P1A.2 loudness.py normalizes to -14 LUFS / -1 dBTP (within tolerance)', () => {
  const fx = ensureFixtures();
  const out = path.join(FX_DIR, 'loud.wav');
  const r = runPy('capabilities/audio/loudness.py', ['--in', fx.voiceWav, '--out', out, '--target', '-14', '--tp', '-1']);
  assertEqual(r.status, 0, `loudness.py exit:\n${r.stderr.slice(-600)}`);
  const m = lastEnvelope(r.stdout).metrics;
  assert(m.within_tolerance === true, `not within tolerance: lufs_after=${m.lufs_after}`);
  assert(Math.abs((m.lufs_after as number) + 14) <= 1, `LUFS off target: ${m.lufs_after}`);
});

test('P1A.6 mix.py mixes VO+music+SFX with ducking → -14 LUFS', () => {
  const fx = ensureFixtures();
  const out = path.join(FX_DIR, 'mixed.wav');
  const r = runPy('capabilities/audio/mix.py', ['--vo', fx.voiceWav, '--music', fx.musicWav, '--sfx', `${fx.voiceWav}@0.5`, '--out', out, '--project', '_tests']);
  assertEqual(r.status, 0, `mix.py exit:\n${r.stderr.slice(-600)}`);
  const m = lastEnvelope(r.stdout).metrics;
  assert(m.within_tolerance === true, `mix not within tolerance: ${m.lufs_after}`);
});

test('P1A.3 run-mastering.ts (isolated subprocess) → -14 LUFS finalize', () => {
  const fx = ensureFixtures();
  const out = path.join(FX_DIR, 'wrapped.wav');
  const r = runTsx('capabilities/audio/run-mastering.ts', ['--in', fx.voiceWav, '--out', out, '--profile', 'voice', '--project', '_tests']);
  assertEqual(r.status, 0, `run-mastering exit:\n${r.stderr.slice(-600)}`);
  const env = lastEnvelope(r.stdout);
  const loud = (env.metrics.loudness as { within_tolerance?: boolean }) ?? {};
  assert(env.success && loud.within_tolerance === true && fs.existsSync(out), 'wrapped master within tolerance');
});
