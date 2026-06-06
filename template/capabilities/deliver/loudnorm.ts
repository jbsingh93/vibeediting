#!/usr/bin/env tsx
/**
 * capabilities/deliver/loudnorm.ts — delivery loudness normalize (plan P1E.3). Ports loudnorm.sh.
 *
 * Single-pass `loudnorm=I=-14:TP=-1:LRA=11` on a finished MP4 (video stream copied), via the full-build
 * resolver (not bare `ffmpeg`). For audio-only the rigorous 2-pass true-peak finalize is audio/loudness.py.
 *
 * CLI: tsx loudnorm.ts --in IN.mp4 [--out OUT.mp4] [--i -14] [--tp -1] [--lra 11] [--project NAME]
 */
import * as path from 'node:path';
import { requireInputFile, run, runCapability } from '../_env/contract';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  await runCapability('deliver/loudnorm', async () => {
    const { resolveFfmpeg } = await import('../_env/ffmpeg');
    const { ffmpeg } = resolveFfmpeg();
    const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    const input = requireInputFile(arg('in') ?? positional[0], 'input mp4');
    const i = arg('i') ?? '-14', tp = arg('tp') ?? '-1', lra = arg('lra') ?? '11';
    const out = arg('out') ?? input.replace(/\.[^.]+$/, '') + '-loudnorm.mp4';

    const r = run(ffmpeg, ['-y', '-i', input, '-af', `loudnorm=I=${i}:TP=${tp}:LRA=${lra}`,
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', out]);
    if (r.status !== 0) throw new Error(`loudnorm failed (exit ${r.status}):\n${r.stderr.slice(-1200)}`);

    return { outputs: [path.resolve(out)], metrics: { target: { i: +i, tp: +tp, lra: +lra } }, project: arg('project') ?? '_scratch', args: process.argv.slice(2) };
  });
}

void main();
