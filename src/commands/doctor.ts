/**
 * `vibe doctor` — the ported preflight (capability-doctor core, packaged).
 *
 * Package-level checks (run anywhere): Node version, platform, disk space, FFmpeg/ffprobe
 * via the D21 resolution chain preview (VIBE_FFMPEG → <project>/.vibe/bin → PATH), both
 * agent CLIs (claude + codex, version-probed) + the "at least one brain" rollup, git.
 *
 * Project-mode checks (only inside an initialized vibe project — vibe.config.json or
 * .vibe/state.json): .env provider keys (presence only — never prints values), the Python
 * venv, and a passthrough to the project's OWN capability doctor
 * (capabilities/_env/doctor.ts --json) when the engine is present (scaffolded from V2/V3).
 *
 * The full filter/encoder capability PROBE (ffmpeg-capabilities.json) ships with the engine
 * at V2 — until then the chain check reports presence + version, honestly labeled.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import chalk from 'chalk';
import { VERSION } from '../version.js';
import { captureCommand, findOnPath } from '../core/proc.js';
import { detectAgents } from '../agent/runner.js';
import { readAgentPreference } from '../agent/runner.js';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface DoctorCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  hint?: string;
}

export interface DoctorReport {
  version: string;
  platform: { os: NodeJS.Platform; arch: string; node: string };
  projectDir: string;
  initialized: boolean;
  agentPreference: string;
  checks: DoctorCheck[];
  summary: { ok: number; warn: number; fail: number };
  ok: boolean;
}

/** Is `dir` an initialized vibe project? (vibe.config.json or .vibe/state.json present.) */
export function isVibeProject(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, 'vibe.config.json')) ||
    fs.existsSync(path.join(dir, '.vibe', 'state.json'))
  );
}

/** D21 resolution-chain preview: VIBE_FFMPEG env → <project>/.vibe/bin → PATH. */
export function resolveFfmpegPath(tool: 'ffmpeg' | 'ffprobe', projectDir: string): string | null {
  const exe = process.platform === 'win32' ? `${tool}.exe` : tool;
  const override = process.env.VIBE_FFMPEG;
  if (override) {
    // VIBE_FFMPEG may point at the ffmpeg binary or its bin dir; derive the sibling tool.
    const base = fs.existsSync(override) && fs.statSync(override).isDirectory() ? override : path.dirname(override);
    const candidate = path.join(base, exe);
    if (fs.existsSync(candidate)) return candidate;
  }
  const local = path.join(projectDir, '.vibe', 'bin', exe);
  if (fs.existsSync(local)) return local;
  return findOnPath([tool]);
}

async function ffmpegCheck(tool: 'ffmpeg' | 'ffprobe', projectDir: string): Promise<DoctorCheck> {
  const label = tool === 'ffmpeg' ? 'FFmpeg' : 'ffprobe';
  const bin = resolveFfmpegPath(tool, projectDir);
  if (!bin) {
    return {
      id: tool,
      label,
      status: 'warn',
      detail: 'not found (VIBE_FFMPEG / .vibe/bin / PATH)',
      hint: '`vibe init` auto-provisions FFmpeg per-OS (engine lands in V2); or install it yourself',
    };
  }
  const r = await captureCommand(bin, ['-version'], { timeoutMs: 5_000 });
  if (r.exitCode !== 0) {
    return { id: tool, label, status: 'fail', detail: `found at ${bin} but \`-version\` exited ${r.exitCode}` };
  }
  const first = r.stdout.split('\n')[0]?.trim() ?? '';
  const version = first.match(/version\s+(\S+)/)?.[1] ?? first;
  return { id: tool, label, status: 'ok', detail: `${version} (${bin})` };
}

function diskCheck(dir: string): DoctorCheck {
  try {
    const s = fs.statfsSync(dir);
    const freeGb = Math.round((s.bavail * s.bsize) / 1024 / 1024 / 1024);
    const minGb = Number(process.env.VIBE_MIN_FREE_GB ?? 5);
    if (freeGb < minGb)
      return { id: 'disk', label: 'Disk space', status: 'fail', detail: `${freeGb} GB free — too low for renders (need ≥ ${minGb} GB)` };
    if (freeGb < 20)
      return { id: 'disk', label: 'Disk space', status: 'warn', detail: `${freeGb} GB free — getting tight` };
    return { id: 'disk', label: 'Disk space', status: 'ok', detail: `${freeGb} GB free` };
  } catch {
    return { id: 'disk', label: 'Disk space', status: 'warn', detail: 'could not determine free space' };
  }
}

