/**
 * `vibe init [name]` — the non-technical happy path (D16).
 *
 * name → copy template (tokens + VIBE:GENERATED markers) → npm install → ffmpeg provision
 * (detect-existing-first, D21) → optional Python venv → agent-CLI detect → .vibe/state.json
 * → doctor summary → UI launch (lands with V4; until then a friendly next-steps note).
 *
 * Interactive prompts (enquirer) appear only on a TTY without --yes; every step has a flag
 * so CI/tests run the whole flow headless: --no-install --no-ffmpeg --venv/--no-venv --no-ui.
 */
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import type { Command } from 'commander';
import { UserError } from '../core/errors.js';
import { findOnPath, launchSpec } from '../core/proc.js';
import { VERSION } from '../version.js';
import { detectAgents } from '../agent/runner.js';
import {
  findTemplateDir,
  scaffoldProject,
  writeState,
  type VibeState,
} from '../init/scaffold.js';
import { setupFfmpeg, setupVenv } from './setup.js';
import { runDoctor, renderDoctorReport } from './doctor.js';

export interface InitOptions {
  name?: string;
  brand?: string;
  install?: boolean; // default true; --no-install skips
  ffmpeg?: boolean; // default true; --no-ffmpeg skips
  venv?: boolean; // undefined → prompt (TTY) or skip
  ui?: boolean; // default true; UI launch lands at V4
  yes?: boolean; // accept defaults, never prompt
  cwd?: string;
}

const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/i;

const step = (msg: string): void => void process.stderr.write(`${chalk.cyan('•')} ${msg}\n`);
const ok = (msg: string): void => void process.stderr.write(`${chalk.green('✓')} ${msg}\n`);
const warn = (msg: string): void => void process.stderr.write(`${chalk.yellow('•')} ${msg}\n`);

function isInteractive(opts: InitOptions): boolean {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY && !opts.yes);
}

async function promptText(message: string, initial?: string): Promise<string> {
  const { prompt } = (await import('enquirer')) as unknown as {
    prompt: (q: object) => Promise<Record<string, string>>;
  };
  const { value } = await prompt({ type: 'input', name: 'value', message, initial });
  return (value ?? '').trim();
}

async function promptConfirm(message: string, initial: boolean): Promise<boolean> {
  const { prompt } = (await import('enquirer')) as unknown as {
    prompt: (q: object) => Promise<Record<string, boolean>>;
  };
  const { value } = await prompt({ type: 'confirm', name: 'value', message, initial });
  return value ?? initial;
}

/** Spawn a long-running command with live output in the project dir; resolves with exit code. */
function runLive(bin: string, args: string[], cwd: string): Promise<number> {
  const launch = launchSpec(bin, args);
  return new Promise((resolve) => {
    const child = spawn(launch.command, launch.args, {
      cwd,
      stdio: 'inherit',
      windowsHide: true,
      windowsVerbatimArguments: launch.windowsVerbatimArguments,
    });
    child.on('error', () => resolve(-1));
    child.on('close', (code) => resolve(code ?? 1));
  });
}

