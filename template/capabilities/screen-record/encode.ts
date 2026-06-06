#!/usr/bin/env tsx
/**
 * capabilities/screen-record/encode.ts — the clean constant-30-fps STITCH (plan P1G.4, GAP-63).
 *
 * This is the literal "stitch it together for a 30 fps screen recording" core. Every recipe runs on the
 * FULL `C:\ffmpeg` (GAP-23 verified: libx264 / h264_nvenc / minterpolate / fps / mjpeg all present).
 * Browser frame delivery is bursty + variable-rate; `fps=30 + -vsync cfr` forces a CONSTANT-rate output.
 *
 * The argv builders are PURE (return a string[]) so the regression suite asserts the exact recipe with
 * NO browser and NO ffmpeg run; `spawnLivePipeEncoder()` / `runEncode()` execute them.
 *
 * Recipes (GAP-63):
 *   - 'image2pipe' — PRIMARY live pipe: page.screencast JPEG buffers → ffmpeg stdin (no disk frames)
 *   - 'concat'     — timestamp-driven assembly from a CDP `metadata.timestamp` frame manifest
 *   - 'webm'       — VFR-WebM (a fallback capture) → CFR-30 H.264 transcode
 * Modifiers: `minterpolate` (smooth fast motion), `downscale` (HiDPI 3840→1920 lanczos), `encoder:'h264_nvenc'`.
 */
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { resolveFfmpeg } from '../_env/ffmpeg';

export type EncodeSource = 'image2pipe' | 'concat' | 'webm';
export type Encoder = 'libx264' | 'h264_nvenc';

export interface EncodeOptions {
  source: EncodeSource;
  /** concat manifest path (source='concat') or input video (source='webm'); ignored for image2pipe (stdin). */
  input?: string;
  output: string;
  fps?: number; // default 30 — the constant output rate
  crf?: number; // libx264 quality, default 18
  qp?: number; // h264_nvenc constqp, default 18
  preset?: string; // default 'fast' (libx264) / 'p4' (nvenc)
  encoder?: Encoder; // default 'libx264'
  jpegQuality?: number; // input mjpeg quality hint (image2pipe); informational
  minterpolate?: boolean; // opt-in motion-compensated interpolation (slow — GAP-63 caveat)
  downscale?: { width: number; height: number }; // lanczos HiDPI downsample
  faststart?: boolean; // default true — web-optimize the moov atom
}

const DEFAULTS = { fps: 30, crf: 18, qp: 18 } as const;

/**
 * Build the `-vf` filter chain (pure). minterpolate REPLACES the plain fps step (GAP-63).
 * `rangeConvert` remaps full-range (pc) JPEG levels to broadcast limited-range (tv) so the output is true
 * `yuv420p` (NOT `yuvj420p`): page.screencast / MJPEG frames are full-range, and a bare `format=yuv420p`
 * only relabels — without the range conversion the UI looks washed-out and the verifier's pixfmt meter trips.
 */
export function buildVideoFilter(opts: Pick<EncodeOptions, 'fps' | 'minterpolate' | 'downscale'> & { rangeConvert?: boolean }): string {
  const fps = opts.fps ?? DEFAULTS.fps;
  const chain: string[] = [];
  chain.push(
    opts.minterpolate
      ? `minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`
      : `fps=${fps}`,
  );
  const range = opts.rangeConvert ? ':in_range=pc:out_range=tv' : '';
  if (opts.downscale) chain.push(`scale=${opts.downscale.width}:${opts.downscale.height}:flags=lanczos${range}`);
  else if (opts.rangeConvert) chain.push('scale=in_range=pc:out_range=tv');
  chain.push('format=yuv420p');
  return chain.join(',');
}

/** Build the codec argv tail (pure). */
function buildCodecArgs(opts: EncodeOptions): string[] {
  const encoder = opts.encoder ?? 'libx264';
  if (encoder === 'h264_nvenc') {
    return ['-c:v', 'h264_nvenc', '-rc', 'constqp', '-qp', String(opts.qp ?? DEFAULTS.qp), '-preset', opts.preset ?? 'p4'];
  }
  return ['-c:v', 'libx264', '-crf', String(opts.crf ?? DEFAULTS.crf), '-preset', opts.preset ?? 'fast'];
}

