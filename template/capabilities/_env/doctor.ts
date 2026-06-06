#!/usr/bin/env tsx
/**
 * capabilities/_env/doctor.ts — preflight for the capability layer.
 *
 * Green/yellow/red table over: full ffmpeg build (+ required filters/encoders), ffprobe,
 * node, the Python venv + all imports, Blender, GPU (Blender OPTIX — on-demand),
 * disk space, and the three .env keys. Exits non-zero if anything is RED.
 * (STT is OpenAI whisper-1 cloud — no local faster-whisper, so GPU is NOT an STT dependency.)
 *
 *   tsx capabilities/_env/doctor.ts          → fast preflight checks
 *   tsx capabilities/_env/doctor.ts --json   → single machine-readable line (UI /api/health)
 *
 * RED    = a committed-core capability will fail.
 * YELLOW = an optional / on-demand / fallback path is degraded (expected: venv, Blender, GPU, optional keys).
 * GREEN  = good.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveFfmpeg, probeCapabilities } from './ffmpeg';
import { VENV_PY } from './contract';

type Status = 'green' | 'yellow' | 'red';
interface Check { name: string; status: Status; detail: string }

const ENV_DIR = __dirname;
const REPO_ROOT = path.resolve(ENV_DIR, '..', '..');

const checks: Check[] = [];
const add = (name: string, status: Status, detail: string) => checks.push({ name, status, detail });

// --- ffmpeg full build + filters/encoders --------------------------------
try {
  const caps = probeCapabilities();
  if (caps.ffmpeg === 'ffmpeg') {
    add('ffmpeg', 'red', 'no full build found — run `vibe setup --ffmpeg` (or set VIBE_FFMPEG / install ffmpeg on PATH)');
  } else if (caps.missing.length) {
    add('ffmpeg', 'red', `${caps.version} (${caps.source}) — MISSING: ${caps.missing.join(', ')}`);
  } else {
    add('ffmpeg', 'green', `${caps.version} (${caps.source}) — all required filters/encoders present`);
  }
} catch (e) {
  add('ffmpeg', 'red', `probe failed: ${e instanceof Error ? e.message : String(e)}`);
}

// --- ffprobe --------------------------------------------------------------
try {
  const { ffprobe } = resolveFfmpeg();
  const r = spawnSync(ffprobe, ['-version'], { encoding: 'utf8' });
  if (r.status === 0) add('ffprobe', 'green', `${(r.stdout ?? '').split('\n')[0]} (${ffprobe})`);
  else add('ffprobe', 'red', `not runnable: ${ffprobe}`);
} catch (e) {
  add('ffprobe', 'red', `${e instanceof Error ? e.message : String(e)}`);
}

// --- node -----------------------------------------------------------------
add('node', 'green', process.version);

// --- python venv + imports (OPTIONAL — audio mastering / beat / VAD / yt-dlp) ---
if (!fs.existsSync(VENV_PY)) {
  add('python venv', 'yellow', 'not set up (optional) — audio mastering, beat/VAD detection and yt-dlp are disabled. Run `vibe setup --venv` (or `tsx capabilities/_env/setup-venv.ts`).');
} else {
  const probe = spawnSync(
    VENV_PY,
    ['-c', 'import pedalboard, pyloudnorm, soundfile, numpy, PIL, colour, cv2; print(pedalboard.__version__)'],
    { encoding: 'utf8' },
  );
  if (probe.status === 0) add('python venv', 'green', `imports ok (pedalboard ${(probe.stdout ?? '').trim()})`);
  else add('python venv', 'red', `venv exists but imports fail: ${(probe.stderr ?? '').trim().split('\n').pop()} — rebuild with \`tsx capabilities/_env/setup-venv.ts --recreate\``);
}

// --- screen-record (on-demand: Playwright + @playwright/mcp + a Chrome binary) ---------
{
  // playwright library, pinned in package.json devDeps (the page.screencast version, >= 1.59)
  const pwPkg = path.join(REPO_ROOT, 'node_modules', 'playwright', 'package.json');
  if (!fs.existsSync(pwPkg)) {
    add('playwright', 'yellow', 'not installed — screen-record is on-demand (npm i -D playwright). Pinned in package.json devDeps.');
  } else {
    let ver = '?';
    try { ver = JSON.parse(fs.readFileSync(pwPkg, 'utf8')).version ?? '?'; } catch { /* keep ? */ }
    const major = parseInt(ver.split('.')[0] ?? '0', 10);
    const minor = parseInt(ver.split('.')[1] ?? '0', 10);
    const screencastOk = major > 1 || (major === 1 && minor >= 59);
    add('playwright', screencastOk ? 'green' : 'yellow', screencastOk ? `${ver} (page.screencast available)` : `${ver} — needs >= 1.59 for page.screencast; bump the pin`);
  }

  // @playwright/mcp resolvable (the EXPLORE stage; pinned EXACT in .mcp.json, run via npx)
  const mcpJson = path.join(REPO_ROOT, '.mcp.json');
  const mcpDir = path.join(REPO_ROOT, 'node_modules', '@playwright', 'mcp');
  if (fs.existsSync(mcpDir)) add('@playwright/mcp', 'green', 'resolvable in node_modules');
  else if (fs.existsSync(mcpJson)) add('@playwright/mcp', 'yellow', 'declared in .mcp.json (npx-resolved on first use) — not vendored locally');
  else add('@playwright/mcp', 'yellow', 'no .mcp.json — screen-record EXPLORE stage unconfigured');

  // a Chrome/Chromium binary (prefer system Chrome via channel:'chrome'), per-OS
  const chromePaths =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          path.join(process.env.LOCALAPPDATA ?? '', 'Google\\Chrome\\Application\\chrome.exe'),
        ]
      : process.platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const hasChrome = chromePaths.some((p) => p && fs.existsSync(p));
  const pwBrowserDirs =
    process.platform === 'win32'
      ? [path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')]
      : process.platform === 'darwin'
        ? [path.join(process.env.HOME ?? '', 'Library', 'Caches', 'ms-playwright')]
        : [path.join(process.env.HOME ?? '', '.cache', 'ms-playwright')];
  const hasPwChromium =
    pwBrowserDirs.some((p) => p && fs.existsSync(p)) ||
    fs.existsSync(path.join(REPO_ROOT, 'node_modules', 'playwright-core', '.local-browsers'));
  if (hasChrome) add('chrome (capture)', 'green', 'system Chrome found (channel:chrome)');
  else if (hasPwChromium) add('chrome (capture)', 'yellow', 'no system Chrome — Playwright Chromium present (fallback)');
  else add('chrome (capture)', 'yellow', "no Chrome/Chromium — run `npx playwright install chromium` for screen-record");
}

