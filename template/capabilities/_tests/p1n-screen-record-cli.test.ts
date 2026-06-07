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
