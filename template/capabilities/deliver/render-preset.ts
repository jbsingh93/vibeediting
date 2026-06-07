#!/usr/bin/env tsx
/**
 * capabilities/deliver/render-preset.ts — named Remotion render presets (plan P1E.3). Ports render-preset.sh.
 *
 * Builds the argv for `remotion render` per social format. Uses the LOCAL remotion CLI (offline, never npx
 * fetch). `--dry-run` prints the argv without rendering (used by the regression test — real renders are
 * covered by the still-render regression).
 *
 * CLI: tsx render-preset.ts --preset vertical-ad --comp CompId [--out NAME] [--dry-run] [--props FILE]
 */
import * as os from 'node:os';
import * as path from 'node:path';
import { run, runCapability } from '../_env/contract';

export type Preset =
  | 'vertical-ad'
  | 'square-ad'
  | 'portrait-feed'
  | 'youtube-1080'
  | 'youtube-4k'
  | 'reel-60fps'
  | 'transparent-overlay'
  // P3.5b / GAP-53 — Remotion-as-B-roll-clip-generator for external NLE edits.
  | 'scene-clip'
  | 'scene-clip-alpha'
  | 'scene-clip-greenkey';

/**
 * Concurrency capped at the machine's cores: Remotion HARD-FAILS when --concurrency exceeds
 * available CPUs ("concurrency is set higher than the amount of CPU cores available") — the
 * preset targets below are ideals from a big workstation; a 2–4-core laptop must still render.
 * (Live-found on a 3-core CI runner at GATE V4.)
 */
function conc(target: number): string {
  const cores = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  return `--concurrency=${Math.max(1, Math.min(target, cores))}`;
}

/**
 * Returns the remotion-render argv (after "render") for a preset + output path.
 *
 * `outName` may include path segments (e.g. `<project>/scenes/03-attention-trap-v2`) — the
 * caller decides the layout. The function only appends the codec-appropriate extension.
 */
export function presetArgs(preset: Preset, compId: string, outName: string): { ext: string; args: string[] } {
  const base = (ext: string) => `out/${outName}.${ext}`;
  switch (preset) {
    case 'vertical-ad':
    case 'square-ad':
    case 'portrait-feed':
    case 'reel-60fps':
      return { ext: 'mp4', args: [compId, base('mp4'), '--codec=h264', '--crf=18', '--pixel-format=yuv420p', conc(4)] };
    case 'youtube-1080':
      return { ext: 'mp4', args: [compId, base('mp4'), '--codec=h264', '--crf=18', '--pixel-format=yuv420p', conc(8), '--audio-bitrate=192k'] };
    case 'youtube-4k':
      return { ext: 'mp4', args: [compId, base('mp4'), '--scale=2', '--codec=h264', '--crf=16', conc(8), '--audio-bitrate=192k'] };
    case 'transparent-overlay':
      return { ext: 'mov', args: [compId, base('mov'), '--codec=prores', '--proresProfile=4444', '--pixel-format=yuva444p10le', '--image-format=png', conc(4)] };

    // ── scene-clip family (P3.5b / GAP-53) ───────────────────────────────────
    // H.264 1080p B-roll clip. fps is locked at the Composition level (calculateMetadata).
    // Pair with `<SceneClip background='opaque'>` for hard-cut B-roll.
    case 'scene-clip':
      return { ext: 'mp4', args: [compId, base('mp4'), '--codec=h264', '--crf=17', '--pixel-format=yuv420p', conc(4), '--audio-bitrate=192k'] };
    // Alpha-out scene clip — re-uses the ProRes 4444 path so motion sits over a face-cam
    // with no chromakey. Pair with `<SceneClip background='transparent'>`.
    case 'scene-clip-alpha':
      return { ext: 'mov', args: [compId, base('mov'), '--codec=prores', '--proresProfile=4444', '--pixel-format=yuva444p10le', '--image-format=png', conc(4)] };
    // Green-screen H.264 scene clip — comp is rendered ONTO a flat #00FF00 plate; downstream
    // `assemble/chromakey` keys it out. Pair with `<SceneClip background='green-key-friendly' palette={…}>`.
    case 'scene-clip-greenkey':
      return { ext: 'mp4', args: [compId, base('mp4'), '--codec=h264', '--crf=15', '--pixel-format=yuv420p', conc(4), '--audio-bitrate=192k'] };

    default:
      throw new Error(`unknown preset: ${preset}`);
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  await runCapability<Record<string, unknown>>('deliver/render-preset', async () => {
    const preset = arg('preset') as Preset | undefined;
    const comp = arg('comp');
    if (!preset || !comp) throw new Error('usage: --preset <preset> --comp <CompId> [--out NAME] [--dry-run]');
    const outName = arg('out') ?? comp;
    const { ext, args } = presetArgs(preset, comp, outName);
    if (arg('props')) args.push('--props', arg('props') as string);

    const renderArgv = ['remotion', 'render', ...args];
    if (process.argv.includes('--dry-run')) {
      return { outputs: [], metrics: { preset, dryRun: true, argv: renderArgv }, project: arg('project') ?? '_scratch', args: process.argv.slice(2) };
    }
    // local remotion CLI (offline): node node_modules/@remotion/cli/remotion-cli.js
    const r = run('npx', ['--no-install', ...renderArgv]);
    if (r.status !== 0) throw new Error(`render failed (exit ${r.status}):\n${r.stderr.slice(-1500)}`);
    return { outputs: [path.resolve(`out/${outName}.${ext}`)], metrics: { preset }, project: arg('project') ?? '_scratch', args: process.argv.slice(2) };
  });
}

if (require.main === module) void main();
