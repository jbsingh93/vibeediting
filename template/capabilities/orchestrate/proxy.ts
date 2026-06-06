#!/usr/bin/env tsx
/**
 * capabilities/orchestrate/proxy.ts — proxy-first two-pass standard (plan P2.5).
 *
 * The research's proxy discipline: validate the TIMELINE on a fast low-res draft, then render full-res
 * only after approval. Generalizes the proven window-proxy idea into a project-wide convention.
 *
 * GAP-24 (critical): a proxy used to validate xfade/timeline timing MUST keep the SOURCE fps — drop
 * ONLY the resolution. Changing fps would shift every transition boundary and invalidate the check. So
 * the default is `scale=-2:480` at the source frame rate; pass --fps only when you explicitly want a
 * cheaper preview that is NOT being used to validate transition timing.
 *
 * (Distinct from deliver/make-proxy.ts, which makes a 720p proxy for Whisper/Gemini ANALYSIS.)
 *
 * CLI:
 *   tsx proxy.ts --in VIDEO [--height 480] [--fps N] [--out PATH] [--project NAME]
 */
import * as path from 'node:path';
import { requireInputFile, run, runCapability, workDir } from '../_env/contract';
import { resolveFfmpeg } from '../_env/ffmpeg';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface ProbeResult {
  fps: number | null;
  width: number | null;
  height: number | null;
}

function probeVideo(ffprobe: string, video: string): ProbeResult {
  const r = run(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'json', video]);
  const v = (JSON.parse(r.stdout || '{}').streams ?? [])[0] ?? {};
  const [num, den] = (v.r_frame_rate ?? '0/1').split('/').map(Number);
  return { fps: den ? num / den : num || null, width: v.width ?? null, height: v.height ?? null };
}

/** Make a low-res proxy. Keeps source fps unless `fps` is given (GAP-24). Returns the output path. */
export function makeProxy(
  video: string,
  out: string,
  opts: { height?: number; fps?: number } = {},
): { success: boolean; output: string; stderr: string } {
  const { ffmpeg } = resolveFfmpeg();
  const height = opts.height ?? 480;
  const vf = `scale=-2:${height}`;
  const args = ['-y', '-i', video, '-vf', vf];
  if (opts.fps) args.push('-r', String(opts.fps)); // ONLY when explicitly requested (GAP-24)
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', out);
  const r = run(ffmpeg, args);
  return { success: r.status === 0, output: out, stderr: r.stderr.slice(-800) };
}

async function main(): Promise<void> {
  await runCapability('orchestrate/proxy', async () => {
    const video = requireInputFile(arg('in'), 'video');
    const project = arg('project') ?? '_scratch';
    const height = parseInt(arg('height') ?? '480', 10);
    const fps = arg('fps') ? parseFloat(arg('fps') as string) : undefined;
    const { ffprobe } = resolveFfmpeg();

    const src = probeVideo(ffprobe, video);
    const out = arg('out') ?? path.join(workDir(project, 'proxy'), path.basename(video).replace(/\.[^.]+$/, '') + `.proxy-${height}p.mp4`);

    const r = makeProxy(video, out, { height, fps });
    if (!r.success) throw new Error(`proxy render failed:\n${r.stderr}`);

    const proxied = probeVideo(ffprobe, out);
    const fpsKept = fps === undefined && src.fps !== null && proxied.fps !== null && Math.abs(src.fps - proxied.fps) < 0.5;

    console.error(`proxy: ${src.width}×${src.height}@${src.fps?.toFixed(2)} → ${proxied.width}×${proxied.height}@${proxied.fps?.toFixed(2)} (${fpsKept ? 'fps kept ✓' : 'fps changed'})`);
    return {
      outputs: [path.resolve(out)],
      metrics: { source: src, proxy: proxied, fpsKept, heightTarget: height },
      project,
      args: process.argv.slice(2),
    };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) void main();
