#!/usr/bin/env tsx
/**
 * capabilities/_env/setup-venv.ts — create the OPTIONAL Python venv for the audio /
 * analysis engines (cross-platform replacement for the old PowerShell bootstrap).
 *
 * The venv is OPTIONAL: without it, audio mastering (master.py/mix.py), beat/VAD
 * detection and yt-dlp downloads are disabled with clear doctor messages — the pure-ffmpeg
 * loudnorm path still delivers audio at −14 LUFS, so the core pipeline keeps working.
 *
 * NOTE: STT is OpenAI whisper-1 ONLY — there is NO local whisper here, by design.
 * Torch is NOT installed (no local VFX models policy).
 *
 * Usage:
 *   tsx capabilities/_env/setup-venv.ts [--recreate]
 *
 * Python discovery order: `py -3.12` (Windows launcher) → python3.12 → python3 → python
 * (3.10+ accepted; 3.12 is the tested pin). venv lands at capabilities/.venv.
 */
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ENV_DIR = __dirname;
const CAP_DIR = path.resolve(ENV_DIR, '..');
const VENV_DIR = path.join(CAP_DIR, '.venv');
const REQUIREMENTS = path.join(CAP_DIR, 'requirements.txt');

/** The venv's python, per-OS (Scripts/ on Windows, bin/ on POSIX). */
export function venvPython(): string {
  return process.platform === 'win32'
    ? path.join(VENV_DIR, 'Scripts', 'python.exe')
    : path.join(VENV_DIR, 'bin', 'python');
}

const IMPORT_CHECK = 'import pedalboard, pyloudnorm, soundfile, numpy, PIL, colour, cv2; print("ok")';

function tryRun(cmd: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true });
}

interface PythonCandidate {
  cmd: string;
  args: string[];
  label: string;
}

/** Find a usable Python 3.10+ (3.12 preferred — the tested wheel set). */
export function discoverPython(): { cmd: string; baseArgs: string[]; version: string } | null {
  const candidates: PythonCandidate[] = [
    { cmd: 'py', args: ['-3.12'], label: 'py -3.12' },
    { cmd: 'python3.12', args: [], label: 'python3.12' },
    { cmd: 'python3', args: [], label: 'python3' },
    { cmd: 'python', args: [], label: 'python' },
  ];
  for (const c of candidates) {
    const r = tryRun(c.cmd, [...c.args, '--version']);
    if (r.status !== 0) continue;
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
    const m = out.match(/Python (\d+)\.(\d+)/);
    if (!m) continue;
    const major = Number(m[1]);
    const minor = Number(m[2]);
    if (major === 3 && minor >= 10) return { cmd: c.cmd, baseArgs: c.args, version: out };
  }
  return null;
}

function main(): number {
  const recreate = process.argv.includes('--recreate');
  const py = venvPython();

  // Idempotency: an existing healthy venv is left alone unless --recreate.
  if (!recreate && fs.existsSync(py)) {
    const check = tryRun(py, ['-c', IMPORT_CHECK]);
    if (check.status === 0) {
      console.log(`✓ venv already healthy at ${VENV_DIR} (use --recreate to rebuild)`);
      return 0;
    }
    console.log('• venv exists but imports fail — reinstalling requirements…');
  }

  const python = discoverPython();
  if (!python) {
    console.error('✗ No Python 3.10+ found (tried: py -3.12, python3.12, python3, python).');
    console.error('  The venv is OPTIONAL — without it, audio mastering, beat/VAD detection and');
    console.error('  yt-dlp downloads are disabled (vibe doctor shows exactly what is off).');
    console.error('  Install Python 3.12 from https://www.python.org/downloads/ and re-run:');
    console.error('  tsx capabilities/_env/setup-venv.ts');
    return 1;
  }
  console.log(`• Using ${python.version} (${python.cmd}${python.baseArgs.join(' ') ? ' ' + python.baseArgs.join(' ') : ''})`);

  if (recreate && fs.existsSync(VENV_DIR)) {
    console.log('• Removing existing venv (--recreate)…');
    fs.rmSync(VENV_DIR, { recursive: true, force: true });
  }

  if (!fs.existsSync(py)) {
    console.log(`• Creating venv at ${VENV_DIR}…`);
    const mk = spawnSync(python.cmd, [...python.baseArgs, '-m', 'venv', VENV_DIR], {
      encoding: 'utf8',
      stdio: 'inherit',
      windowsHide: true,
    });
    if (mk.status !== 0) {
      console.error(`✗ venv creation failed (exit ${mk.status}).`);
      return 1;
    }
  }

  console.log('• Upgrading pip…');
  const pip = spawnSync(py, ['-m', 'pip', 'install', '--upgrade', 'pip'], { stdio: 'inherit', windowsHide: true });
  if (pip.status !== 0) {
    console.error(`✗ pip upgrade failed (exit ${pip.status}).`);
    return 1;
  }

  console.log(`• Installing requirements (${path.relative(process.cwd(), REQUIREMENTS)})…`);
  console.log('  (pedalboard / librosa / opencv wheels — this can take a few minutes)');
  const install = spawnSync(py, ['-m', 'pip', 'install', '-r', REQUIREMENTS], { stdio: 'inherit', windowsHide: true });
  if (install.status !== 0) {
    console.error(`✗ pip install failed (exit ${install.status}).`);
    console.error('  Common cause: a wheel missing for your Python version — Python 3.12 is the tested pin.');
    console.error('  The venv is OPTIONAL; the ffmpeg-only audio path still works without it.');
    return 1;
  }

  console.log('• Verifying imports…');
  const check = tryRun(py, ['-c', IMPORT_CHECK]);
  if (check.status !== 0) {
    console.error('✗ Import verification failed:');
    console.error((check.stderr ?? '').trim());
    return 1;
  }

  console.log(`✓ venv ready at ${VENV_DIR}`);
  console.log('  Enabled: audio mastering (master.py/mix.py), loudness verify, beat/VAD detection,');
  console.log('  LUT generation, color-match transfer, yt-dlp downloads.');
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) process.exit(main());
