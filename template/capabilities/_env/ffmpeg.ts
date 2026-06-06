#!/usr/bin/env tsx
/**
 * capabilities/_env/ffmpeg.ts — the SINGLE ffmpeg/ffprobe resolver for all capabilities.
 *
 * Capabilities need a FULL ffmpeg build (lut3d / two-pass loudnorm / afade / scene-detect),
 * never Remotion's stripped bundled binary. `vibe init` (or `vibe setup --ffmpeg`)
 * provisions a per-OS full static build into `.vibe/bin/` and runs this probe.
 *
 * Resolution order (ffmpeg):  VIBE_FFMPEG (file or dir) → <project>/.vibe/bin/ffmpeg(.exe)
 *                             → system PATH → bare "ffmpeg" (unverified last resort)
 * Resolution order (ffprobe): VIBE_FFPROBE → (dir of resolved ffmpeg) → .vibe/bin → PATH
 *
 * If nothing real is found, run `vibe setup --ffmpeg` (auto-download) or install ffmpeg
 * yourself and put it on PATH / point VIBE_FFMPEG at it. `vibe doctor` explains the state.
 *
 * CLI:
 *   tsx capabilities/_env/ffmpeg.ts            → resolve, (re)write ffmpeg-capabilities.json, print a table
 *   tsx capabilities/_env/ffmpeg.ts --selftest → run the acceptance ops (loudnorm 2-pass, lut3d, scene-detect)
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ENV_DIR = __dirname;
const PROJECT_ROOT = path.resolve(ENV_DIR, '..', '..');
const EXE = process.platform === 'win32' ? '.exe' : '';

export interface FfmpegResolution {
  ffmpeg: string;
  ffprobe: string;
  source: string;
}

function existsFile(p: string | undefined): p is string {
  try {
    return !!p && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** VIBE_FFMPEG may be a directory or a direct file path. Returns the exe path or undefined. */
function fromOverride(envVal: string | undefined, exe: string): string | undefined {
  if (!envVal) return undefined;
  if (existsFile(envVal)) return envVal;
  const asDir = path.join(envVal, exe);
  if (existsFile(asDir)) return asDir;
  return undefined;
}

/** The provisioned per-project binary dir (doc: D21). Checked from the project root
 *  this file lives in AND from cwd (scripts always run with cwd = project root). */
function vibeBinCandidates(exe: string): string[] {
  const c = [path.join(PROJECT_ROOT, '.vibe', 'bin', exe)];
  const fromCwd = path.join(process.cwd(), '.vibe', 'bin', exe);
  if (!c.includes(fromCwd)) c.push(fromCwd);
  return c;
}

/** Find a real file on PATH (so the resolver returns a verifiable path, not a bare name). */
function fromPath(exe: string): string | undefined {
  const pathEnv = process.env.PATH ?? process.env.Path ?? '';
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, exe);
    if (existsFile(candidate)) return candidate;
  }
  return undefined;
}

export function resolveFfmpeg(): FfmpegResolution {
  // ffmpeg
  let ffmpeg: string | undefined;
  let source: string;
  const vibeBin = vibeBinCandidates(`ffmpeg${EXE}`).find(existsFile);
  if ((ffmpeg = fromOverride(process.env.VIBE_FFMPEG, `ffmpeg${EXE}`))) source = 'env:VIBE_FFMPEG';
  else if (vibeBin) {
    ffmpeg = vibeBin;
    source = 'provisioned:.vibe/bin';
  } else if ((ffmpeg = fromPath(`ffmpeg${EXE}`))) {
    source = 'PATH';
  } else {
    ffmpeg = 'ffmpeg';
    source = 'PATH (unverified — run `vibe setup --ffmpeg` if missing)';
  }

  // ffprobe (track alongside ffmpeg's directory when possible)
  let ffprobe: string | undefined;
  if ((ffprobe = fromOverride(process.env.VIBE_FFPROBE, `ffprobe${EXE}`))) {
    /* explicit */
  } else if (ffmpeg !== 'ffmpeg' && existsFile(path.join(path.dirname(ffmpeg), `ffprobe${EXE}`))) {
    ffprobe = path.join(path.dirname(ffmpeg), `ffprobe${EXE}`);
  } else {
    const probeBin = vibeBinCandidates(`ffprobe${EXE}`).find(existsFile);
    ffprobe = probeBin ?? fromPath(`ffprobe${EXE}`) ?? 'ffprobe';
  }

  return { ffmpeg, ffprobe, source };
}

