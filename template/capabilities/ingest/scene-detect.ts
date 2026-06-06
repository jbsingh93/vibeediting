#!/usr/bin/env tsx
/**
 * capabilities/ingest/scene-detect.ts — shot-boundary detection (plan P1C.3).
 *
 * Now possible with the FULL ffmpeg build: `select='gt(scene,T)',showinfo` emits a cut timestamp
 * for each frame whose scene-change score exceeds the threshold. Feeds cut-doctor (perception/).
 *
 * CLI:
 *   tsx scene-detect.ts --in VIDEO [--threshold 0.3] [--fps 60] [--project NAME]
 * Returns metrics.cuts = [{ timeSec, frame }], using --fps to map seconds→frame.
 */
import { requireInputFile, run, runCapability } from '../_env/contract';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  await runCapability('ingest/scene-detect', async () => {
    const { resolveFfmpeg } = await import('../_env/ffmpeg');
    const { ffmpeg } = resolveFfmpeg();

    const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    const video = requireInputFile(arg('in') ?? positional[0], 'video');
    const threshold = parseFloat(arg('threshold') ?? '0.3');
    const fps = parseFloat(arg('fps') ?? '60');
    const project = arg('project') ?? '_scratch';

    const r = run(ffmpeg, ['-hide_banner', '-i', video, '-vf', `select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-']);
    // showinfo prints to stderr
    const text = r.stderr + r.stdout;
    const cuts = [...text.matchAll(/pts_time:([0-9.]+)/g)].map((m) => {
      const timeSec = parseFloat(m[1]);
      return { timeSec: +timeSec.toFixed(3), frame: Math.round(timeSec * fps) };
    });

    console.error(`scene-detect: ${cuts.length} cut(s) at threshold ${threshold}`);
    return { outputs: [], metrics: { threshold, fps, cutCount: cuts.length, cuts }, project, args: process.argv.slice(2) };
  });
}

void main();