/** Provider keys: presence only — values are NEVER read into the report. */
export function envKeyChecks(projectDir: string): DoctorCheck[] {
  let envText = '';
  try {
    envText = fs.readFileSync(path.join(projectDir, '.env'), 'utf8');
  } catch {
    /* no .env file — process.env may still carry keys */
  }
  const keys: Array<{ key: string; what: string; required: boolean }> = [
    { key: 'OPENAI_API_KEY', what: 'transcription (Whisper) & thumbnails', required: true },
    { key: 'GEMINI_API_KEY', what: 'visual QA (the council / verify --eyes)', required: true },
    { key: 'ELEVENLABS_API_KEY', what: 'voice-over, music & SFX', required: false },
    { key: 'RUNWAY_API_SECRET', what: 'optional paid VFX (Runway)', required: false },
    { key: 'FAL_KEY', what: 'optional paid VFX (Seedance via fal.ai)', required: false },
  ];
  return keys.map(({ key, what, required }) => {
    // Horizontal whitespace ONLY around `=`: a bare `\s*` would swallow the newline after an
    // EMPTY `KEY=` line and "find" the next line's first character (live-found at V5 prep —
    // every empty key except the file's last reported as set).
    const present = !!process.env[key] || new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*\\S`, 'm').test(envText);
    return {
      id: `env-${key}`,
      label: `.env ${key}`,
      status: present ? ('ok' as const) : ('warn' as const),
      detail: present ? 'set' : `not set — ${what} unavailable`,
      hint: present || required ? undefined : 'optional',
    };
  });
}

async function projectEngineDoctor(projectDir: string): Promise<DoctorCheck[]> {
  const engineDoctor = path.join(projectDir, 'capabilities', '_env', 'doctor.ts');
  if (!fs.existsSync(engineDoctor)) {
    return [
      {
        id: 'engine',
        label: 'Capability engine',
        status: 'warn',
        detail: 'capabilities/ not present in this project — engine checks unavailable (engine ships from V2)',
      },
    ];
  }
  // Run the project's OWN doctor under the project's LOCAL tsx with the current node binary
  // (never `npx` — .cmd shims + network; the parent repo's hard rule).
  const tsxCli = path.join(projectDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (!fs.existsSync(tsxCli)) {
    return [
      {
        id: 'engine',
        label: 'Capability engine',
        status: 'warn',
        detail: 'capabilities/ present but tsx is not installed — run `npm install` in the project',
      },
    ];
  }
  const r = await captureCommand(process.execPath, [tsxCli, engineDoctor, '--json'], {
    cwd: projectDir,
    timeoutMs: 120_000,
  });
  try {
    const lastJson = r.stdout
      .split('\n')
      .reverse()
      .find((l) => l.trim().startsWith('{'));
    const parsed = JSON.parse(lastJson ?? '') as {
      checks: Array<{ name: string; status: 'green' | 'yellow' | 'red'; detail: string }>;
    };
    const map: Record<'green' | 'yellow' | 'red', CheckStatus> = { green: 'ok', yellow: 'warn', red: 'fail' };
    return parsed.checks.map((c) => ({
      id: `engine-${c.name.replace(/\s+/g, '-')}`,
      label: `engine: ${c.name}`,
      status: map[c.status] ?? 'warn',
      detail: c.detail,
    }));
  } catch {
    return [
      {
        id: 'engine',
        label: 'Capability engine',
        status: 'fail',
        detail: `the project's capabilities/_env/doctor.ts did not produce JSON (exit ${r.exitCode})`,
        hint: 'run it directly inside the project to see why',
      },
    ];
  }
}

