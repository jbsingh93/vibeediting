#!/usr/bin/env tsx
/**
 * capabilities/color/correct.ts — primary color CORRECTION (plan P1B.4).
 *
 * The correction-vs-grade split (DR §"color correction vs grading"): `correct` NEUTRALIZES
 * exposure / white-balance / contrast / saturation (technical), separate from `grade` (a creative
 * look LUT, grade.ts). Correct first, then grade.
 *
 * Built on the full ffmpeg: `colortemperature` (WB Kelvin), `eq` (brightness/contrast/saturation/gamma),
 * `colorbalance` (per-range RGB lift/gamma/gain).
 *
 * CLI:
 *   tsx correct.ts --in IN.mp4 --out OUT.mp4 [--temperature 6500] [--brightness 0] [--contrast 1.0]
 *       [--saturation 1.0] [--gamma 1.0] [--shadows-r 0 --shadows-b 0 --highlights-r 0 --highlights-b 0]
 *       [--project NAME]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { requireInputFile, run, runCapability } from '../_env/contract';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function num(name: string, def: number): number {
  const v = arg(name);
  return v === undefined ? def : parseFloat(v);
}

async function main(): Promise<void> {
  await runCapability('color/correct', async () => {
    const { resolveFfmpeg } = await import('../_env/ffmpeg');
    const { ffmpeg } = resolveFfmpeg();

    const inPath = requireInputFile(arg('in'), 'input video');
    const outPath = arg('out');
    if (!outPath) throw new Error('missing --out');
    const project = arg('project') ?? '_scratch';

    const temperature = num('temperature', 6500);
    const brightness = num('brightness', 0);
    const contrast = num('contrast', 1);
    const saturation = num('saturation', 1);
    const gamma = num('gamma', 1);
    const sr = num('shadows-r', 0), sb = num('shadows-b', 0);
    const hr = num('highlights-r', 0), hb = num('highlights-b', 0);

    const chain: string[] = [];
    if (temperature !== 6500) chain.push(`colortemperature=temperature=${temperature}`);
    if (brightness !== 0 || contrast !== 1 || saturation !== 1 || gamma !== 1) {
      chain.push(`eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}:gamma=${gamma}`);
    }
    if (sr || sb || hr || hb) {
      chain.push(`colorbalance=rs=${sr}:bs=${sb}:rh=${hr}:bh=${hb}`);
    }
    chain.push('format=yuv420p');

    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    const r = run(ffmpeg, [
      '-y', '-i', path.resolve(inPath), '-vf', chain.join(','),
      '-map', '0:v', '-map', '0:a?', '-c:a', 'copy', path.resolve(outPath),
    ]);
    if (r.status !== 0) throw new Error(`ffmpeg correct failed (exit ${r.status}):\n${r.stderr.slice(-1500)}`);

    return {
      outputs: [path.resolve(outPath)],
      metrics: { temperature, brightness, contrast, saturation, gamma, filters: chain },
      project,
      args: process.argv.slice(2),
    };
  });
}

void main();
