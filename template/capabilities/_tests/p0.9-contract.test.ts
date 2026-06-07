/** P0.9 — the capability contract (GAP-4): envelope, work dir, provenance, model registry. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertEqual } from './harness';
import {
  appendProvenance, describeOutputs, hasEnv, loadDotEnv, modelId, provenancePath, REPO_ROOT, requireInputFile, run, sha256File, workDir,
} from '../_env/contract';

test('P0.9 workDir creates out/work/<project>/<stage>/', () => {
  const d = workDir('_contract_test', 'unit');
  assert(fs.existsSync(d), 'work dir should exist');
  assert(d.replace(/\\/g, '/').includes('out/work/_contract_test/unit'), `unexpected work dir: ${d}`);
});

test('P0.9 appendProvenance + describeOutputs (sha256 + bytes)', () => {
  const d = workDir('_contract_test', 'unit');
  const f = path.join(d, 'sample.txt');
  fs.writeFileSync(f, 'vibe');
  const desc = describeOutputs([f]);
  assertEqual(desc.length, 1, 'one described output');
  assertEqual(desc[0].sha256, sha256File(f), 'sha256 matches');
  assertEqual(desc[0].bytes, 4, 'byte count');
  appendProvenance('_contract_test', { ts: new Date().toISOString(), capability: 'unit/test', outputs: desc });
  assert(fs.existsSync(provenancePath('_contract_test')), 'provenance.log written');
});

test('P0.9 modelId reads the single source of truth (whisper-1 + flash-lite)', () => {
  assertEqual(modelId('transcription.cloud'), 'whisper-1', 'STT is OpenAI whisper-1 only');
  assertEqual(modelId('perception.visualCortex'), 'gemini-3.1-flash-lite', 'visual cortex = flash-lite (GAP-38)');
});

test('P0.9 modelId honors envOverride (GEMINI_MODEL)', () => {
  const prev = process.env.GEMINI_MODEL;
  process.env.GEMINI_MODEL = 'gemini-3.1-flash-lite-test';
  assertEqual(modelId('perception.visualCortex'), 'gemini-3.1-flash-lite-test', 'env override wins');
  if (prev === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = prev;
});

test('P0.9 requireInputFile throws on a missing file', async () => {
  let threw = false;
  try { requireInputFile(path.join(REPO_ROOT, 'does-not-exist.xyz')); } catch { threw = true; }
  assert(threw, 'should throw on missing input');
});

test('P0.9 loadDotEnv + hasEnv check PRESENCE only (no secret printing)', () => {
  // Self-contained: append a throwaway key to the project .env, prove presence-only checking
  // works, then restore — no dependency on the user's real keys.
  const envPath = path.join(REPO_ROOT, '.env');
  const before = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : null;
  try {
    fs.appendFileSync(envPath, '\nVIBE_TEST_PRESENCE=not-a-secret\n', 'utf8');
    assert(hasEnv('VIBE_TEST_PRESENCE'), 'VIBE_TEST_PRESENCE present');
    assert(!hasEnv('VIBE_TEST_DEFINITELY_ABSENT'), 'absent key reports absent');
  } finally {
    if (before === null) fs.rmSync(envPath, { force: true });
    else fs.writeFileSync(envPath, before, 'utf8');
  }
  loadDotEnv(); // and the loader itself stays callable
});

test('P0.9 the Python contract mirror exists', () => {
  assert(fs.existsSync(path.join(REPO_ROOT, 'capabilities', '_env', 'contract.py')), 'contract.py present');
});

test('P0.9 run() can spawn a bare npm-shim name (npx) — the Windows .cmd shell path', () => {
  // Regression (live-found V5 Proof A): spawnSync without a shell cannot exec the Windows .cmd
  // shims (npx/tsx/remotion), so render-preset's REAL render path silently failed (status -1).
  // run() now uses a shell for bare command names on win32; this exercises exactly that path on
  // every platform (npx ships with npm — no install, no network).
  const r = run('npx', ['--no-install', 'tsx', '--version'], { cwd: REPO_ROOT });
  assertEqual(r.status, 0, `npx --no-install tsx --version exited ${r.status}: ${r.stderr.slice(-300)}`);
  assert(/\d+\.\d+/.test(r.stdout + r.stderr), 'tsx version string expected');
});

test('P0.9 run() still handles space-bearing absolute paths + quoted args', () => {
  // The shell branch must not regress path/arg quoting (the engine passes absolute ffmpeg paths
  // and filter strings with spaces). node -e through a bare name exercises arg quoting under the
  // shell; an absolute node path exercises the shell-free branch.
  const viaShim = run('node', ['-e', 'console.log("a b")']);
  assertEqual(viaShim.status, 0, `bare-name node -e failed: ${viaShim.stderr.slice(-200)}`);
  assert(viaShim.stdout.includes('a b'), 'quoted arg survived the shell branch');
  const viaPath = run(process.execPath, ['-e', 'console.log("c d")']);
  assertEqual(viaPath.status, 0, 'absolute-path spawn failed');
  assert(viaPath.stdout.includes('c d'), 'absolute-path arg passing intact');
});