/** Build the source/input argv (pure). image2pipe reads JPEG frames from stdin (pipe:0). */
function buildInputArgs(opts: EncodeOptions): string[] {
  switch (opts.source) {
    case 'image2pipe':
      // `-use_wallclock_as_timestamps 1` stamps each piped JPEG with its real ARRIVAL time, so the downstream
      // `fps=30` DUPLICATES frames to fill gaps → a real-duration constant-30 clip. (The plan's `-framerate 30`
      // would instead treat N sparse frames as N×(1/30)s and collapse a 6 s capture into ~1 s — wrong for the
      // bursty/VFR cadence page.screencast actually emits. GAP-62/63.)
      return ['-f', 'image2pipe', '-vcodec', 'mjpeg', '-use_wallclock_as_timestamps', '1', '-i', 'pipe:0'];
    case 'concat':
      if (!opts.input) throw new Error("encode source 'concat' needs --input (the frame manifest)");
      return ['-f', 'concat', '-safe', '0', '-i', opts.input];
    case 'webm':
      if (!opts.input) throw new Error("encode source 'webm' needs --input (the raw .webm)");
      return ['-i', opts.input];
  }
}

/** Full ffmpeg argv (after the binary), starting with `-y`. PURE — the unit tests assert this verbatim. */
export function buildEncodeArgs(opts: EncodeOptions): string[] {
  // JPEG-frame sources (image2pipe, concat) are full-range → convert to tv; webm is already limited-range.
  const vf = buildVideoFilter({ ...opts, rangeConvert: opts.source !== 'webm' });
  const args = ['-y', ...buildInputArgs(opts), '-vf', vf, '-vsync', 'cfr', ...buildCodecArgs(opts)];
  if (opts.faststart ?? true) args.push('-movflags', '+faststart');
  args.push(opts.output);
  return args;
}

/**
 * A concat manifest reconstructs the REAL (bursty) frame timing from CDP `metadata.timestamp` deltas, so
 * `-f concat … -vf fps=30` resamples faithfully (GAP-63). Each line: `file '<abs>'` + `duration <Δsec>`.
 * The last frame is repeated (ffmpeg concat-demuxer quirk: the final `duration` is otherwise ignored).
 */
export function buildConcatManifest(frames: { file: string; durationSec: number }[]): string {
  if (frames.length === 0) throw new Error('buildConcatManifest: no frames');
  const lines: string[] = [];
  for (const f of frames) {
    lines.push(`file '${f.file.replace(/'/g, "'\\''")}'`);
    lines.push(`duration ${Math.max(0.0001, f.durationSec).toFixed(6)}`);
  }
  // repeat the final file so its duration is honored
  lines.push(`file '${frames[frames.length - 1].file.replace(/'/g, "'\\''")}'`);
  return lines.join('\n') + '\n';
}

function ensureOutDir(output: string): void {
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
}

export interface EncodeResult {
  success: boolean;
  outputPath: string;
  returncode: number;
  stderr: string;
}

/**
 * Spawn ffmpeg for the PRIMARY live-pipe path and return the process. The caller writes JPEG buffers from
 * `page.screencast`'s `onFrame` to `proc.stdin`, then `proc.stdin.end()` to finalize. Resolve `whenDone()`
 * to await the encode.
 */
export function spawnLivePipeEncoder(
  opts: Omit<EncodeOptions, 'source' | 'input'>,
): { proc: ChildProcessByStdio<Writable, null, Readable>; whenDone: () => Promise<EncodeResult> } {
  ensureOutDir(opts.output);
  const { ffmpeg } = resolveFfmpeg();
  const args = buildEncodeArgs({ ...opts, source: 'image2pipe' });
  const proc = spawn(ffmpeg, args, { stdio: ['pipe', 'inherit', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d: Buffer) => {
    stderr += d.toString();
    if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
  });
  const whenDone = () =>
    new Promise<EncodeResult>((resolve) => {
      proc.on('close', (code) =>
        resolve({ success: code === 0, outputPath: path.resolve(opts.output), returncode: code ?? -1, stderr: stderr.slice(-4000) }),
      );
    });
  return { proc, whenDone };
}

/** Run a non-pipe recipe (concat / webm) synchronously to completion. */
export async function runEncode(opts: EncodeOptions): Promise<EncodeResult> {
  ensureOutDir(opts.output);
  const { ffmpeg } = resolveFfmpeg();
  const args = buildEncodeArgs(opts);
  return new Promise<EncodeResult>((resolve) => {
    const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'inherit', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    proc.on('close', (code) =>
      resolve({ success: code === 0, outputPath: path.resolve(opts.output), returncode: code ?? -1, stderr: stderr.slice(-4000) }),
    );
  });
}