export async function runDoctor(projectDir: string = process.cwd()): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({
    id: 'node',
    label: 'Node.js ≥ 20',
    status: nodeMajor >= 20 ? 'ok' : 'fail',
    detail: `v${process.versions.node}`,
    hint: nodeMajor >= 20 ? undefined : 'install Node 20+ from nodejs.org',
  });

  checks.push({ id: 'platform', label: 'Platform', status: 'ok', detail: `${process.platform} ${process.arch}` });
  checks.push(diskCheck(projectDir));
  checks.push(await ffmpegCheck('ffmpeg', projectDir));
  checks.push(await ffmpegCheck('ffprobe', projectDir));

  // Both agent brains, via the adapters' real detection (version-probed, shim-hardened).
  const detections = await detectAgents();
  for (const d of detections) {
    const label = d.id === 'claude' ? 'Claude Code CLI' : 'Codex CLI';
    checks.push({
      id: d.id,
      label,
      status: d.found ? 'ok' : 'warn',
      detail: d.found ? `${d.version ?? '?'} (${d.path ?? 'PATH'})` : (d.error ?? 'not found'),
    });
  }
  const hasAgent = detections.some((d) => d.found);
  checks.push({
    id: 'agent',
    label: 'Agent CLI (Claude Code or Codex)',
    status: hasAgent ? 'ok' : 'fail',
    detail: hasAgent
      ? `available: ${detections.filter((d) => d.found).map((d) => d.id).join(', ')}`
      : 'none found — JBS Vibe Editing requires Claude Code (or Codex CLI)',
    hint: hasAgent ? undefined : 'npm install -g @anthropic-ai/claude-code  (or @openai/codex)',
  });

  const git = findOnPath(['git']);
  checks.push({
    id: 'git',
    label: 'git',
    status: git ? 'ok' : 'warn',
    detail: git ?? 'not on PATH — projects work, but version control is recommended',
  });

  // ── project-mode ──────────────────────────────────────────────────────────────
  const initialized = isVibeProject(projectDir);
  if (initialized) {
    checks.push(...envKeyChecks(projectDir));
    const venvDir = path.join(projectDir, 'capabilities', '.venv');
    checks.push({
      id: 'venv',
      label: 'Python venv',
      status: fs.existsSync(venvDir) ? 'ok' : 'warn',
      detail: fs.existsSync(venvDir)
        ? venvDir
        : 'not provisioned — audio mastering / beat / VAD degrade gracefully (`vibe setup --venv`)',
    });
    checks.push(...(await projectEngineDoctor(projectDir)));
  }

  const summary = {
    ok: checks.filter((c) => c.status === 'ok').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
  };

  return {
    version: VERSION,
    platform: { os: process.platform, arch: process.arch, node: process.versions.node },
    projectDir,
    initialized,
    agentPreference: readAgentPreference(projectDir),
    checks,
    summary,
    ok: summary.fail === 0,
  };
}

const GLYPH: Record<CheckStatus, string> = {
  ok: chalk.green('✓'),
  warn: chalk.yellow('•'),
  fail: chalk.red('✗'),
};

export function renderDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push(chalk.bold(`vibe doctor — v${report.version}`));
  lines.push('');
  for (const check of report.checks) {
    lines.push(`  ${GLYPH[check.status]} ${check.label.padEnd(36)} ${chalk.dim(check.detail)}`);
    if (check.hint && check.status !== 'ok') lines.push(chalk.dim(`      ↳ ${check.hint}`));
  }
  lines.push('');
  if (!report.initialized) {
    lines.push(chalk.dim('  (not inside a vibe project — project checks skipped; run `vibe init` to create one)'));
    lines.push('');
  }
  lines.push(
    `  ${report.summary.ok} ok · ${report.summary.warn} warn · ${report.summary.fail} fail`,
  );
  lines.push('');
  lines.push(
    report.ok
      ? chalk.green('Ready.') + (report.summary.warn ? chalk.dim(' Warnings are optional/degraded paths.') : '')
      : chalk.red('Fix the ✗ items above before making videos.'),
  );
  return lines.join('\n') + '\n';
}

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('check this machine (and project) for everything JBS Vibe Editing needs')
    .option('--json', 'machine-readable output')
    .action(async (opts: { json?: boolean }, cmd: Command) => {
      // --json may be parsed by the root program (global option) — honor both.
      const globals = cmd.optsWithGlobals() as { json?: boolean; project?: string };
      const json = opts.json === true || globals.json === true;
      const projectDir = path.resolve(globals.project ?? process.cwd());
      const report = await runDoctor(projectDir);

      if (json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      } else {
        process.stdout.write(renderDoctorReport(report));
      }
      if (!report.ok) process.exitCode = 1;
    });
}
