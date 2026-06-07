/**
 * `vibe run <capability> [args…]` — thin passthrough to the project's capability CLIs:
 * `tsx capabilities/<capability>.ts args…` with the project `.env` loaded. Convenience +
 * the documented entry point for skills (direct `tsx capabilities/...` paths work too).
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import { UserError } from '../core/errors.js';

/** Minimal .env parser — KEY=VALUE lines, quotes stripped, no expansion. Never overrides real env. */
export function loadEnvFile(projectDir: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...base };
  const file = path.join(projectDir, '.env');
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return env;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1]!;
    let value = m[2]!;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (env[key] === undefined || env[key] === '') env[key] = value;
  }
  return env;
}

/** Resolve `<capability>` to a script path inside capabilities/ (with or without .ts/.py). */
export function resolveCapabilityScript(projectDir: string, capability: string): string {
  const clean = capability.replace(/\\/g, '/').replace(/^capabilities\//, '');
  if (clean.includes('..')) throw new UserError('invalid capability path', 'Use a path like ingest/probe or deliver/render-preset.');
  const base = path.join(projectDir, 'capabilities', ...clean.split('/'));
  for (const candidate of [base, `${base}.ts`, `${base}.py`]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new UserError(
    `capability not found: ${capability}`,
    'Check CAPABILITIES.md for the index — e.g. `vibe run ingest/probe -- --in clip.mp4`.',
  );
}

export function registerRunCommand(program: Command): void {
  program
    .command('run <capability> [args...]')
    .description('run a capability script in the current project (passthrough to tsx capabilities/...)')
    .allowUnknownOption(true)
    .helpOption(false)
    // Commander signature for `<capability> [args...]`: (capability, args, options, command) —
    // the Command object is the FOURTH parameter (live-found in the V3 tarball smoke).
    .action(async (capability: string, _args: string[], _opts: Record<string, unknown>, cmd: Command) => {
      const globals = cmd.optsWithGlobals<{ project?: string }>();
      const projectDir = path.resolve(globals.project ?? process.cwd());
      if (!fs.existsSync(path.join(projectDir, 'capabilities'))) {
        throw new UserError(
          'no capabilities/ folder here — is this a vibe project?',
          'Run from the project root, or pass --project <dir>.',
        );
      }
      const script = resolveCapabilityScript(projectDir, capability);
      // Everything after the capability operand passes through verbatim (incl. flags like --in).
      const passthrough = cmd.args.slice(1).filter((a) => a !== '--');
      const env = loadEnvFile(projectDir);

      let bin: string;
      let argv: string[];
      if (script.endsWith('.py')) {
        // Python capabilities run under the project venv when present (contract.ts VENV_PY convention).
        const venvPy =
          process.platform === 'win32'
            ? path.join(projectDir, 'capabilities', '.venv', 'Scripts', 'python.exe')
            : path.join(projectDir, 'capabilities', '.venv', 'bin', 'python');
        if (!fs.existsSync(venvPy)) {
          throw new UserError(
            'this capability needs the Python toolkit, which is not set up',
            'Run `vibe setup --venv` first (optional engines: mastering, beat/VAD, yt-dlp).',
          );
        }
        bin = venvPy;
        argv = [script, ...passthrough];
      } else {
        const tsxCli = path.join(projectDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
        if (!fs.existsSync(tsxCli)) {
          throw new UserError(
            'the project has no local tsx (node_modules missing?)',
            'Run `npm install` inside the project first.',
          );
        }
        bin = process.execPath;
        argv = [tsxCli, script, ...passthrough];
      }

      const code = await new Promise<number>((resolve) => {
        const child = spawn(bin, argv, { cwd: projectDir, stdio: 'inherit', env, windowsHide: true });
        child.on('error', () => resolve(-1));
        child.on('close', (c) => resolve(c ?? 1));
      });
      process.exitCode = code === -1 ? 1 : code;
    });
}
