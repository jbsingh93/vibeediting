/** P1C.5 — beat detection (librosa). Slow (numba JIT) → runs in the --render tier only. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertEqual } from './harness';
import { FX_DIR, lastEnvelope, runPy, VENV_PY } from './fixtures';
import { spawnSync } from 'node:child_process';

test('P1C.5 beat-detect.py finds ~120 BPM on a click track → frame list', () => {
  fs.mkdirSync(FX_DIR, { recursive: true });
  const clicks = path.join(FX_DIR, 'clicks.wav');
  if (!fs.existsSync(clicks)) {
    const py = `import numpy as np, soundfile as sf
sr=22050; bpm=120; dur=6; t=np.arange(int(sr*dur))/sr; c=np.zeros_like(t)
for b in np.arange(0,dur,60/bpm):
    i=int(b*sr); c[i:i+220]+=np.sin(2*np.pi*1000*t[:220])*np.hanning(220)
sf.write(r${JSON.stringify(clicks)}, c.astype(np.float32), sr)`;
    const g = spawnSync(VENV_PY, ['-c', py], { encoding: 'utf8' });
    assertEqual(g.status, 0, `click-track gen failed:\n${g.stderr}`);
  }
  const r = runPy('capabilities/ingest/beat-detect.py', ['--in', clicks, '--fps', '30']);
  assertEqual(r.status, 0, `beat-detect exit:\n${r.stderr.slice(-400)}`);
  const m = lastEnvelope(r.stdout).metrics;
  assert((m.beats as number) >= 6, `expected several beats, got ${m.beats}`);
  assert(Math.abs((m.bpm as number) - 120) < 15, `BPM off: ${m.bpm}`);
  assert(Array.isArray(m.beat_frames) && (m.beat_frames as number[]).length >= 6, 'beat frame list present');
});
