import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test, assertEqual, assertIncludes } from './harness';

const ROOT = path.resolve(__dirname, '..', '..');
const DOCTOR = path.join(ROOT, 'capabilities', '_env', 'doctor.ts');

test('P0.3 doctor runs and reports a green core (exit 0 = no RED checks)', () => {
  // Local tsx, never npx (offline-safe + avoids the Windows npx.cmd shim footgun).
  const r = spawnSync(process.execPath, ['--import', 'tsx', DOCTOR], { encoding: 'utf8', cwd: ROOT });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  assertIncludes(out, 'ffmpeg', 'doctor output missing the ffmpeg row');
  assertIncludes(out, 'python venv', 'doctor output missing the python venv row');
  assertIncludes(out, 'GPU', 'doctor output missing the GPU row');
  assertEqual(r.status, 0, `doctor exited ${r.status} (a RED check is present) — output:\n${out}`);
});

test('P0.3 doctor --json emits a single machine-readable line (UI /api/health shape)', () => {
  const r = spawnSync(process.execPath, ['--import', 'tsx', DOCTOR, '--json'], { encoding: 'utf8', cwd: ROOT });
  const line = (r.stdout ?? '').trim().split('\n').filter(Boolean).pop() ?? '';
  const data = JSON.parse(line) as { checks: unknown[]; reds: number; yellows: number; greens: number };
  assertEqual(Array.isArray(data.checks), true, '--json must carry a checks[] array');
  assertEqual(typeof data.reds, 'number', '--json must carry numeric rollups');
});
