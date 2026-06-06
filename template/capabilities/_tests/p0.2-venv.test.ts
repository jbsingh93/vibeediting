import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test, assert, assertEqual } from './harness';
import { VENV_PY } from '../_env/contract';

const ROOT = path.resolve(__dirname, '..', '..');
const REQ = path.join(ROOT, 'capabilities', 'requirements.txt');

test('P0.2 venv python exists', () => {
  assert(fs.existsSync(VENV_PY), `venv python missing at ${VENV_PY} — run \`tsx capabilities/_env/setup-venv.ts\` (or \`vibe setup --venv\`)`);
});

test('P0.2 all capability imports succeed in the venv', () => {
  const r = spawnSync(
    VENV_PY,
    ['-c', 'import pedalboard, pyloudnorm, soundfile, numpy, PIL, colour, cv2'],
    { encoding: 'utf8' },
  );
  assertEqual(r.status, 0, `import failed: ${(r.stderr ?? '').trim().split('\n').pop()}`);
});

test('P0.2 installed versions match the pinned requirements.txt', () => {
  const pins = fs
    .readFileSync(REQ, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('=='))
    .map((l) => {
      const [name, version] = l.split('==');
      return { name: name.trim(), version: version.trim() };
    });
  assert(pins.length >= 6, `expected >=6 pinned deps in requirements.txt, found ${pins.length}`);
  const py = `import importlib.metadata as m; ${pins.map((p) => `print(m.version('${p.name}'))`).join('; ')}`;
  const r = spawnSync(VENV_PY, ['-c', py], { encoding: 'utf8' });
  assertEqual(r.status, 0, `version query failed: ${(r.stderr ?? '').trim()}`);
  const got = (r.stdout ?? '').trim().split('\n').map((s) => s.trim());
  pins.forEach((p, i) => assertEqual(got[i], p.version, `${p.name} version drift (requirements.txt vs installed)`));
});
