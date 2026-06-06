/** P1D — typed ffmpeg op layer + the idempotent pipeline composer. */
import * as fs from 'node:fs';
import { test, assert, assertEqual } from './harness';
import { ensureFixtures, FX_DIR } from './fixtures';
import { applyLut, mux, normalizeLoudness, trim } from '../assemble/ffmpeg-ops';
import { pipeline } from '../assemble/pipeline';
import { TEAL_LUT } from './fixtures';

test('P1D.1/.2 4-op pipeline (trim→lut→mux→loudnorm) yields a valid MP4', () => {
  const fx = ensureFixtures();
  const r = pipeline(fx.clipMp4, [
    { name: 'trim', run: (i, o) => trim(i, 0.2, 1.8, o) },
    { name: 'lut', run: (i, o) => applyLut(i, TEAL_LUT, o) },
    { name: 'mux', run: (i, o) => mux(i, fx.voiceWav, o) },
    { name: 'loud', run: (i, o) => normalizeLoudness(i, o) },
  ], '_tests', 'assemble');
  assert(r.success, `pipeline failed: ${JSON.stringify(r.steps.map((s) => ({ op: s.op, ok: s.success })))}`);
  assert(r.finalOutput !== null && fs.existsSync(r.finalOutput), 'final mp4 exists');
  assert((r.steps[r.steps.length - 1].durationS ?? 0) > 1, 'final has a real duration');
  assertEqual(r.steps.length, 4, 'all four ops ran');
});

test('P1D.2 pipeline is idempotent (rerun → same final path, success)', () => {
  const fx = ensureFixtures();
  const build = () => pipeline(fx.clipMp4, [
    { name: 'trim', run: (i, o) => trim(i, 0.2, 1.8, o) },
    { name: 'lut', run: (i, o) => applyLut(i, TEAL_LUT, o) },
  ], '_tests', 'assemble-idem');
  const a = build();
  const b = build();
  assert(a.success && b.success, 'both runs succeed');
  assertEqual(a.finalOutput, b.finalOutput, 'deterministic output path');
});

test('P1D.1 trim resets PTS and re-encodes a valid clip', () => {
  const fx = ensureFixtures();
  const out = `${FX_DIR}/trim-only.mp4`;
  const res = trim(fx.clipMp4, 0.5, 1.5, out);
  assert(res.success && (res.durationS ?? 0) > 0.5, `trim failed: ${res.stderr.slice(-300)}`);
});
