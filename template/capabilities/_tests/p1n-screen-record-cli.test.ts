/** P1N — screen-record/record-session + cdp-screencast CLI guards. The pure logic (actions/pacing/
 *  encode/guards) is unit-tested in P1G; here we prove the CLIs themselves fail fast with a clean
 *  failure ENVELOPE before any browser is launched (playwright stays a dynamic on-demand import). */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertIncludes } from './harness';
import { ensureFixtures, lastEnvelope, runTsx } from './fixtures';
import { REPO_ROOT } from '../_env/contract';

const CLIS = ['capabilities/screen-record/record-session.ts', 'capabilities/screen-record/cdp-screencast.ts'];

test('P1N.1 both capture CLIs reject a missing --plan with a failure envelope', () => {
  for (const cli of CLIS) {
    const r = runTsx(cli, []);
    assert(r.status !== 0, `${cli}: non-zero exit`);
    const env = lastEnvelope(r.stdout);
    assert(env.success === false && /missing plan path/.test(env.error ?? ''), `${cli}: plan named, got: ${env.error}`);
  }
});

test('P1N.2 both capture CLIs reject a missing --project before doing anything', () => {
  const fx = ensureFixtures();
  for (const cli of CLIS) {
    const r = runTsx(cli, ['--plan', fx.capsJson]);
    assert(r.status !== 0, `${cli}: non-zero exit`);
    const env = lastEnvelope(r.stdout);
    assert(env.success === false && /missing --project/.test(env.error ?? ''), `${cli}: project named, got: ${env.error}`);
  }
});

test('P1N.3 source contract: playwright is an ON-DEMAND dynamic import (GAP-67), never top-level', () => {
  for (const cli of CLIS) {
    const code = fs.readFileSync(path.join(REPO_ROOT, cli), 'utf8');
    assertIncludes(code, "await import('playwright')", `${cli}: dynamic import`);
    assert(!/^import .*from 'playwright'/m.test(code), `${cli}: no static playwright import`);
    assertIncludes(code, 'assertSafeOutputPath', `${cli}: output path goes through the security guard (GAP-65)`);
  }
});

test('P1N.4 source contract: CDP capture acks every frame (single-frame flow control, GAP-62)', () => {
  const code = fs.readFileSync(path.join(REPO_ROOT, 'capabilities/screen-record/cdp-screencast.ts'), 'utf8');
  assertIncludes(code, 'Page.screencastFrameAck', 'frame ACK present — without it Chrome stops sending');
  assertIncludes(code, 'buildConcatManifest', 'timing reconstructed via the unit-tested concat manifest');
});

test('P1N.5 frozen-capture guard flags off-display screencast starvation (VT.4 F14)', async () => {
  const { isFrozenCapture } = await import('../screen-record/record-session');
  // screencast/screenshot froze: expected many frames (≥10) but captured ≤1 → frozen
  assert(isFrozenCapture('screencast', 1, 6.5, 30) === true, 'screencast 1 frame over 6.5s → frozen');
  assert(isFrozenCapture('screenshot', 0, 5, 30) === true, 'screenshot 0 frames over 5s → frozen');
  // a healthy capture (frames ≈ wall×fps) is NOT frozen
  assert(isFrozenCapture('screenshot', 126, 5.3, 30) === false, 'screenshot 126 frames → not frozen');
  // a genuinely tiny plan (expected < 10 frames) must not false-positive
  assert(isFrozenCapture('screencast', 1, 0.2, 30) === false, 'tiny 0.2s plan → not flagged');
  // gdigrab is ffmpeg-clock-driven → never considered frozen by this guard
  assert(isFrozenCapture('gdigrab', 1, 6.5, 30) === false, 'gdigrab exempt');
});
