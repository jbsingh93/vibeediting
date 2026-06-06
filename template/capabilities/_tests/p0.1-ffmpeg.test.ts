import * as fs from 'node:fs';
import { test, assert, assertEqual } from './harness';
import { resolveFfmpeg, probeCapabilities, runSelfTest } from '../_env/ffmpeg';

test('P0.1 resolver finds the full ffmpeg build (not bare PATH)', () => {
  const r = resolveFfmpeg();
  assert(r.ffmpeg !== 'ffmpeg', 'resolver fell back to bare PATH — the full C:\\ffmpeg\\bin build was not found');
  assert(fs.existsSync(r.ffmpeg), `resolved ffmpeg does not exist: ${r.ffmpeg}`);
  assert(fs.existsSync(r.ffprobe), `resolved ffprobe does not exist: ${r.ffprobe}`);
});

test('P0.1 build has every required filter + encoder (GAP-23/41)', () => {
  const caps = probeCapabilities();
  assertEqual(caps.missing.length, 0, `missing capabilities: ${caps.missing.join(', ')}`);
});

test('P0.1 acceptance: loudnorm two-pass + lut3d + scene-detect all run', () => {
  const r = runSelfTest();
  assert(Number.isFinite(r.measuredLufs), `loudnorm produced no usable measurement (got ${r.measuredLufs})`);
  assert(r.sceneCuts.length >= 1, 'scene-detect found no cuts (expected >=1 at the A/B boundary)');
});
