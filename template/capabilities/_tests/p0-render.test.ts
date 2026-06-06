import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test, assert } from './harness';

// Opt-in (slow): `npm run test:render`. Bundles + renders, so it's separated from the fast suite.
// Proves the Remotion version unify (P0.4) + parseCaptions-at-import (P0.5) still mount and render.
// `DemoWelcome` is the template's media-free demo composition (registered in src/Root.tsx).
const ROOT = path.resolve(__dirname, '..', '..');

test('RENDER regression: the demo composition renders a non-trivial PNG', () => {
  const out = path.join(ROOT, 'out', 'check', 'test-demo.png');
  try {
    fs.rmSync(out, { force: true });
  } catch {
    /* nothing to remove */
  }
  const r = spawnSync(`npx remotion still DemoWelcome "${out}" --frame=30 --scale=0.3`, {
    encoding: 'utf8',
    shell: true,
    cwd: ROOT,
    timeout: 240000,
  });
  assert(fs.existsSync(out), `still was not produced (exit ${r.status})\n${(r.stdout ?? '') + (r.stderr ?? '')}`);
  assert(fs.statSync(out).size > 2000, 'rendered still is suspiciously small — render likely broken');
});
