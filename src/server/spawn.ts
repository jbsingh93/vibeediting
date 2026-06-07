/**
 * src/server/spawn.ts — THE single Windows-safe child-process helper for the UI server.
 *
 * Every child process goes through here. We spawn the PROJECT's local `tsx` CLI with the
 * current node binary (process.execPath) — never `npx tsx` (avoids .cmd shims + network),
 * never `shell:true` (avoids Windows quoting footguns). Argv is always an array.
 *
 *   spawn(process.execPath, [projectTsxCli, scriptAbs, ...args], { cwd: projectDir() })
 *
 * Unlike the parent (which served its own repo), the binaries here come from the USER
 * PROJECT's node_modules — the scaffold installs tsx + @remotion/cli (template package.json),
 * so the server works against any initialized project without the package shipping Remotion.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import open from 'open';
import { projectDir } from './context.js';

export interface CaptureResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Resolve the project's local tsx CLI entry. tsx ships an `exports` map, so we go via its
 * package.json `bin` field rather than guessing dist paths. Throws a friendly error when the
 * project hasn't run `npm install` yet.
 */
export function projectTsxCli(): string {
  const pkgJson = path.join(projectDir(), 'node_modules', 'tsx', 'package.json');
  if (!fs.existsSync(pkgJson)) {
    throw new Error(
      `tsx is not installed in this project (${projectDir()}) — run \`npm install\` there first`,
    );
  }
  const bin = (JSON.parse(fs.readFileSync(pkgJson, 'utf8')) as { bin?: string | Record<string, string> }).bin;
  const rel = typeof bin === 'string' ? bin : (bin?.tsx ?? 'dist/cli.mjs');
  return path.join(path.dirname(pkgJson), rel);
}

/** Resolve the project's Remotion CLI entry (node_modules/@remotion/cli, via its bin field). */
export function projectRemotionCli(): string {
  const pkgJson = path.join(projectDir(), 'node_modules', '@remotion', 'cli', 'package.json');
  if (!fs.existsSync(pkgJson)) {
    throw new Error(
      `@remotion/cli is not installed in this project (${projectDir()}) — run \`npm install\` there first`,
    );
  }
  const bin = (JSON.parse(fs.readFileSync(pkgJson, 'utf8')) as { bin?: string | Record<string, string> }).bin;
  const rel = typeof bin === 'string' ? bin : (bin?.remotion ?? 'remotion-cli.js');
  return path.join(path.dirname(pkgJson), rel);
}

/** The capability python venv (cross-platform layout). download-media.py runs under THIS. */
export function venvPython(): string {
  const base = path.join(projectDir(), 'capabilities', '.venv');
  return process.platform === 'win32'
    ? path.join(base, 'Scripts', 'python.exe')
    : path.join(base, 'bin', 'python');
}

/** Spawn a project `.py` capability under the capability venv. Throws if not bootstrapped. */
export function spawnVenvPy(scriptPath: string, args: string[] = []): ChildProcessWithoutNullStreams {
  const py = venvPython();
  if (!fs.existsSync(py)) {
    throw new Error(`python venv missing at ${py} — run \`vibe setup --venv\``);
  }
  const abs = path.isAbsolute(scriptPath) ? scriptPath : path.join(projectDir(), scriptPath);
  return spawn(py, [abs, ...args], {
    cwd: projectDir(),
    env: process.env,
    windowsHide: true,
  }) as ChildProcessWithoutNullStreams;
}

/** Spawn a plain `.mjs`/`.js` project script under the current node binary. */
export function spawnNode(scriptPath: string, args: string[] = []): ChildProcessWithoutNullStreams {
  const abs = path.isAbsolute(scriptPath) ? scriptPath : path.join(projectDir(), scriptPath);
  return spawn(process.execPath, [abs, ...args], {
    cwd: projectDir(),
    env: process.env,
    windowsHide: true,
  }) as ChildProcessWithoutNullStreams;
}

/**
 * Spawn a project `.ts` script under the project's tsx and stream it. Returns the live child
 * so callers can attach stdout/stderr line handlers (jobs.ts). `scriptPath` may be absolute
 * or relative to the project dir.
 */
export function spawnTsx(scriptPath: string, args: string[] = []): ChildProcessWithoutNullStreams {
  const abs = path.isAbsolute(scriptPath) ? scriptPath : path.join(projectDir(), scriptPath);
  return spawn(process.execPath, [projectTsxCli(), abs, ...args], {
    cwd: projectDir(),
    env: process.env,
    windowsHide: true,
  }) as ChildProcessWithoutNullStreams;
}

/** Run a project `.ts` script to completion and capture all output. Never throws on non-zero exit. */
export function captureTsx(scriptPath: string, args: string[] = []): Promise<CaptureResult> {
  return new Promise((resolve) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnTsx(scriptPath, args);
    } catch (e) {
      resolve({ code: -1, stdout: '', stderr: String(e) });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (e) => resolve({ code: -1, stdout, stderr: stderr + String(e) }));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

/** Open the given URL in the user's default browser (best-effort; the URL is printed anyway). */
export function openBrowser(url: string): void {
  void open(url).catch(() => {
    /* non-fatal */
  });
}
