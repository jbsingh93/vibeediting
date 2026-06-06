#!/usr/bin/env tsx
/**
 * capabilities/color/grade.ts — apply a look LUT (plan P1B.2). The PRIMARY, fast color path.
 *
 * Wraps the full-build ffmpeg `lut3d=...:interp=tetrahedral`.
 *
 * GAP-21 (Windows lut3d colon footgun): a path like `C:\luts\x.cube` breaks ffmpeg's `:`-separated
 * filter args. We sidestep it ENTIRELY by running ffmpeg with cwd = the LUT's directory and passing
 * only the bare filename (no drive letter, no colon) — never the fragile `C\:/...` escape.
 *
 * --intensity blends graded vs. original (0 = none, 1 = full look) for per-shot dialing.
 *
 * CLI:
 *   tsx capabilities/color/grade.ts --in IN.mp4 --out OUT.mp4 --lut warm-cine [--intensity 1.0] [--project NAME]
 *   (--lut may be a house-LUT name in color/luts/, or a path to any .cube)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { requireInputFile, run, runCapability } from '../_env/contract';

const LUT_DIR = path.join(__dirname, 'luts');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Resolve a --lut value (house name like "warm-cine", or any .cube path) → absolute .cube path. */
function resolveLut(spec: string): string {
  const candidates = [
    spec,
    path.join(LUT_DIR, spec),
    path.join(LUT_DIR, spec.endsWith('.cube') ? spec : `${spec}.cube`),
  ];
  for (const c of candidates) if (fs.existsSync(c) && fs.statSync(c).isFile()) return path.resolve(c);
  throw new Error(`LUT not found: "${spec}" (looked in color/luts/ and as a direct path)`);
}

async function main(): Promise<void> {
  await runCapability('color/grade', async () => {
    const { resolveFfmpeg } = await import('../_env/ffmpeg');
    const { ffmpeg } = resolveFfmpeg();

    const inPath = requireInputFile(arg('in'), 'input video');
    const outPath = arg('out');
    if (!outPath) throw new Error('missing --out');
    const lutPath = resolveLut(arg('lut') ?? 'neutral-correct');
    const intensity = Math.max(0, Math.min(1, parseFloat(arg('intensity') ?? '1')));
    const project = arg('project') ?? '_scratch';

    // run with cwd at the LUT dir → reference it by bare filename (GAP-21 colon-free)
    const lutCwd = path.dirname(lutPath);
    const lutName = path.basename(lutPath);
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });

    const lut3d = `lut3d=file=${lutName}:interp=tetrahedral`;
    const args =
      intensity >= 0.999
        ? ['-y', '-i', path.resolve(inPath), '-vf', `${lut3d},format=yuv420p`,
           '-map', '0:v', '-map', '0:a?', '-c:a', 'copy', path.resolve(outPath)]
        : ['-y', '-i', path.resolve(inPath),
           '-filter_complex',
           `[0:v]split=2[a][b];[b]${lut3d}[g];[a][g]blend=all_mode=normal:all_opacity=${intensity},format=yuv420p[out]`,
           '-map', '[out]', '-map', '0:a?', '-c:a', 'copy', path.resolve(outPath)];

    const r = run(ffmpeg, args, { cwd: lutCwd });
    if (r.status !== 0) throw new Error(`ffmpeg lut3d failed (exit ${r.status}):\n${r.stderr.slice(-1500)}`);

    return {
      outputs: [path.resolve(outPath)],
      metrics: { lut: lutName, intensity, interp: 'tetrahedral' },
      project,
      args: process.argv.slice(2),
    };
  });
}

void main();
