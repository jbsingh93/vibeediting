/** P0.9 — the capability contract (GAP-4): envelope, work dir, provenance, model registry. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertEqual } from './harness';
import {
  appendProvenance, describeOutputs, hasEnv, loadDotEnv, modelId, provenancePath, REPO_ROOT, requireInputFile, sha256File, workDir,
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
  assertEqual(desc[0].bytes, 3, 'byte count');
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
  loadDotEnv();
  assert(hasEnv('OPENAI_API_KEY'), 'OPENAI_API_KEY present');
  assert(hasEnv('GEMINI_API_KEY'), 'GEMINI_API_KEY present');
});

test('P0.9 the Python contract mirror exists', () => {
  assert(fs.existsSync(path.join(REPO_ROOT, 'capabilities', '_env', 'contract.py')), 'contract.py present');
});
