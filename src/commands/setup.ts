/**
 * `vibe setup` — re-run individual provisioning steps inside an existing project.
 *   --ffmpeg  download a full per-OS ffmpeg/ffprobe into .vibe/bin + run the capability probe
 *   --venv    create capabilities/.venv via the project's setup-venv.ts (optional engines)
 *   --browser Playwright browser install (lands with the scaffolder, V3)
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import type { Command } from 'commander';
import { UserError } from '../core/errors.js';
import { findOnPath, launchSpec } from '../core/proc.js';
import { provisionFfmpeg } from '../init/ffmpeg-provision.js';

/** Run a project-local TypeScript entry via the project's own tsx (never npx — shim footgun). */
function runProjectTsx(projectDir: string, scriptRel: string, args: string[] = []): number {
  const tsxCli = path.join(projectDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (!fs.existsSync(tsxCli)) {
    throw new UserError(
      'the project has no local tsx (node_modules missing?)',
      'Run `npm install` inside the project first.',
    );
  }
  const r = spawnSync(process.execPath, [tsxCli, path.join(projectDir, scriptRel), ...args], {
    cwd: projectDir,
    stdio: 'inherit',
    windowsHide: true,
  });
  // A spawn-level failure has no exit code — surface the reason instead of a silent "1"
  // (a silent variant of this cost a CI-debugging round at GATE V3).
  if (r.error) {
    process.stderr.write(`${chalk.yellow('•')} ${scriptRel} could not start: ${r.error.message}\n`);
  }
  return r.status ?? 1;
}

export async function setupFfmpeg(projectDir: string): Promise<void> {
  process.stderr.write(`${chalk.cyan('•')} provisioning FFmpeg into ${path.join(projectDir, '.vibe', 'bin')}\n`);
  let lastPhase = '';
  const result = await provisionFfmpeg(projectDir, (phase, detail) => {
    if (phase === 'download' && lastPhase === 'download') {
      process.stderr.write(`\r  ${chalk.dim('download')} ${detail}        `);
    } else {
      if (lastPhase === 'download') process.stderr.write('\n');
      process.stderr.write(`  ${chalk.dim(phase)} ${detail}\n`);
    }
    lastPhase = phase;
  });
  process.stderr.write(`${chalk.green('✓')} ${result.version}\n`);
  process.stderr.write(`  checksum: ${result.checksum} · source: ${result.host}\n`);

  // Run the project's capability probe so ffmpeg-capabilities.json reflects this machine.
  const probeScript = path.join(projectDir, 'capabilities', '_env', 'ffmpeg.ts');
  if (fs.existsSync(probeScript)) {
    process.stderr.write(`${chalk.cyan('•')} probing filters/encoders → capabilities/_env/ffmpeg-capabilities.json\n`);
    const code = runProjectTsx(projectDir, path.join('capabilities', '_env', 'ffmpeg.ts'));
    if (code !== 0) process.stderr.write(`${chalk.yellow('•')} probe exited ${code} — run \`vibe doctor\` for details\n`);
  }
}

export function setupVenv(projectDir: string): void {
  const script = path.join(projectDir, 'capabilities', '_env', 'setup-venv.ts');
  if (!fs.existsSync(script)) {
    throw new UserError(
      'capabilities/_env/setup-venv.ts not found — is this a vibe project?',
      'Run `vibe setup` from the project root (or pass --project <dir>).',
    );
  }
  const code = runProjectTsx(projectDir, path.join('capabilities', '_env', 'setup-venv.ts'));
  if (code !== 0) {
    throw new UserError(
      `venv setup exited ${code}`,
      'Python 3.10+ is required for the optional audio/analysis engines. Everything else works without it.',
    );
  }
}

/** Install Playwright + Chromium into the project (screen-record capability, on-demand). */
export function setupBrowser(projectDir: string): void {
  const npm = findOnPath(['npm']);
  if (!npm) throw new UserError('npm not found on PATH', 'Install Node.js 20+ first.');
  process.stderr.write(`${chalk.cyan('•')} installing playwright (devDependency) — needed only for screen recording\n`);
  const launch = launchSpec(npm, ['install', '-D', 'playwright', '--no-fund', '--no-audit']);
  const i = spawnSync(launch.command, launch.args, {
    cwd: projectDir,
    stdio: 'inherit',
    windowsHide: true,
    windowsVerbatimArguments: launch.windowsVerbatimArguments,
  });
  if (i.status !== 0) throw new UserError(`npm install -D playwright exited ${i.status ?? 'with an error'}`);
  const cli = path.join(projectDir, 'node_modules', 'playwright', 'cli.js');
  if (!fs.existsSync(cli)) throw new UserError('playwright did not install correctly (cli.js missing)');
  process.stderr.write(`${chalk.cyan('•')} downloading the Chromium browser (one-time, ~150 MB)\n`);
  const b = spawnSync(process.execPath, [cli, 'install', 'chromium'], {
    cwd: projectDir,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (b.status !== 0) throw new UserError(`playwright install chromium exited ${b.status ?? 'with an error'}`);
  process.stderr.write(`${chalk.green('✓')} screen-record browser ready\n`);
}

/**
 * The provisioners the `setup` command routes its flags to. Injectable so tests can assert flag
 * plumbing (which flag reaches which provisioner, with the resolved projectDir) without touching
 * the network/filesystem — mirrors how doctor/init keep their side effects behind a seam. [VT.2]
 */
export interface SetupDeps {
  ffmpeg: (projectDir: string) => Promise<void>;
  venv: (projectDir: string) => void;
  browser: (projectDir: string) => void;
}

const DEFAULT_SETUP_DEPS: SetupDeps = {
  ffmpeg: setupFfmpeg,
  venv: setupVenv,
  browser: setupBrowser,
};

export function registerSetupCommand(program: Command, deps: SetupDeps = DEFAULT_SETUP_DEPS): void {
  program
    .command('setup')
    .description('re-run individual provisioning steps')
    .option('--ffmpeg', 'provision FFmpeg into .vibe/bin')
    .option('--venv', 'create the Python venv for the audio/analysis engines')
    .option('--browser', 'install the Playwright browser for screen recording')
    .action(async (opts: { ffmpeg?: boolean; venv?: boolean; browser?: boolean }, cmd: Command) => {
      const globals = cmd.optsWithGlobals<{ project?: string }>();
      const projectDir = path.resolve(globals.project ?? process.cwd());
      if (!opts.ffmpeg && !opts.venv && !opts.browser) {
        throw new UserError('nothing to set up', 'Pass --ffmpeg, --venv, and/or --browser.');
      }
      if (opts.ffmpeg) await deps.ffmpeg(projectDir);
      if (opts.venv) deps.venv(projectDir);
      if (opts.browser) deps.browser(projectDir);
    });
}
