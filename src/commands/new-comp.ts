/**
 * `vibe new-comp <Name>` — scaffold a Remotion composition folder and register it in
 * src/Root.tsx (port of the parent's new-composition scaffolder, brand-neutral skeleton).
 * Idempotent: never overwrites an existing Main.tsx, never double-registers an id.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import type { Command } from 'commander';
import { UserError, FsError } from '../core/errors.js';

const NAME_RE = /^[A-Z][A-Za-z0-9]*$/;

/** PascalCase → kebab-case folder name (ShortAd9x16 → short-ad9x16, ProductDemo → product-demo). */
export function kebabize(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export interface NewCompOptions {
  duration: number;
  width: number;
  height: number;
  fps: number;
}

export function compSkeleton(name: string, opts: NewCompOptions): string {
  const seconds = (opts.duration / opts.fps).toFixed(1);
  return `/**
 * ${name} — ${opts.width}×${opts.height} @ ${opts.fps}fps, ${opts.duration} frames (~${seconds}s).
 * Scaffolded by \`vibe new-comp\`. Replace the placeholder scene with your storyboard —
 * one file per scene in this folder; all motion frame-driven (no CSS animations).
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { BrandContext, useBrand } from '../../components';

const Scene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const brand = useBrand();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: brand.colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: brand.fonts.heading,
      }}
    >
      <div style={{ color: brand.colors.accent, fontSize: 64, fontWeight: brand.weights.black }}>
        ${name}
      </div>
      <div style={{ color: brand.colors.muted, fontSize: 24, marginTop: 16 }}>
        Frame {frame} / {durationInFrames}
      </div>
    </AbsoluteFill>
  );
};

export const ${name}: React.FC = () => (
  <BrandContext>
    <Scene />
  </BrandContext>
);
`;
}

export interface NewCompResult {
  mainFile: string;
  registered: boolean;
  created: boolean;
}

export function scaffoldComposition(projectDir: string, name: string, opts: NewCompOptions): NewCompResult {
  if (!NAME_RE.test(name)) {
    throw new UserError(
      `"${name}" is not a valid composition name`,
      'Use PascalCase letters/digits starting with a capital — e.g. ShortAd9x16, ProductDemo.',
    );
  }
  const rootTsx = path.join(projectDir, 'src', 'Root.tsx');
  if (!fs.existsSync(rootTsx)) {
    throw new UserError('src/Root.tsx not found — is this a vibe project?', 'Run from the project root, or pass --project <dir>.');
  }

  const kebab = kebabize(name);
  const compDir = path.join(projectDir, 'src', 'compositions', kebab);
  const mainFile = path.join(compDir, 'Main.tsx');

  let created = false;
  if (!fs.existsSync(mainFile)) {
    fs.mkdirSync(compDir, { recursive: true });
    fs.writeFileSync(mainFile, compSkeleton(name, opts));
    created = true;
  }

  let root = fs.readFileSync(rootTsx, 'utf8');
  let registered = false;
  if (!new RegExp(`id="${name}"`).test(root)) {
    const importLine = `import { ${name} } from './compositions/${kebab}/Main';`;
    if (!root.includes(importLine)) {
      const imports = [...root.matchAll(/^import .*;$/gm)];
      const last = imports[imports.length - 1];
      if (!last || last.index === undefined) throw new FsError('src/Root.tsx has no import lines to anchor on');
      const at = last.index + last[0].length;
      root = `${root.slice(0, at)}\n${importLine}${root.slice(at)}`;
    }
    const compEntry = [
      `      <Composition`,
      `        id="${name}"`,
      `        component={${name}}`,
      `        durationInFrames={${opts.duration}}`,
      `        fps={${opts.fps}}`,
      `        width={${opts.width}}`,
      `        height={${opts.height}}`,
      `      />`,
    ].join('\n');
    const closing = root.lastIndexOf('    </>');
    if (closing === -1) {
      throw new FsError(
        'could not find the closing `</>` in src/Root.tsx',
        `Add the <Composition id="${name}" …> entry by hand.`,
      );
    }
    root = `${root.slice(0, closing)}${compEntry}\n${root.slice(closing)}`;
    fs.writeFileSync(rootTsx, root);
    registered = true;
  }

  return { mainFile, registered, created };
}

export function registerNewCompCommand(program: Command): void {
  program
    .command('new-comp <name>')
    .description('scaffold a new Remotion composition and register it in Root.tsx')
    .option('-d, --duration <frames>', 'duration in frames', '150')
    .option('-w, --width <px>', 'width in px', '1920')
    .option('--height <px>', 'height in px', '1080')
    .option('-f, --fps <fps>', 'frames per second', '30')
    .action((name: string, opts: { duration: string; width: string; height: string; fps: string }, cmd: Command) => {
      const globals = cmd.optsWithGlobals<{ project?: string }>();
      const projectDir = path.resolve(globals.project ?? process.cwd());
      const parsed: NewCompOptions = {
        duration: Number.parseInt(opts.duration, 10),
        width: Number.parseInt(opts.width, 10),
        height: Number.parseInt(opts.height, 10),
        fps: Number.parseInt(opts.fps, 10),
      };
      for (const [k, v] of Object.entries(parsed)) {
        if (!Number.isFinite(v) || v <= 0) throw new UserError(`invalid --${k}: must be a positive number`);
      }
      const r = scaffoldComposition(projectDir, name, parsed);
      const kebab = kebabize(name);
      process.stderr.write(
        `${chalk.green('✓')} ${r.created ? 'created' : 'kept existing'} src/compositions/${kebab}/Main.tsx\n` +
          `${chalk.green('✓')} ${r.registered ? `registered "${name}" in src/Root.tsx` : `"${name}" already registered`}\n` +
          chalk.dim(`  quick check: npx remotion still ${name} out/check-${kebab}.png --frame=0 --scale=0.25\n`),
      );
    });
}
