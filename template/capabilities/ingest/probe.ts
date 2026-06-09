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
import * as fs from 'node:fs';
import * as path from 'node:path';
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
  tags?: { rotate?: string };
  side_data_list?: { rotation?: number }[];
}

function evalFps(r: string | undefined): number | null {
  if (!r) return null;
  const [n, d] = r.split('/').map(Number);
  return d ? n / d : n;
}

/**
 * Display rotation in degrees (0/90/180/270). Phone-shot VERTICAL video is very often stored as a
 * LANDSCAPE frame (e.g. 1920×1080) plus a rotation flag — a `tags.rotate` (older mov/mp4) and/or a
 * `side_data_list` 3×3 displaymatrix (modern). ffprobe reports the STORED frame; ignoring the flag
 * mislabels a vertical phone clip as landscape (live-found at GATE VQ — the whole reframe + the QA
 * context cascaded off a false "landscape"). Normalise to a 0/90/180/270 magnitude.
 */
export function displayRotation(v: Stream | undefined): number {
  if (!v) return 0;
  const fromTag = v.tags?.rotate != null ? parseInt(v.tags.rotate, 10) : NaN;
  const fromSide = v.side_data_list?.find((s) => typeof s.rotation === 'number')?.rotation;
  const raw = Number.isFinite(fromTag) ? fromTag : (fromSide ?? 0);
  return ((Math.round(raw / 90) * 90) % 360 + 360) % 360; // 0 | 90 | 180 | 270
}

export interface DisplayGeometry {
  rotation: number;
  width?: number;
  height?: number;
  orientation: 'portrait' | 'landscape' | 'square' | null;
  aspectRatio: number | null;
  storedWidth?: number;
  storedHeight?: number;
}

/** Resolve the DISPLAY geometry from a probed video stream — rotation applied, W/H swapped for 90/270
 *  so callers see what the viewer sees (a phone-vertical clip reads `portrait`, never `landscape`). */
export function displayGeometry(video: Stream | undefined): DisplayGeometry {
  const rotation = displayRotation(video);
  const swap = rotation === 90 || rotation === 270;
  const width = video ? (swap ? video.height : video.width) : undefined;
  const height = video ? (swap ? video.width : video.height) : undefined;
  const orientation = width && height ? (width < height ? 'portrait' : width > height ? 'landscape' : 'square') : null;
  const aspectRatio = width && height ? +(width / height).toFixed(4) : null;
  return { rotation, width, height, orientation, aspectRatio, storedWidth: video?.width, storedHeight: video?.height };
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

    // DISPLAY orientation: swap stored W/H for a 90°/270° rotation flag so downstream (the plan, the
    // reframe, the QA context) sees what the viewer sees — NOT the sideways stored frame.
    const { rotation, width: dispW, height: dispH, orientation, aspectRatio } = displayGeometry(video);

    const metrics = {
      asset,
      durationSec,
      format: data.format.format_name,
      sizeMB: +(parseInt(data.format.size) / 1024 / 1024).toFixed(2),
      hasAudio: !!audio,
      video: video && {
        codec: video.codec_name,
        // width/height are the DISPLAY dims (rotation already applied — this is what players + ffmpeg
        // autorotate show, and what the editor must plan against).
        width: dispW,
        height: dispH,
        fps: evalFps(video.r_frame_rate),
        pixFmt: video.pix_fmt,
        rotation,
        orientation,
        aspectRatio,
        storedWidth: video.width,
        storedHeight: video.height,
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
      `${asset}\n  ${durationSec.toFixed(3)}s · ${dispW ?? '?'}×${dispH ?? '?'} ${orientation ?? ''} @ ${evalFps(video?.r_frame_rate)?.toFixed(2) ?? '?'}fps` +
        (rotation ? `\n  ⟳ display rotation ${rotation}° (stored ${video?.width}×${video?.height}) — already ${orientation}, do NOT treat as landscape` : '') +
        `\n  durationInFrames@${fps} = ${metrics.durationInFrames}${audio ? '' : '\n  ⚠ NO AUDIO TRACK'}`,
    );

    return { outputs: [], metrics, project, args: process.argv.slice(2) };
  });
}

// Symlink-safe main-guard so tests can import the pure helpers (displayGeometry/displayRotation)
// without spawning the CLI body (macOS /var → /private/var realpath parity).
const realpathSafe = (p: string): string => { try { return fs.realpathSync(path.resolve(p)); } catch { return path.resolve(p); } };
if (process.argv[1] && realpathSafe(process.argv[1]) === realpathSafe(__filename)) void main();
