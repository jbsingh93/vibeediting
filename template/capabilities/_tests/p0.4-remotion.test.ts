import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test, assert, assertEqual, assertIncludes } from './harness';

const ROOT = path.resolve(__dirname, '..', '..');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const PINNED = '4.0.461';

test(`P0.4 all @remotion/* + remotion are unified to ${PINNED}`, () => {
  const deps: Record<string, string> = { ...PKG.dependencies, ...PKG.devDependencies };
  const remotionPkgs = Object.keys(deps).filter((k) => k === 'remotion' || k.startsWith('@remotion/'));
  assert(remotionPkgs.length >= 8, `expected many remotion packages, found ${remotionPkgs.length}`);
  for (const k of remotionPkgs) {
    assertEqual(deps[k], PINNED, `${k} is ${deps[k]} (every @remotion/* must match core exactly)`);
  }
});

test('P0.4 no platform-specific native package is pinned in deps (cross-platform rule)', () => {
  // npm resolves @remotion/compositor-<platform> etc. via optionalDependencies automatically;
  // pinning one platform's native binary breaks installs on the others.
  const deps: Record<string, string> = { ...PKG.dependencies, ...PKG.devDependencies };
  const platformPinned = Object.keys(deps).filter((k) =>
    /win32|darwin|linux|x64-msvc|arm64-gnu|x64-gnu/.test(k),
  );
  assertEqual(platformPinned.length, 0, `platform-specific packages must not be pinned: ${platformPinned.join(', ')}`);
});

test('P0.2/P0.5 runtime deps are declared: tsx (devDep) + zod (dep)', () => {
  assert(!!PKG.devDependencies?.tsx, 'tsx must be a pinned devDependency (capabilities run under local tsx)');
  assert(!!PKG.dependencies?.zod, 'zod must be a declared dependency (caption/manifest validation)');
});

test('P0.4 `remotion versions` reports all packages on the correct version', () => {
  const r = spawnSync('npx remotion versions', { encoding: 'utf8', shell: true, cwd: ROOT });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  assertIncludes(out, 'All packages have the correct version', `remotion reported a version mismatch:\n${out}`);
});
