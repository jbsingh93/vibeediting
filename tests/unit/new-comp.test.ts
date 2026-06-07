/**
 * V3.5 — `vibe new-comp`: kebabization, skeleton generation, Root.tsx registration,
 * idempotency, and name validation.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { kebabize, scaffoldComposition, compSkeleton } from '../../src/commands/new-comp.js';
import { UserError } from '../../src/core/errors.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

const ROOT_TSX = `import React from 'react';
import { Composition } from 'remotion';
import { DemoWelcome } from './demo-welcome/Main';

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="DemoWelcome"
        component={DemoWelcome}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
`;

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'vibe-newcomp-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(path.join(dir, 'src', 'Root.tsx'), ROOT_TSX);
  return dir;
}

const OPTS = { duration: 240, width: 1080, height: 1920, fps: 30 };

describe('kebabize', () => {
  it('splits camel boundaries deterministically', () => {
    expect(kebabize('ShortAd9x16')).toBe('short-ad9x16');
    expect(kebabize('ProductDemo')).toBe('product-demo');
    expect(kebabize('Tutorial16x9')).toBe('tutorial16x9');
  });
});

describe('scaffoldComposition', () => {
  it('creates the skeleton and registers import + <Composition> in Root.tsx', () => {
    const dir = makeProject();
    const r = scaffoldComposition(dir, 'ShortAd9x16', OPTS);
    expect(r.created).toBe(true);
    expect(r.registered).toBe(true);

    const main = readFileSync(path.join(dir, 'src', 'compositions', 'short-ad9x16', 'Main.tsx'), 'utf8');
    expect(main).toContain('export const ShortAd9x16');
    expect(main).toContain("from '../../components'"); // brand-neutral skeleton wires the canonical barrel
    expect(main).toContain('useCurrentFrame'); // frame-driven, per the hard rule
    expect(main).not.toMatch(/animation\s*:/);

    const root = readFileSync(path.join(dir, 'src', 'Root.tsx'), 'utf8');
    expect(root).toContain(`import { ShortAd9x16 } from './compositions/short-ad9x16/Main';`);
    expect(root).toContain('id="ShortAd9x16"');
    expect(root).toContain('durationInFrames={240}');
    expect(root).toContain('width={1080}');
    // The existing registration is untouched.
    expect(root).toContain('id="DemoWelcome"');
  });

  it('is idempotent — keeps the existing Main.tsx and never double-registers', () => {
    const dir = makeProject();
    scaffoldComposition(dir, 'ProductDemo', OPTS);
    writeFileSync(path.join(dir, 'src', 'compositions', 'product-demo', 'Main.tsx'), '// user edited\n');
    const r2 = scaffoldComposition(dir, 'ProductDemo', OPTS);
    expect(r2.created).toBe(false);
    expect(r2.registered).toBe(false);
    expect(readFileSync(path.join(dir, 'src', 'compositions', 'product-demo', 'Main.tsx'), 'utf8')).toBe('// user edited\n');
    const root = readFileSync(path.join(dir, 'src', 'Root.tsx'), 'utf8');
    expect(root.match(/id="ProductDemo"/g)).toHaveLength(1);
  });

  it('rejects invalid names and missing Root.tsx with typed user errors', () => {
    const dir = makeProject();
    expect(() => scaffoldComposition(dir, 'lower-case', OPTS)).toThrowError(UserError);
    expect(() => scaffoldComposition(dir, '9Lives', OPTS)).toThrowError(UserError);
    const empty = mkdtempSync(path.join(tmpdir(), 'vibe-noroot-'));
    cleanups.push(() => rmSync(empty, { recursive: true, force: true }));
    expect(() => scaffoldComposition(empty, 'Fine', OPTS)).toThrowError(UserError);
  });
});

describe('compSkeleton', () => {
  it('bakes the geometry into the header comment', () => {
    const src = compSkeleton('Demo', { duration: 300, width: 1920, height: 1080, fps: 60 });
    expect(src).toContain('1920×1080 @ 60fps, 300 frames (~5.0s)');
    expect(src).toContain('BrandContext');
  });
});