/** The full init flow — exported so tests and (later) the UI can drive it headless. */
export async function initProject(opts: InitOptions): Promise<string> {
  const cwd = opts.cwd ?? process.cwd();
  const interactive = isInteractive(opts);

  // 1 ── name
  let name = opts.name?.trim();
  if (!name && interactive) name = await promptText('Project folder name', 'my-videos');
  if (!name) throw new UserError('a project name is required', 'Run `vibe init <name>` (e.g. `vibe init my-videos`).');
  if (!NAME_RE.test(name)) {
    throw new UserError(
      `"${name}" is not a valid project name`,
      'Use letters, digits, dots, dashes or underscores — e.g. my-videos.',
    );
  }
  const targetDir = path.resolve(cwd, name);
  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    throw new UserError(`folder already exists and is not empty: ${targetDir}`, 'Pick a new name or empty the folder.');
  }

  const brandName = opts.brand?.trim() || 'My Brand';

  // 2 ── scaffold
  step(`creating ${chalk.bold(name)} from the project template`);
  const templateDir = findTemplateDir();
  const { files, count } = scaffoldProject(templateDir, targetDir, {
    projectName: name,
    brandName,
    vibeVersion: VERSION,
  });
  ok(`scaffolded ${count} files`);

  // 3 ── git init (best-effort; fresh history for the user's own work)
  const git = findOnPath(['git']);
  if (git && !fs.existsSync(path.join(targetDir, '.git'))) {
    const r = spawnSync(git, ['init', '-q'], { cwd: targetDir, windowsHide: true });
    if (r.status === 0) ok('git repository initialized');
  }

  const provision: NonNullable<VibeState['provision']> = {};

  // 4 ── npm install
  if (opts.install === false) {
    provision.install = 'skipped';
    warn('skipping npm install (--no-install) — run `npm install` in the project before using it');
  } else {
    const npm = findOnPath(['npm']);
    if (!npm) {
      throw new UserError('npm not found on PATH', 'Install Node.js 20+ (https://nodejs.org) and re-run `vibe init`.');
    }
    step('installing dependencies (npm install — this is the longest step)');
    const code = await runLive(npm, ['install', '--no-fund', '--no-audit'], targetDir);
    if (code !== 0) {
      provision.install = 'failed';
      warn(`npm install exited ${code} — re-run \`npm install\` inside ${name} (then \`vibe doctor\`)`);
    } else {
      provision.install = 'done';
      ok('dependencies installed');
    }
  }

  // 5 ── ffmpeg (detect-existing-first, D21)
  if (opts.ffmpeg === false) {
    provision.ffmpeg = { source: 'skipped' };
    warn('skipping FFmpeg provisioning (--no-ffmpeg) — run `vibe setup --ffmpeg` later');
  } else {
    const onPath = findOnPath(['ffmpeg']) && findOnPath(['ffprobe']);
    let useExisting = Boolean(onPath);
    if (onPath && interactive) {
      useExisting = await promptConfirm('FFmpeg found on your PATH — use it (instead of downloading a project copy)?', true);
    }
    if (onPath && useExisting) {
      provision.ffmpeg = { source: 'path' };
      ok('using the FFmpeg already on your PATH');
    } else {
      try {
        await setupFfmpeg(targetDir);
        provision.ffmpeg = { source: 'downloaded' };
      } catch (e) {
        provision.ffmpeg = { source: 'skipped' };
        warn(`FFmpeg provisioning failed (${e instanceof Error ? e.message : e}) — run \`vibe setup --ffmpeg\` later`);
      }
    }
  }

  // 6 ── optional Python venv
  let wantVenv = opts.venv;
  if (wantVenv === undefined && interactive) {
    wantVenv = await promptConfirm(
      'Set up the optional Python toolkit now? (audio mastering, beat detection, yt-dlp — everything else works without it)',
      false,
    );
  }
  if (wantVenv) {
    try {
      setupVenv(targetDir);
      provision.venv = 'created';
    } catch (e) {
      provision.venv = 'failed';
      warn(`${e instanceof Error ? e.message : e} — run \`vibe setup --venv\` any time`);
    }
  } else {
    provision.venv = 'skipped';
    if (opts.venv === undefined) {
      warn('Python toolkit skipped — `vibe setup --venv` adds it any time (audio mastering/beat/yt-dlp until then: gracefully disabled)');
    }
  }

  // 7 ── agent detection
  step('looking for your agent CLI (Claude Code / Codex)');
  const detections = await detectAgents();
  const agentState: NonNullable<VibeState['agent']> = {};
  for (const d of detections) {
    agentState[d.id] = { found: d.found, ...(d.version ? { version: d.version } : {}) };
    if (d.found) ok(`${d.id} detected${d.version ? ` (${d.version})` : ''}`);
  }
  if (!detections.some((d) => d.found)) {
    warn('no agent CLI found — the agent is the editor, so install one:');
    process.stderr.write(
      `  Claude Code:  npm install -g @anthropic-ai/claude-code   (https://claude.com/claude-code)\n` +
        `  Codex CLI:    npm install -g @openai/codex              (https://developers.openai.com/codex/cli)\n`,
    );
  }

  // 8 ── state.json
  writeState(targetDir, {
    packageVersion: VERSION,
    projectName: name,
    brandName,
    platform: process.platform,
    createdAt: new Date().toISOString(),
    agent: agentState,
    provision,
    files,
  });

  // 9 ── doctor summary
  step('running doctor');
  const report = await runDoctor(targetDir);
  process.stderr.write(`${renderDoctorReport(report)}\n`);

  // 10 ── UI launch (V4) / next steps
  ok(`${chalk.bold(name)} is ready`);
  process.stderr.write(
    `\n  Next steps:\n` +
      `    cd ${name}\n` +
      `    vibe ui        ${chalk.dim('# the cockpit — arrives with the next release (V4)')}\n` +
      `    vibe doctor    ${chalk.dim('# health check any time')}\n` +
      `    npm test       ${chalk.dim('# the engine\'s self-test suite')}\n\n` +
      `  Add your API keys in ${chalk.bold(`${name}/.env`)} (OpenAI, Gemini, ElevenLabs) — the file explains each one.\n`,
  );
  if (opts.ui !== false) {
    process.stderr.write(chalk.dim('  (auto-starting the UI after init lands with V4 — until then it prints this note)\n'));
  }
  return targetDir;
}

export function registerInitCommand(program: Command): void {
  program
    .command('init [name]')
    .description('scaffold a complete video project and open the UI')
    .option('--brand <name>', 'brand name token for the seeded files (default: "My Brand")')
    .option('--no-ui', 'do not auto-start the UI after init')
    .option('--no-install', 'skip npm install (CI/testing)')
    .option('--no-ffmpeg', 'skip FFmpeg provisioning')
    .option('--venv', 'create the optional Python venv without asking')
    .option('--no-venv', 'skip the optional Python venv without asking')
    .option('-y, --yes', 'accept defaults; never prompt')
    .action(async (name: string | undefined, opts: { brand?: string; ui: boolean; install: boolean; ffmpeg: boolean; venv?: boolean; yes?: boolean }) => {
      await initProject({
        name,
        brand: opts.brand,
        install: opts.install,
        ffmpeg: opts.ffmpeg,
        venv: opts.venv,
        ui: opts.ui,
        yes: opts.yes,
      });
    });
}
