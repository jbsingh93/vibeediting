#!/usr/bin/env tsx
/**
 * capabilities/assemble/ffmpeg-ops.ts — typed FFmpeg op layer (plan P1D.1, GAP-29/30).
 *
 * Borrows mcp-video's PATTERN (typed ops, argv arrays, structured JSON) WITHOUT the dependency.
 * Every op builds an **argv array** (never a shell string — X.2 security), validates inputs, runs the
 * FULL ffmpeg, and returns { success, returncode, outputPath, durationS, stderr }.
 *
 * Footguns baked in (GAP-29):
 *   - `trim` resets PTS with setpts=PTS-STARTPTS / asetpts=PTS-STARTPTS (or stream-copy on keyframes).
 *   - `crossfade` (xfade/acrossfade) first NORMALIZES both inputs' fps + SAR + pixfmt + TIMEBASE (settb).
 *   - `concat` (demuxer) requires uniform codecs → we offer a re-encode concat that guarantees it.
 * Plus (GAP-30): drawtext, chromakey, applyHaldClut, and an optional CUDA hw-decode prefix.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveFfmpeg } from '../_env/ffmpeg';
import { requireInputFile, run } from '../_env/contract';

export interface OpResult {
  success: boolean;
  op: string;
  returncode: number;
  outputPath: string;
  durationS: number | null;
  stderr: string;
}

const { ffmpeg, ffprobe } = resolveFfmpeg();

function probeDuration(p: string): number | null {
  const r = run(ffprobe, ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'default=nokey=1:noprint_wrappers=1', p]);
  const d = parseFloat(r.stdout.trim());
  return Number.isFinite(d) ? d : null;
}

function ensureDir(outputPath: string): void {
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
}

/** Run an argv (no shell), return a structured result. `hwDecode` prepends CUDA decode (GAP-30). */
function exec(op: string, args: string[], outputPath: string, hwDecode = false): OpResult {
  ensureDir(outputPath);
  const full = hwDecode ? ['-hwaccel', 'cuda', ...args] : args;
  const r = run(ffmpeg, ['-y', ...full]);
  return {
    success: r.status === 0,
    op,
    returncode: r.status,
    outputPath: path.resolve(outputPath),
    durationS: r.status === 0 ? probeDuration(outputPath) : null,
    stderr: r.stderr.slice(-2000),
  };
}

// ── normalization helper for transitions (GAP-29) ───────────────────────────
function normFilters(fps: number): string {
  return `fps=${fps},format=yuv420p,setsar=1,settb=AVTB`;
}

// ── ops ──────────────────────────────────────────────────────────────────────
export function trim(input: string, start: number, end: number, output: string, reencode = true): OpResult {
  requireInputFile(input);
  const args = reencode
    ? ['-ss', String(start), '-to', String(end), '-i', input,
       '-vf', 'setpts=PTS-STARTPTS', '-af', 'asetpts=PTS-STARTPTS',
       '-c:v', 'libx264', '-crf', '18', '-c:a', 'aac', output]
    : ['-ss', String(start), '-to', String(end), '-i', input, '-c', 'copy', output];
  return exec('trim', args, output);
}

