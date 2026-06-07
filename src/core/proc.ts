/**
 * Windows-safe child-process helpers shared by the agent adapters and doctor.
 *
 * The hard-won knowledge collected here (battle-tested in production CLIs):
 *  - npm installs CLI tools as `.cmd` shims on Windows; Node ≥ 20.12 throws EINVAL when
 *    spawning those directly (CVE-2024-27980). We peek inside the shim and spawn the real
 *    `.exe` it points at; only when shim parsing fails do we fall back to a `cmd.exe /d /s /c`
 *    wrapper with manual quoting.
 *  - cmd.exe truncates multi-line argv at the first `\n` — so anything that may carry a
 *    multi-line payload must go via stdin, never argv (see the agent adapters).
 *  - PATH lookup honors PATHEXT so `claude`, `codex`, `ffmpeg` resolve the same way the
 *    user's shell resolves them.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, resolve as resolvePath } from 'node:path';

/** Scan PATH for the first existing file matching `name` (+ Windows PATHEXT). */
export function findOnPath(names: string[]): string | null {
  const pathEnv = process.env.PATH ?? process.env.Path ?? '';
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD;.PS1').split(';').filter(Boolean)
      : [''];
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      // Exact-name check: on Windows only when the name already carries an extension —
      // npm drops an EXTENSIONLESS bash shim next to the .cmd one, and matching it would
      // hand back a file Windows cannot spawn (the codex/claude shim trio footgun).
      if (process.platform !== 'win32' || /\.[a-z0-9]+$/i.test(name)) {
        const exact = join(dir, name);
        try {
          if (statSync(exact).isFile()) return exact;
        } catch {
          /* keep scanning */
        }
      }
      if (process.platform !== 'win32') continue;
      for (const ext of exts) {
        const candidate = join(dir, name + ext.toLowerCase());
        try {
          if (statSync(candidate).isFile()) return candidate;
        } catch {
          /* keep scanning */
        }
      }
    }
  }
  return null;
}

/**
 * Peek inside an npm-style `.cmd` shim and extract the underlying `.exe` path so we can
 * spawn it directly (binary-safe argv, no cmd.exe newline truncation). Returns undefined
 * when the shim doesn't match a recognised pattern — caller falls back to the cmd wrapper.
 */
export function resolveCmdShimToExe(cmdPath: string): string | undefined {
  let body: string;
  try {
    body = readFileSync(cmdPath, 'utf8');
  } catch {
    return undefined;
  }
  const dp0 = dirname(cmdPath);
  const lines = body.split(/\r?\n/);
  // Walk bottom-up — the actual call is near the end of npm shims.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line || line.startsWith(':') || line.startsWith('REM ') || line.startsWith('@')) continue;
    const m = line.match(/"([^"]+\.(?:exe|cmd|bat))"/i);
    if (!m) continue;
    const candidate = m[1]!.replace(/%~dp0/gi, dp0 + '\\').replace(/%dp0%/gi, dp0 + '\\');
    const abs = isAbsolute(candidate) ? resolvePath(candidate) : resolvePath(dp0, candidate);
    if (existsSync(abs) && /\.exe$/i.test(abs)) return abs;
  }
  return undefined;
}

/** Quote one argument for cmd.exe (used with windowsVerbatimArguments: true). */
function quoteForCmd(s: string): string {
  if (s === '') return '""';
  if (!/[\s"&|<>^()%!`]/.test(s)) return s;
  let escaped = s.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1');
  escaped = escaped.replace(/%/g, '"^%"');
  escaped = escaped.replace(/([&|<>^!])/g, '^$1');
  return `"${escaped}"`;
}

export interface LaunchSpec {
  command: string;
  args: string[];
  windowsVerbatimArguments: boolean;
}

/**
 * Decide HOW to launch a resolved binary:
 *  - `.js/.mjs/.cjs` targets run under the current node binary (lets a tiny Node mock stand
 *    in for the real CLI via the VIBE_AGENT_BIN test seam).
 *  - `.cmd/.bat` shims resolve to their `.exe` when possible; else `cmd.exe /d /s /c` wrapper.
 *  - everything else spawns directly with plain argv.
 */
export function launchSpec(bin: string, args: string[]): LaunchSpec {
  if (/\.(c|m)?js$/i.test(bin)) {
    return { command: process.execPath, args: [bin, ...args], windowsVerbatimArguments: false };
  }
  let resolved = bin;
  if (process.platform === 'win32' && /\.cmd$/i.test(resolved)) {
    const exe = resolveCmdShimToExe(resolved);
    if (exe) resolved = exe;
  }
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolved)) {
    const commandLine = [resolved, ...args].map(quoteForCmd).join(' ');
    return {
      command: process.env.ComSpec || 'cmd.exe',
      // The OUTER quotes around the whole line are load-bearing: `cmd /s /c` strips the
      // first and last quote character of the line, so without them a quoted spaced path
      // ("C:\Program Files\nodejs\npm.cmd" …) degrades to `C:\Program …` and breaks.
      // (Found live at V3 — the first .cmd that doesn't resolve to a sibling .exe.)
      args: ['/d', '/s', '/c', `"${commandLine}"`],
      windowsVerbatimArguments: true,
    };
  }
  return { command: resolved, args, windowsVerbatimArguments: false };
}

export interface CaptureOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  /** Written to stdin then closed (the >8k / multi-line prompt path). */
  stdinData?: string;
}

export interface CaptureResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
}

/** Run a binary to completion, capturing output. Resolves with exitCode -1 on spawn error. */
export function captureCommand(bin: string, args: string[], opts: CaptureOptions = {}): Promise<CaptureResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const launch = launchSpec(bin, args);
    let child;
    try {
      child = spawn(launch.command, launch.args, {
        cwd: opts.cwd ?? process.cwd(),
        env: opts.env ? { ...process.env, ...opts.env } : process.env,
        windowsHide: true,
        windowsVerbatimArguments: launch.windowsVerbatimArguments,
        stdio: [opts.stdinData !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      resolve({ stdout: '', stderr: String(e), exitCode: -1, durationMs: 0, timedOut: false });
      return;
    }

    if (opts.stdinData !== undefined && child.stdin) {
      child.stdin.on('error', () => {
        /* swallow EPIPE / write-after-end */
      });
      child.stdin.write(opts.stdinData);
      child.stdin.end();
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          try {
            child.kill('SIGKILL');
          } catch {
            /* already gone */
          }
        }, opts.timeoutMs)
      : null;

    child.stdout?.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString('utf8')));
    child.on('error', (e) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr: stderr + String(e), exitCode: -1, durationMs: Date.now() - start, timedOut });
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? -1, durationMs: Date.now() - start, timedOut });
    });
  });
}