// --- blender (on-demand) --------------------------------------------------
{
  const onPath = spawnSync('blender', ['--version'], { encoding: 'utf8' });
  const installDirs =
    process.platform === 'win32'
      ? ['C:\\Program Files\\Blender Foundation']
      : process.platform === 'darwin'
        ? ['/Applications/Blender.app']
        : ['/usr/share/blender', '/snap/blender'];
  const installed = installDirs.find((p) => fs.existsSync(p));
  if (onPath.status === 0) add('blender', 'green', (onPath.stdout ?? '').split('\n')[0]);
  else if (installed) add('blender', 'yellow', `installed under ${installed} but not on PATH`);
  else add('blender', 'yellow', 'not installed — the 3D layer is on-demand only (roadmap)');
}

// --- GPU (on-demand Blender OPTIX + Remotion GPU render; NOT STT, NOT local VFX — there is none) ----------
{
  const smi = spawnSync('nvidia-smi', ['--query-gpu=name,driver_version,memory.total', '--format=csv,noheader'], { encoding: 'utf8' });
  if (smi.status !== 0) {
    add('GPU', 'yellow', 'nvidia-smi not found — on-demand Blender OPTIX / NVENC encode would fall back to CPU (normal on macOS)');
  } else {
    const gpu = (smi.stdout ?? '').trim().split('\n')[0];
    const vramMatch = gpu.match(/(\d+)\s*MiB/);
    const vramGb = vramMatch ? Math.round(parseInt(vramMatch[1], 10) / 1024) : 0;
    if (vramGb && vramGb < 8) {
      add('GPU', 'yellow', `${gpu} — ${vramGb} GB VRAM (fine: VFX is PAID cloud only, no local models; matters only for Blender OPTIX)`);
    } else {
      add('GPU', 'green', gpu);
    }
  }
}

// --- disk space (project drive) --------------------------------------------
try {
  const st = fs.statfsSync(REPO_ROOT);
  const freeGb = Math.round((st.bavail * st.bsize) / 1024 / 1024 / 1024);
  const minGb = Number(process.env.VIBE_MIN_FREE_GB ?? 5);
  if (freeGb < minGb) add('disk', 'red', `${freeGb} GB free — too low for renders (min ${minGb})`);
  else if (freeGb < 20) add('disk', 'yellow', `${freeGb} GB free — getting tight`);
  else add('disk', 'green', `${freeGb} GB free`);
} catch {
  add('disk', 'yellow', 'could not determine free space');
}

// --- .env keys (presence only — never prints values) ----------------------
{
  const envPath = path.join(REPO_ROOT, '.env');
  let envText = '';
  try { envText = fs.readFileSync(envPath, 'utf8'); } catch { /* no file */ }
  for (const key of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'ELEVENLABS_API_KEY']) {
    const present = !!process.env[key] || new RegExp(`^\\s*${key}\\s*=\\s*\\S`, 'm').test(envText);
    add(`.env ${key}`, present ? 'green' : 'yellow', present ? 'set' : 'not set (some flows will fail)');
  }
}

// --- render ---------------------------------------------------------------
// `--json` emits a single machine-readable line for the UI's /api/health and exits with the
// same code semantics (1 if any red). The default (no-flag) human table below stays stable.
if (process.argv.includes('--json')) {
  const reds = checks.filter((c) => c.status === 'red').length;
  const yellows = checks.filter((c) => c.status === 'yellow').length;
  const greens = checks.length - reds - yellows;
  process.stdout.write(JSON.stringify({ checks, reds, yellows, greens }) + '\n');
  process.exit(reds ? 1 : 0);
}

const icon: Record<Status, string> = { green: '🟢', yellow: '🟡', red: '🔴' };
const pad = Math.max(...checks.map((c) => c.name.length));
console.log('\nvibe capabilities — doctor\n' + '─'.repeat(60));
for (const c of checks) console.log(`${icon[c.status]} ${c.name.padEnd(pad)}  ${c.detail}`);
const reds = checks.filter((c) => c.status === 'red');
const yellows = checks.filter((c) => c.status === 'yellow');
console.log('─'.repeat(60));
console.log(`${reds.length} red · ${yellows.length} yellow · ${checks.length - reds.length - yellows.length} green`);
if (reds.length) {
  console.log('\n🔴 fix the red items before running capabilities.');
  process.exit(1);
}
console.log('\n✓ core is green.' + (yellows.length ? ' Yellow items are optional/on-demand paths.' : ''));
