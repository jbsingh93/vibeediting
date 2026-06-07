/**
 * capabilities/_tests/fixtures.ts — synth + cache the small media the P1 tests need.
 * Idempotent: generated once into out/work/_tests/ via the full ffmpeg, reused across test files.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT, VENV_PY } from '../_env/contract';
import { resolveFfmpeg } from '../_env/ffmpeg';

export { VENV_PY };

export const FX_DIR = path.join(REPO_ROOT, 'out', 'work', '_tests');
const { ffmpeg } = resolveFfmpeg();

function ff(args: string[]): void {
  const r = spawnSync(ffmpeg, ['-y', ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, cwd: FX_DIR });
  if (r.status !== 0) throw new Error(`fixture ffmpeg failed:\n${(r.stderr ?? '').slice(-800)}`);
}

function fx(name: string): string {
  return path.join(FX_DIR, name);
}

/** Create all fast fixtures if missing. Returns their paths. */
export function ensureFixtures(): Record<string, string> {
  fs.mkdirSync(FX_DIR, { recursive: true });
  const paths = {
    voiceWav: fx('voice.wav'),
    musicWav: fx('music.wav'),
    clipMp4: fx('clip.mp4'), // 2s video + audio
    sceneMp4: fx('scene.mp4'), // 2s with a hard scene change at 1s
    silenceWav: fx('silence.wav'), // tone-silence-tone
    capsJson: fx('caps.json'),
    imagePng: fx('image.png'),
    silentMp4: fx('silent.mp4'), // 2s video + DIGITAL-SILENCE audio (loudnorm measures -inf)
    orangePng: fx('orange.png'), // solid color reference frame (color-transfer target)
  };

  if (!fs.existsSync(paths.voiceWav))
    ff(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=2', '-f', 'lavfi', '-i', 'anoisesrc=d=2:c=pink:a=0.05',
        '-filter_complex', '[0][1]amix=inputs=2', '-ar', '44100', paths.voiceWav]);
  if (!fs.existsSync(paths.musicWav))
    ff(['-f', 'lavfi', '-i', 'sine=frequency=110:duration=3', '-af', 'volume=0.3', paths.musicWav]);
  if (!fs.existsSync(paths.clipMp4))
    ff(['-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
        '-shortest', '-pix_fmt', 'yuv420p', paths.clipMp4]);
  if (!fs.existsSync(paths.sceneMp4))
    ff(['-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=30', '-f', 'lavfi', '-i', 'mandelbrot=size=320x240:rate=30',
        '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-t', '2', '-pix_fmt', 'yuv420p', paths.sceneMp4]);
  if (!fs.existsSync(paths.silenceWav))
    ff(['-f', 'lavfi', '-i', 'sine=frequency=300:duration=0.8', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=0.6',
        '-f', 'lavfi', '-i', 'sine=frequency=400:duration=0.8', '-filter_complex', '[0][1][2]concat=n=3:v=0:a=1[a]', '-map', '[a]', paths.silenceWav]);
  if (!fs.existsSync(paths.imagePng))
    ff(['-f', 'lavfi', '-i', 'testsrc=size=320x240', '-frames:v', '1', paths.imagePng]);
  if (!fs.existsSync(paths.silentMp4))
    ff(['-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=30', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo:d=2',
        '-shortest', '-c:a', 'aac', '-pix_fmt', 'yuv420p', paths.silentMp4]);
  if (!fs.existsSync(paths.orangePng))
    ff(['-f', 'lavfi', '-i', 'color=c=orange:size=320x240', '-frames:v', '1', paths.orangePng]);
  if (!fs.existsSync(paths.capsJson)) {
    const caps = [
      ['welcome', 0, 400], ['um', 400, 600], ['to', 600, 800], ['this', 800, 1000], ['is', 1000, 1100],
      ['a', 1100, 1200], ['test', 1200, 1400], ['this', 1500, 1700], ['is', 1700, 1800], ['a', 1800, 1900], ['test', 1900, 2100],
    ].map(([text, s, e]) => ({ text, startMs: s, endMs: e, timestampMs: ((s as number) + (e as number)) / 2, confidence: 0.9 }));
    fs.writeFileSync(paths.capsJson, JSON.stringify(caps));
  }
  return paths;
}

export const TEAL_LUT = path.join(REPO_ROOT, 'capabilities', 'color', 'luts', 'teal-orange.cube');

/** Parse the last JSON line of a capability's stdout (the result envelope). */
export function lastEnvelope(stdout: string): { success: boolean; capability: string; outputs: string[]; metrics: Record<string, unknown>; error?: string } {
  const lines = stdout.trim().split('\n').filter(Boolean);
  return JSON.parse(lines[lines.length - 1]);
}

export interface ProcRun { status: number; stdout: string; stderr: string }

/** Run a venv-python capability, return raw process result. */
export function runPy(scriptRel: string, args: string[]): ProcRun {
  const r = spawnSync(VENV_PY, [path.join(REPO_ROOT, scriptRel), ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** Run a .ts capability under the local tsx (offline), return raw process result. */
export function runTsx(scriptRel: string, args: string[]): ProcRun {
  const r = spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO_ROOT, scriptRel), ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd: REPO_ROOT });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/**
 * Like runTsx, but with explicit env overrides — used to pin provider keys to '' (forces the
 * "key missing" guard even when .env HAS the key: loadDotEnv never overwrites a defined var)
 * or to a fake value (proves arg validation fires BEFORE any network call). Never real keys.
 */
export function runTsxEnv(scriptRel: string, args: string[], env: Record<string, string>): ProcRun {
  const r = spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO_ROOT, scriptRel), ...args], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd: REPO_ROOT, env: { ...process.env, ...env },
  });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
