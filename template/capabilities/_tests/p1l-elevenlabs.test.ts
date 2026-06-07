/** P1L — generate/elevenlabs-{tts,music,sfx}: key guard + arg validation fire BEFORE any network call.
 *  No API spend, no network: keys are pinned to '' (forces the guard even when .env has one — loadDotEnv
 *  never overwrites a defined var) or to a fake value where validation must reject first. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertIncludes } from './harness';
import { runTsxEnv } from './fixtures';
import { REPO_ROOT } from '../_env/contract';

const NO_KEY = { ELEVENLABS_API_KEY: '' };
const FAKE_KEY = { ELEVENLABS_API_KEY: 'unit-test-fake-key' };

const src = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('P1L.1 all three refuse to run without ELEVENLABS_API_KEY (and never print a value)', () => {
  for (const tool of ['elevenlabs-tts', 'elevenlabs-music', 'elevenlabs-sfx']) {
    const r = runTsxEnv(`capabilities/generate/${tool}.ts`, ['hello', 'out/_tests/x.mp3'], NO_KEY);
    assert(r.status !== 0, `${tool}: non-zero exit without a key`);
    assertIncludes(r.stderr, 'ELEVENLABS_API_KEY missing', `${tool}: names the missing key`);
    assertIncludes(r.stderr, 'elevenlabs.io', `${tool}: points at where to get one`);
  }
});

test('P1L.2 tts without args fails with usage (before any voice lookup)', () => {
  const r = runTsxEnv('capabilities/generate/elevenlabs-tts.ts', [], FAKE_KEY);
  assert(r.status !== 0, 'non-zero exit');
  assertIncludes(r.stderr, 'Usage:', 'usage shown');
});

test('P1L.3 tts rejects a missing @script file before synthesis', () => {
  const r = runTsxEnv('capabilities/generate/elevenlabs-tts.ts', ['@out/_tests/no-such-script.txt', 'out/_tests/x.mp3'], FAKE_KEY);
  assert(r.status !== 0, 'non-zero exit');
  assertIncludes(r.stderr, 'Script file not found', 'clear file error');
});

test('P1L.4 music validates music_length_ms bounds (3000-600000) before composing', () => {
  for (const ms of ['100', '999999999']) {
    const r = runTsxEnv('capabilities/generate/elevenlabs-music.ts', ['lofi bed', 'out/_tests/bgm.mp3', '--ms', ms], FAKE_KEY);
    assert(r.status !== 0, `--ms ${ms}: non-zero exit`);
    assertIncludes(r.stderr, 'music length must be 3000-600000', `--ms ${ms}: bounds named`);
  }
});

test('P1L.5 sfx validates --seconds bounds (0.5-30) before generating', () => {
  const r = runTsxEnv('capabilities/generate/elevenlabs-sfx.ts', ['big whoosh', 'out/_tests/sfx.mp3', '--seconds', '99'], FAKE_KEY);
  assert(r.status !== 0, 'non-zero exit');
  assertIncludes(r.stderr, '--seconds must be 0.5-30', 'bounds named');
});

test('P1L.6 source contract: defaults + brand-voice boundary stay pinned', () => {
  const tts = src('capabilities/generate/elevenlabs-tts.ts');
  assertIncludes(tts, "'eleven_multilingual_v2'", 'tts default model');
  assertIncludes(tts, 'elevenlabsVoiceId', 'default voice comes from brand/brand.json (the config boundary)');
  const music = src('capabilities/generate/elevenlabs-music.ts');
  assertIncludes(music, "'music_v1'", 'music default model');
  assertIncludes(music, 'instrumental = !flags.vocals', 'BGM defaults to instrumental');
  const sfx = src('capabilities/generate/elevenlabs-sfx.ts');
  assertIncludes(sfx, "'eleven_text_to_sound_v2'", 'sfx default model');
});