/** Filters every capability layer relies on (loudnorm/lut3d/xfade/scene-detect/…). */
export const REQUIRED_FILTERS = [
  'loudnorm', 'alimiter', 'afade', 'highpass', 'lowpass', 'lut3d', 'haldclut',
  'xfade', 'crop', 'scale', 'scdet', 'select', 'chromakey', 'zscale', 'tonemap',
  'drawtext', 'sidechaincompress', 'colorbalance', 'colortemperature', 'eq',
];
/** Encoders that must exist on every platform (CPU paths). */
export const REQUIRED_ENCODERS = ['prores_ks', 'libvpx-vp9', 'libx264', 'aac'];
/** Hardware encoders — probed and recorded, but OPTIONAL (render presets fall back:
 *  h264_nvenc → h264_videotoolbox (darwin) → libx264). */
export const OPTIONAL_ENCODERS = ['h264_nvenc', 'hevc_nvenc', 'h264_videotoolbox', 'hevc_videotoolbox'];

export interface FfmpegCapabilities extends FfmpegResolution {
  _generated: string;
  version: string;
  filters: Record<string, boolean>;
  encoders: Record<string, boolean>;
  missing: string[];
}

function listFeature(ffmpeg: string, flag: '-filters' | '-encoders'): string {
  const r = spawnSync(ffmpeg, ['-hide_banner', flag], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return r.stdout ?? '';
}

export function probeCapabilities(): FfmpegCapabilities {
  const res = resolveFfmpeg();
  const verOut = spawnSync(res.ffmpeg, ['-hide_banner', '-version'], { encoding: 'utf8' }).stdout ?? '';
  const version = verOut.split('\n')[0]?.trim() ?? 'unknown';

  const filterText = listFeature(res.ffmpeg, '-filters');
  const encoderText = listFeature(res.ffmpeg, '-encoders');
  const has = (text: string, name: string) =>
    new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);

  const filters: Record<string, boolean> = {};
  const encoders: Record<string, boolean> = {};
  const missing: string[] = [];
  for (const f of REQUIRED_FILTERS) {
    filters[f] = has(filterText, f);
    if (!filters[f]) missing.push(`filter:${f}`);
  }
  for (const e of REQUIRED_ENCODERS) {
    encoders[e] = has(encoderText, e);
    if (!encoders[e]) missing.push(`encoder:${e}`);
  }
  for (const e of OPTIONAL_ENCODERS) {
    encoders[e] = has(encoderText, e); // recorded for preset selection; never "missing"
  }

  return { ...res, _generated: new Date().toISOString(), version, filters, encoders, missing };
}

const CAPS_PATH = path.join(ENV_DIR, 'ffmpeg-capabilities.json');

