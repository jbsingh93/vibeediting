/** P1B — color: house LUTs, ffmpeg grade + intensity, correction, colorimetric still grade. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertEqual } from './harness';
import { ensureFixtures, FX_DIR, lastEnvelope, runPy, runTsx } from './fixtures';
import { REPO_ROOT } from '../_env/contract';

const LUT_DIR = path.join(REPO_ROOT, 'capabilities', 'color', 'luts');
const HOUSE_LUTS = ['neutral-correct.cube', 'warm-cine.cube', 'teal-orange.cube', 'film-kodak2383.cube'];

test('P1B.1 the four house LUTs exist and are valid size-33 .cube files', () => {
  for (const name of HOUSE_LUTS) {
    const p = path.join(LUT_DIR, name);
    assert(fs.existsSync(p), `missing LUT: ${name}`);
    const txt = fs.readFileSync(p, 'utf8');
    assert(/LUT_3D_SIZE\s+33/.test(txt), `${name} not size 33`);
    const dataLines = txt.split('\n').filter((l) => /^[0-9.]+\s+[0-9.]+\s+[0-9.]+$/.test(l.trim()));
    assertEqual(dataLines.length, 33 ** 3, `${name} wrong entry count`);
  }
});

test('P1B.2 grade.ts applies a look LUT (full + intensity blend)', () => {
  const fx = ensureFixtures();
  const full = path.join(FX_DIR, 'graded.mp4');
  let r = runTsx('capabilities/color/grade.ts', ['--in', fx.clipMp4, '--out', full, '--lut', 'teal-orange']);
  assertEqual(r.status, 0, `grade full exit:\n${r.stderr.slice(-500)}`);
  assert(lastEnvelope(r.stdout).success && fs.existsSync(full), 'graded output written');

  const half = path.join(FX_DIR, 'graded50.mp4');
  r = runTsx('capabilities/color/grade.ts', ['--in', fx.clipMp4, '--out', half, '--lut', 'warm-cine', '--intensity', '0.5']);
  assertEqual(r.status, 0, `grade intensity exit:\n${r.stderr.slice(-500)}`);
  assertEqual(lastEnvelope(r.stdout).metrics.intensity, 0.5, 'intensity recorded');
});

test('P1B.4 correct.ts neutralizes WB/contrast/saturation (separate from grade)', () => {
  const fx = ensureFixtures();
  const out = path.join(FX_DIR, 'corrected.mp4');
  const r = runTsx('capabilities/color/correct.ts', ['--in', fx.clipMp4, '--out', out, '--temperature', '5200', '--contrast', '1.1']);
  assertEqual(r.status, 0, `correct exit:\n${r.stderr.slice(-500)}`);
  assert(lastEnvelope(r.stdout).success && fs.existsSync(out), 'corrected output written');
});

test('P1B.3 grade.py colorimetric still grade (colour-science)', () => {
  const fx = ensureFixtures();
  const out = path.join(FX_DIR, 'graded.png');
  const r = runPy('capabilities/color/grade.py', ['--in', fx.imagePng, '--out', out, '--lut', 'film-kodak2383']);
  assertEqual(r.status, 0, `grade.py exit:\n${r.stderr.slice(-500)}`);
  assert(lastEnvelope(r.stdout).success && fs.existsSync(out), 'graded still written');
});
