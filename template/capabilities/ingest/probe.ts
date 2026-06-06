#!/usr/bin/env tsx
/**
 * capabilities/ingest/probe.ts — ffprobe metadata (plan P1C.3). Promotes scripts/probe-asset.ts.
 *
 * Use BEFORE importing any asset to set Remotion `durationInFrames` from the REAL duration.
 * Uses the unified full-build ffprobe resolver (never a stripped binary).
 *
 * CLI:
 *   tsx probe.ts --in ASSET [--fps 60] [--project NAME]
 *   tsx probe.ts ASSET                      (positional, back-compat)
 */
import { requireInputFile, run, runCapability } from '../_env/contract';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface Stream {
  codec_type: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  pix_fmt?: string;
  sample_rate?: string;
  channels?: number;
  bit_rate?: string;
}

function evalFps(r: string | undefined): number | null {
  if (!r) return null;
  const [n, d] = r.split('/').map(Number);
  return d ? n / d : n;
}

async function main(): Promise<void> {
  await runCapability('ingest/probe', async () => {
    const { resolveFfmpeg } = await import('../_env/ffmpeg');
    const { ffprobe } = resolveFfmpeg();

    const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    const asset = requireInputFile(arg('in') ?? positional[0], 'asset');
    const fps = parseFloat(arg('fps') ?? '60');
    const project = arg('project') ?? '_scratch';

    const r = run(ffprobe, ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', asset]);
    if (r.status !== 0) throw new Error(`ffprobe failed (exit ${r.status}):\n${r.stderr.slice(-800)}`);
    const data = JSON.parse(r.stdout) as { streams: Stream[]; format: { duration: string; format_name: string; size: string } };
    const video = data.streams.find((s) => s.codec_type === 'video');
    const audio = data.streams.find((s) => s.codec_type === 'audio');
    const durationSec = parseFloat(data.format.duration);

    const metrics = {
      asset,
      durationSec,
      format: data.format.format_name,
      sizeMB: +(parseInt(data.format.size) / 1024 / 1024).toFixed(2),
      hasAudio: !!audio,
      video: video && {
        codec: video.codec_name,
        width: video.width,
        height: video.height,
        fps: evalFps(video.r_frame_rate),
        pixFmt: video.pix_fmt,
      },
      audio: audio && {
        codec: audio.codec_name,
        sampleRate: audio.sample_rate ? parseInt(audio.sample_rate) : null,
        channels: audio.channels,
      },
      durationInFrames: Math.round(durationSec * fps),
      fpsAssumed: fps,
    };
    // human-readable (stderr-free; the JSON envelope is the last stdout line)
    console.error(
      `${asset}\n  ${durationSec.toFixed(3)}s · ${video?.width ?? '?'}×${video?.height ?? '?'} @ ${evalFps(video?.r_frame_rate)?.toFixed(2) ?? '?'}fps` +
        `\n  durationInFrames@${fps} = ${metrics.durationInFrames}${audio ? '' : '\n  ⚠ NO AUDIO TRACK'}`,
    );

    return { outputs: [], metrics, project, args: process.argv.slice(2) };
  });
}

void main();