export function writeCapabilities(): FfmpegCapabilities {
  const caps = probeCapabilities();
  fs.writeFileSync(CAPS_PATH, JSON.stringify(caps, null, 2) + '\n', 'utf8');
  return caps;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function printTable(caps: FfmpegCapabilities): void {
  console.log(`ffmpeg:  ${caps.ffmpeg}`);
  console.log(`ffprobe: ${caps.ffprobe}`);
  console.log(`source:  ${caps.source}`);
  console.log(`version: ${caps.version}`);
  console.log('\nfilters:');
  for (const [k, v] of Object.entries(caps.filters)) console.log(`  ${v ? '✓' : '✗'} ${k}`);
  console.log('encoders:');
  for (const [k, v] of Object.entries(caps.encoders)) {
    const opt = OPTIONAL_ENCODERS.includes(k) ? ' (optional)' : '';
    console.log(`  ${v ? '✓' : '✗'} ${k}${opt}`);
  }
  console.log(caps.missing.length ? `\n✗ MISSING: ${caps.missing.join(', ')}` : '\n✓ all required filters/encoders present');
  console.log(`\nwrote ${CAPS_PATH}`);
}

/** Acceptance self-test: loudnorm two-pass on a real wav, lut3d on a 1s clip, scene-detect timestamps. */
export interface SelfTestResult {
  measuredLufs: number;
  measuredTp: number;
  sceneCuts: number[];
  artifactsDir: string;
}
export function runSelfTest(): SelfTestResult {
  const { ffmpeg } = resolveFfmpeg();
  const dir = path.join(PROJECT_ROOT, 'out', 'work', '_selftest');
  fs.mkdirSync(dir, { recursive: true });
  const run = (label: string, args: string[]): string => {
    const r = spawnSync(ffmpeg, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, cwd: dir });
    if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status}):\n${r.stderr ?? ''}`);
    return (r.stderr ?? '') + (r.stdout ?? '');
  };

  // inputs
  run('make wav', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', 'tone.wav']);
  run('make clipA', ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=30', 'a.mp4']);
  run('make clipB', ['-y', '-f', 'lavfi', '-i', 'mandelbrot=size=320x240:rate=30', '-t', '1', 'b.mp4']);
  // concat A+B so there is a real scene change to detect
  fs.writeFileSync(path.join(dir, 'list.txt'), "file 'a.mp4'\nfile 'b.mp4'\n", 'utf8');
  run('concat', ['-y', '-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'ab.mp4']);

  // identity .cube (relative path → no Windows colon footgun)
  fs.writeFileSync(
    path.join(dir, 'identity.cube'),
    'LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n',
    'utf8',
  );

  // 1) loudnorm two-pass: pass 1 measures (print_format=json), pass 2 applies measured values
  const meas = run('loudnorm pass1', ['-i', 'tone.wav', '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-']);
  const jsonMatch = meas.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('loudnorm pass1 produced no JSON measurement');
  const m = JSON.parse(jsonMatch[0]);
  run('loudnorm pass2', [
    '-y', '-i', 'tone.wav',
    '-af', `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`,
    'tone-loudnorm.wav',
  ]);

  // 2) lut3d on a 1s clip (relative cube path)
  run('lut3d', ['-y', '-i', 'a.mp4', '-vf', 'lut3d=file=identity.cube:interp=tetrahedral,format=yuv420p', 'a-graded.mp4']);

  // 3) scene-detect → cut timestamps
  const sc = run('scene-detect', ['-i', 'ab.mp4', '-vf', "select='gt(scene,0.3)',showinfo", '-f', 'null', '-']);
  const cuts = [...sc.matchAll(/pts_time:([0-9.]+)/g)].map((x) => parseFloat(x[1]));

  return {
    measuredLufs: parseFloat(m.input_i),
    measuredTp: parseFloat(m.input_tp),
    sceneCuts: cuts,
    artifactsDir: dir,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  if (process.argv.includes('--selftest')) {
    const r = runSelfTest();
    console.log('ffmpeg self-test:');
    console.log(`  ✓ loudnorm two-pass: measured I=${r.measuredLufs} LUFS, TP=${r.measuredTp}`);
    console.log(`  ✓ lut3d applied identity.cube`);
    console.log(`  ✓ scene-detect emitted ${r.sceneCuts.length} cut(s): [${r.sceneCuts.map((c) => c.toFixed(2)).join(', ')}]`);
    console.log(`  artifacts in ${r.artifactsDir}`);
  } else {
    printTable(writeCapabilities());
  }
}
