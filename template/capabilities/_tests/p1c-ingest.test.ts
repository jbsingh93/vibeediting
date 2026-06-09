/** P1C — ingest: probe, scene-detect, VAD/filler/dedup, transcribe (OpenAI-only) guard. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertEqual } from './harness';
import { ensureFixtures, lastEnvelope, runPy, runTsx } from './fixtures';
import { REPO_ROOT } from '../_env/contract';
import { displayGeometry, displayRotation } from '../ingest/probe';

test('P1C.3 probe.ts derives durationInFrames from the real duration', () => {
  const fx = ensureFixtures();
  const r = runTsx('capabilities/ingest/probe.ts', ['--in', fx.clipMp4, '--fps', '30']);
  assertEqual(r.status, 0, `probe exit:\n${r.stderr.slice(-400)}`);
  const m = lastEnvelope(r.stdout).metrics;
  assertEqual(m.durationInFrames, 60, '2s @30fps = 60 frames');
});

test('P1C.3b probe reports DISPLAY orientation — a phone-vertical clip (stored landscape + rotate flag) is portrait, not landscape', () => {
  // The exact GATE-VQ live-found case: a 1080×1920 phone reel stored as a 1920×1080 frame + a 90°
  // flag. Ignoring the flag mislabels it "landscape" and the whole reframe/QA context cascades wrong.
  const phone = displayGeometry({ codec_type: 'video', width: 1920, height: 1080, side_data_list: [{ rotation: 90 }] });
  assertEqual(phone.rotation, 90, '90° flag read from side_data displaymatrix');
  assertEqual(phone.width, 1080, 'display width = stored height (swapped)');
  assertEqual(phone.height, 1920, 'display height = stored width (swapped)');
  assertEqual(phone.orientation, 'portrait', 'a phone-vertical clip reads portrait');
  assertEqual(phone.aspectRatio, 0.5625, 'exactly 9:16 — already the target, NOT a landscape to reframe');
  // legacy mov rotate tag (older phones) — same result via tags.rotate
  assertEqual(displayRotation({ codec_type: 'video', tags: { rotate: '270' } }), 270, 'legacy rotate tag parsed');
  assertEqual(displayGeometry({ codec_type: 'video', width: 1920, height: 1080, tags: { rotate: '270' } }).orientation, 'portrait', '270° also swaps to portrait');
  // a genuine landscape (no flag) is unchanged; 180° flips but stays landscape
  const land = displayGeometry({ codec_type: 'video', width: 1920, height: 1080 });
  assertEqual(land.orientation, 'landscape', 'no flag → landscape unchanged');
  assertEqual(displayGeometry({ codec_type: 'video', width: 1920, height: 1080, side_data_list: [{ rotation: 180 }] }).orientation, 'landscape', '180° is upside-down, still landscape (no W/H swap)');
});

test('P1C.3 scene-detect.ts finds the hard cut', () => {
  const fx = ensureFixtures();
  const r = runTsx('capabilities/ingest/scene-detect.ts', ['--in', fx.sceneMp4, '--threshold', '0.3', '--fps', '30']);
  assertEqual(r.status, 0, `scene-detect exit:\n${r.stderr.slice(-400)}`);
  assert((lastEnvelope(r.stdout).metrics.cutCount as number) >= 1, 'at least one cut detected');
});

test('P1C.4 vad-cut.py detects silence + filler word + last-take duplicate', () => {
  const fx = ensureFixtures();
  const r = runPy('capabilities/ingest/vad-cut.py', ['--in', fx.silenceWav, '--captions', fx.capsJson, '--dedup']);
  assertEqual(r.status, 0, `vad-cut exit:\n${r.stderr.slice(-400)}`);
  const m = lastEnvelope(r.stdout).metrics;
  assert((m.silences as number) >= 1, 'silence detected');
  assert((m.fillers_found as unknown[]).length >= 1, 'filler "um" found');
  assert((m.duplicates as unknown[]).length >= 1, 'last-take duplicate found');
});

test('P1C.1 transcribe.ts errors cleanly without input (no crash)', () => {
  const r = runTsx('capabilities/ingest/transcribe.ts', []);
  assert(r.status !== 0, 'should exit non-zero with no input');
  assert(lastEnvelope(r.stdout).success === false, 'emits a failure envelope');
});

test('P1C.1/.2 transcribe.ts is OpenAI whisper-1 ONLY (no local STT path)', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'capabilities', 'ingest', 'transcribe.ts'), 'utf8');
  assert(/modelId\(['"]transcription\.cloud['"]\)/.test(src), 'reads whisper-1 from models.json');
  // guard against an ACTUAL local-STT import (not the prohibition comment)
  assert(!/(import|require|from)\s+['"][^'"]*faster[-_]?whisper/i.test(src), 'no faster-whisper / local STT import');
});