/** Concat with re-encode (guarantees uniform codecs — GAP-29 concat footgun). */
export function concat(inputs: string[], output: string): OpResult {
  inputs.forEach((i) => requireInputFile(i));
  const args: string[] = [];
  inputs.forEach((i) => args.push('-i', i));
  const n = inputs.length;
  const streams = inputs.map((_, k) => `[${k}:v:0][${k}:a:0]`).join('');
  args.push('-filter_complex', `${streams}concat=n=${n}:v=1:a=1[v][a]`, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-crf', '18', '-c:a', 'aac', output);
  return exec('concat', args, output);
}

/** xfade + acrossfade, normalizing fps/SAR/pixfmt/timebase first (GAP-29). `offset` = when the xfade starts. */
export function crossfade(a: string, b: string, offset: number, output: string, opts: { duration?: number; fps?: number; transition?: string } = {}): OpResult {
  requireInputFile(a);
  requireInputFile(b);
  const dur = opts.duration ?? 0.5;
  const fps = opts.fps ?? 30;
  const transition = opts.transition ?? 'fade';
  const fc =
    `[0:v]${normFilters(fps)}[v0];[1:v]${normFilters(fps)}[v1];` +
    `[v0][v1]xfade=transition=${transition}:duration=${dur}:offset=${offset}[v];` +
    `[0:a][1:a]acrossfade=d=${dur}[a]`;
  return exec('crossfade', ['-i', a, '-i', b, '-filter_complex', fc, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-crf', '18', '-c:a', 'aac', output], output);
}

export function overlay(base: string, over: string, output: string, opts: { x?: string | number; y?: string | number } = {}): OpResult {
  requireInputFile(base);
  requireInputFile(over);
  const x = opts.x ?? 0, y = opts.y ?? 0;
  return exec('overlay', ['-i', base, '-i', over, '-filter_complex', `[0:v][1:v]overlay=${x}:${y}[v]`,
    '-map', '[v]', '-map', '0:a?', '-c:a', 'copy', output], output);
}

export function mux(video: string, audio: string, output: string): OpResult {
  requireInputFile(video);
  requireInputFile(audio);
  return exec('mux', ['-i', video, '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-shortest', output], output);
}

export function replaceAudio(video: string, audio: string, output: string): OpResult {
  return mux(video, audio, output);
}

export function burnSubtitles(input: string, srt: string, output: string): OpResult {
  requireInputFile(input);
  requireInputFile(srt);
  // run with cwd at the srt dir → bare filename (avoids the Windows colon footgun in the subtitles filter)
  const srtName = path.basename(srt);
  ensureDir(output);
  const r = run(ffmpeg, ['-y', '-i', path.resolve(input), '-vf', `subtitles=${srtName}`,
    '-c:a', 'copy', path.resolve(output)], { cwd: path.dirname(path.resolve(srt)) });
  return { success: r.status === 0, op: 'burnSubtitles', returncode: r.status, outputPath: path.resolve(output), durationS: r.status === 0 ? probeDuration(output) : null, stderr: r.stderr.slice(-2000) };
}

export function applyLut(input: string, cube: string, output: string, intensity = 1): OpResult {
  requireInputFile(input);
  requireInputFile(cube);
  const cubeName = path.basename(cube);
  const lut3d = `lut3d=file=${cubeName}:interp=tetrahedral`;
  const vf = intensity >= 0.999 ? `${lut3d},format=yuv420p` : undefined;
  ensureDir(output);
  const args = vf
    ? ['-y', '-i', path.resolve(input), '-vf', vf, '-c:a', 'copy', path.resolve(output)]
    : ['-y', '-i', path.resolve(input), '-filter_complex',
       `[0:v]split=2[a][b];[b]${lut3d}[g];[a][g]blend=all_mode=normal:all_opacity=${intensity},format=yuv420p[v]`,
       '-map', '[v]', '-map', '0:a?', '-c:a', 'copy', path.resolve(output)];
  const r = run(ffmpeg, args, { cwd: path.dirname(path.resolve(cube)) });
  return { success: r.status === 0, op: 'applyLut', returncode: r.status, outputPath: path.resolve(output), durationS: r.status === 0 ? probeDuration(output) : null, stderr: r.stderr.slice(-2000) };
}

export function applyHaldClut(input: string, hald: string, output: string): OpResult {
  requireInputFile(input);
  requireInputFile(hald);
  return exec('applyHaldClut', ['-i', input, '-i', hald, '-filter_complex', '[0][1]haldclut,format=yuv420p[v]', '-map', '[v]', '-map', '0:a?', '-c:a', 'copy', output], output);
}

/** Single-pass loudnorm op (the 2-pass true-peak finalize lives in audio/loudness.py). */
export function normalizeLoudness(input: string, output: string, opts: { i?: number; tp?: number; lra?: number } = {}): OpResult {
  requireInputFile(input);
  const i = opts.i ?? -14, tp = opts.tp ?? -1, lra = opts.lra ?? 11;
  return exec('normalizeLoudness', ['-i', input, '-af', `loudnorm=I=${i}:TP=${tp}:LRA=${lra}`, output], output);
}

export function extractFrames(input: string, outDir: string, opts: { fps?: number; pattern?: string } = {}): OpResult {
  requireInputFile(input);
  fs.mkdirSync(outDir, { recursive: true });
  const fps = opts.fps ?? 1;
  const pattern = path.join(outDir, opts.pattern ?? 'frame-%04d.png');
  return exec('extractFrames', ['-i', input, '-vf', `fps=${fps}`, pattern], pattern);
}

export function thumbnailGrid(input: string, output: string, opts: { cols?: number; rows?: number; scale?: number } = {}): OpResult {
  requireInputFile(input);
  const cols = opts.cols ?? 4, rows = opts.rows ?? 3, scale = opts.scale ?? 320;
  return exec('thumbnailGrid', ['-i', input, '-vf', `fps=1,scale=${scale}:-1,tile=${cols}x${rows}`, '-frames:v', '1', output], output);
}

export function drawtext(input: string, output: string, opts: { text: string; x?: string; y?: string; fontsize?: number; fontcolor?: string; box?: boolean }): OpResult {
  requireInputFile(input);
  const { text } = opts;
  const x = opts.x ?? '(w-text_w)/2', y = opts.y ?? '(h-text_h)/2';
  const fontsize = opts.fontsize ?? 48, fontcolor = opts.fontcolor ?? 'white';
  const esc = text.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
  const box = opts.box ? ':box=1:boxcolor=black@0.5:boxborderw=10' : '';
  return exec('drawtext', ['-i', input, '-vf', `drawtext=text='${esc}':x=${x}:y=${y}:fontsize=${fontsize}:fontcolor=${fontcolor}${box}`, '-c:a', 'copy', output], output);
}

export function chromakey(input: string, output: string, opts: { color?: string; similarity?: number; blend?: number } = {}): OpResult {
  requireInputFile(input);
  const color = opts.color ?? '0x00FF00', similarity = opts.similarity ?? 0.3, blend = opts.blend ?? 0.1;
  return exec('chromakey', ['-i', input, '-vf', `chromakey=${color}:${similarity}:${blend}`, output], output);
}

export const OPS = {
  trim, concat, crossfade, overlay, mux, replaceAudio, burnSubtitles, applyLut, applyHaldClut,
  normalizeLoudness, extractFrames, thumbnailGrid, drawtext, chromakey,
};
