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

// VE.4: the canonical EDL render comp mounts + renders a frame WITHIN a typed transition window.
// Proves EdlTimeline compiles, calculateMetadata loads the project's segments.json, and the
// transition presentation renders headlessly (the `preview == render` render side; media-free →
// captions carry the non-trivial pixels). The cut math parity itself is locked by the ui unit suite.
test('RENDER regression: EdlTimeline renders a frame inside a typed transition', () => {
  const proj = path.join(ROOT, 'public', 'render-edl');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(
    path.join(proj, 'segments.json'),
    JSON.stringify({
      fps: 30,
      crossfadeFrames: 8,
      segments: [
        { id: 's1', srcStart: 0, srcEnd: 1, cap: '' },
        { id: 's2', srcStart: 0, srcEnd: 1, cap: '', transition: { kind: 'wipe', durationFrames: 10, direction: 'l' } },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(proj, 'captions.json'),
    JSON.stringify([
      { text: 'HELLO', startMs: 0, endMs: 1500, timestampMs: null, confidence: null },
      { text: 'WORLD', startMs: 200, endMs: 1500, timestampMs: null, confidence: null },
    ]),
  );
  const out = path.join(ROOT, 'out', 'check', 'test-edl.png');
  try {
    fs.rmSync(out, { force: true });
  } catch {
    /* nothing to remove */
  }
  // frame 25 sits inside s2's incoming 10f wipe (s2 starts at frame 20 → 5 frames into the wipe)
  const r = spawnSync(
    `npx remotion still EdlTimeline "${out}" --frame=25 --scale=0.3 --props="{\\"project\\":\\"render-edl\\"}"`,
    { encoding: 'utf8', shell: true, cwd: ROOT, timeout: 240000 },
  );
  assert(fs.existsSync(out), `EdlTimeline still was not produced (exit ${r.status})\n${(r.stdout ?? '') + (r.stderr ?? '')}`);
  assert(fs.statSync(out).size > 2000, 'rendered EdlTimeline still is suspiciously small — render likely broken');
});

// VE.5: the launch effect set renders headlessly in EdlTimeline (colorCorrect = CSS filter,
// transform = scale/translate). CSS filters + transforms render identically in @remotion/player and
// headless Chromium (the `preview == render` low-parity basis for D27); the math parity itself is
// locked by the ui unit suite's cross-mirror test. This proves the comp mounts WITH an effects stack.
test('RENDER regression: EdlTimeline renders a frame with per-clip effects (colorCorrect + transform)', () => {
  const proj = path.join(ROOT, 'public', 'render-edl-fx');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(
    path.join(proj, 'segments.json'),
    JSON.stringify({
      fps: 30,
      crossfadeFrames: 0,
      segments: [
        {
          id: 's1',
          srcStart: 0,
          srcEnd: 1,
          cap: '',
          effects: [
            { type: 'transform', scale: 1.2, x: 0, y: -10 },
            { type: 'colorCorrect', brightness: 1.1, contrast: 1.05, saturation: 1.3 },
          ],
        },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(proj, 'captions.json'),
    JSON.stringify([{ text: 'GRADED', startMs: 0, endMs: 1000, timestampMs: null, confidence: null }]),
  );
  const out = path.join(ROOT, 'out', 'check', 'test-edl-fx.png');
  try {
    fs.rmSync(out, { force: true });
  } catch {
    /* nothing to remove */
  }
  const r = spawnSync(
    `npx remotion still EdlTimeline "${out}" --frame=10 --scale=0.3 --props="{\\"project\\":\\"render-edl-fx\\"}"`,
    { encoding: 'utf8', shell: true, cwd: ROOT, timeout: 240000 },
  );
  assert(fs.existsSync(out), `EdlTimeline (effects) still was not produced (exit ${r.status})\n${(r.stdout ?? '') + (r.stderr ?? '')}`);
  assert(fs.statSync(out).size > 2000, 'rendered EdlTimeline (effects) still is suspiciously small — render likely broken');
});
