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
import { provisionFfmpeg } from '../init/ffmpeg-provision.js';
import { notImplemented } from './_stub.js';

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

export function registerSetupCommand(program: Command): void {
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
      if (opts.ffmpeg) await setupFfmpeg(projectDir);
      if (opts.venv) setupVenv(projectDir);
      if (opts.browser) notImplemented('setup --browser', 'V3', 'the Playwright browser provisioner');
    });
}
