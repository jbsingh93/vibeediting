#!/usr/bin/env tsx
/**
 * capabilities/deliver/make-proxy.ts — 720p proxy for API analysis (plan P1E.3). Ports make-proxy.sh.
 *
 * Whisper/Gemini only need to SEE the video, not render from it → analyze a cheap 720p proxy, swap to the
 * original at final render. Uses the full-build resolver.
 *
 * CLI: tsx make-proxy.ts --in IN.mp4 --out OUT-720p.mp4 [--height 720] [--crf 28] [--project NAME]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { requireInputFile, run, runCapability } from '../_env/contract';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  await runCapability('deliver/make-proxy', async () => {
    const { resolveFfmpeg } = await import('../_env/ffmpeg');
    const { ffmpeg } = resolveFfmpeg();
    const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    const input = requireInputFile(arg('in') ?? positional[0], 'input');
    const out = arg('out') ?? positional[1];
    if (!out) throw new Error('missing --out');
    const height = arg('height') ?? '720', crf = arg('crf') ?? '28';
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });

    const r = run(ffmpeg, ['-y', '-i', input, '-vf', `scale=-2:${height}`, '-c:v', 'libx264', '-crf', crf,
      '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]);
    if (r.status !== 0) throw new Error(`proxy failed (exit ${r.status}):\n${r.stderr.slice(-1200)}`);

    return {
      outputs: [path.resolve(out)],
      metrics: { height: +height, crf: +crf, srcMB: +(fs.statSync(input).size / 1048576).toFixed(1), proxyMB: +(fs.statSync(out).size / 1048576).toFixed(1) },
      project: arg('project') ?? '_scratch',
      args: process.argv.slice(2),
    };
  });
}

void main();
