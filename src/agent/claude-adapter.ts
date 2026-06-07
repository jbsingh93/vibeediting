/**
 * ClaudeAdapter — the first-class agent bridge (D2): the user's own Claude Code CLI,
 * spawned headless in the project folder.
 *
 * Why the CLI and not an SDK/API: zero marginal token cost (the user's subscription pays),
 * and the CLI auto-loads the project's CLAUDE.md + skills + settings — which is exactly how
 * the whole video-editor skill system works. The adapter:
 *
 *   claude -p [prompt] --output-format stream-json --verbose
 *          [--agent vibe-studio]              ← only when the persona file exists (seeded at init)
 *          --permission-mode acceptEdits
 *          --allowedTools "Read,Grep,Glob,Edit,Write,Bash,Task,WebFetch,WebSearch"
 *          [--settings .vibe/agent-settings.json]  ← PreToolUse capability firewall, when seeded
 *          [--resume <session_id>]            ← from projects/<p>/agent.json
 *
 * Windows hardening (battle-tested): `.cmd` npm shims resolve to their real `.exe`
 * (Node ≥ 20.12 EINVAL, CVE-2024-27980); prompts that are long (>8k chars, Windows argv
 * limit) or multi-line (cmd.exe truncates argv at `\n`) or headed for a `.cmd` wrapper go
 * via STDIN — `claude -p` with no positional arg reads the prompt from stdin.
 *
 * Test seam: VIBE_AGENT_BIN points resolution at a mock (a `.mjs` file runs under the
 * current node binary) — the real subscription CLI is never spawned in CI.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { captureCommand, launchSpec, resolveCmdShimToExe } from '../core/proc.js';
import {
  eventsFromLine,
  parseAgentLine,
  type AgentEvent,
  type PendingToolMap,
} from './events.js';
import { appendChat, readSessionId, saveSessionId, shouldPersistEvent } from './chat.js';
import { cockpitReminder, readCockpitState } from './cockpit.js';
import type {
  AgentDetection,
  AgentRunner,
  AgentTurnOptions,
  TurnResult,
} from './runner-types.js';

/**
 * Coarse spawn-time allowlist. The FINE gate is the PreToolUse hook (seeded into the user's
 * project as .vibe/hooks/pretooluse-capability-firewall.mjs) which denies generic/destructive
 * shell-exec. This list stays broad enough for the agent to do real work (run capability
 * CLIs via Bash, edit timelines/captions, advance the manifest).
 */
export const AGENT_ALLOWED_TOOLS = 'Read,Grep,Glob,Edit,Write,Bash,Task,WebFetch,WebSearch';

/** The cockpit persona seeded into user projects at init (V3). Only passed when present. */
export const AGENT_PERSONA = 'vibe-studio';

const LONG_PROMPT = 8000; // Windows argv limit safety

/**
 * Resolve the `claude` executable. Order: VIBE_AGENT_BIN (tests/override) →
 * ~/.local/bin/claude(.exe) (the native installer location) → PATH
 * (claude.exe / claude.cmd / claude). Returns null when nothing usable is found (→ offline).
 * A `.cmd` shim resolves to a sibling or shim-referenced `.exe` when possible.
 */
export function resolveClaudeBin(): string | null {
  const override = process.env.VIBE_AGENT_BIN;
  if (override) return fs.existsSync(override) ? override : null;

  const local = path.join(
    os.homedir(),
    '.local',
    'bin',
    process.platform === 'win32' ? 'claude.exe' : 'claude',
  );
  if (fs.existsSync(local)) return local;

  const pathDirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const names = process.platform === 'win32' ? ['claude.exe', 'claude.cmd', 'claude'] : ['claude'];
  for (const dir of pathDirs) {
    for (const n of names) {
      const candidate = path.join(dir, n);
      if (fs.existsSync(candidate)) {
        if (candidate.toLowerCase().endsWith('.cmd')) {
          const sibling = candidate.slice(0, -4) + '.exe';
          if (fs.existsSync(sibling)) return sibling;
          const fromShim = resolveCmdShimToExe(candidate);
          if (fromShim) return fromShim;
        }
        return candidate;
      }
    }
  }
  return null;
}

/** Spawn the resolved claude (or a mock — see launchSpec). The video-project id rides in the
 *  env (VIBE_PROJECT): the real CLI ignores it; the test mock uses it to touch the right
 *  manifest. */
function spawnClaude(bin: string, args: string[], cwd: string, project: string): ChildProcess {
  const env = { ...process.env, VIBE_PROJECT: project };
  const launch = launchSpec(bin, args);
  return spawn(launch.command, launch.args, {
    cwd,
    windowsHide: true,
    windowsVerbatimArguments: launch.windowsVerbatimArguments,
    env,
  });
}

// ── the per-project process registry ────────────────────────────────────────────
const inflight = new Map<string, ChildProcess>();

/** True while a turn is running for this project (the UI serializes a project's turns). */
export function isBusy(project: string): boolean {
  return inflight.has(project);
}

/** Kill the in-flight turn for a project (Stop button). Safe if none is running. */
export function cancelTurn(project: string): void {
  const child = inflight.get(project);
  if (!child) return;
  try {
    if (process.platform === 'win32' && child.pid)
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    else child.kill('SIGTERM');
  } catch {
    /* best-effort */
  }
}

/** The projects/ root inside a vibe project dir (env override is the test seam). */
export function projectsRoot(projectDir: string): string {
  return process.env.VIBE_PROJECTS_DIR ?? path.join(projectDir, 'projects');
}

/**
 * Run one agent turn, streaming AgentEvents through onEvent and persisting the transcript.
 * Resolves when the process closes. NEVER throws — failures arrive as `offline` events and
 * in the TurnResult.
 */
export function runClaudeTurn(opts: AgentTurnOptions): Promise<TurnResult> {
  const { projectDir, project, onEvent } = opts;
  let prompt = opts.prompt;
  const root = projectsRoot(projectDir);

  if (inflight.has(project)) {
    onEvent({ type: 'text', delta: '(still working on the previous message — one turn at a time)' });
    return Promise.resolve({ status: 'busy', result: '' });
  }

  const bin = resolveClaudeBin();
  if (!bin) {
    const reason = 'claude CLI not found — install Claude Code and run `claude login`';
    onEvent({ type: 'offline', reason });
    return Promise.resolve({ status: 'offline', result: '', reason });
  }

  // Enforce the agent-mode cockpit contract mechanically (see cockpit.ts).
  const state = readCockpitState(root, project);
  const reminder = state ? cockpitReminder(project, state) : null;
  if (reminder) prompt = `${reminder}\n\n${prompt}`;

  const sessionId = opts.resume ?? readSessionId(root, project, 'claude');

  // Only pass --agent / --settings when the seeded files actually exist (a bare folder —
  // pre-init, or the GATE V1 smoke — must still produce a valid turn).
  const personaFile = path.join(projectDir, '.claude', 'agents', `${AGENT_PERSONA}.md`);
  const settingsFile = path.join(projectDir, '.vibe', 'agent-settings.json');

  // stdin when long (argv limit), multi-line (cmd.exe truncates at \n), or .cmd-wrapped.
  const useStdin =
    prompt.length > LONG_PROMPT || prompt.includes('\n') || /\.(cmd|bat)$/i.test(bin);

  // The prompt must come IMMEDIATELY after -p (verified claude 2.1.167: a trailing
  // positional after other flags is rejected with "Input must be provided…").
  const args = [
    '-p',
    ...(useStdin ? [] : [prompt]),
    '--output-format',
    'stream-json',
    '--verbose',
    ...(fs.existsSync(personaFile) ? ['--agent', AGENT_PERSONA] : []),
    '--permission-mode',
    'acceptEdits',
    '--allowedTools',
    AGENT_ALLOWED_TOOLS,
    ...(fs.existsSync(settingsFile) ? ['--settings', settingsFile] : []),
    ...(sessionId ? ['--resume', sessionId] : []),
  ];

  appendChat(root, project, { t: 'user', text: opts.prompt });

  return new Promise<TurnResult>((resolve) => {
    let child: ChildProcess;
    try {
      child = spawnClaude(bin, args, projectDir, project);
    } catch {
      const reason = 'claude CLI could not be spawned — run `claude login`';
      onEvent({ type: 'offline', reason });
      resolve({ status: 'offline', result: '', reason });
      return;
    }
    inflight.set(project, child);
    // stdin is ALWAYS closed: written+closed on the long/multi-line path, closed empty
    // otherwise (an open stdin makes the CLI wait — same hang class as the codex spike).
    if (child.stdin) {
      child.stdin.on('error', () => {
        /* swallow EPIPE */
      });
      if (useStdin) child.stdin.write(prompt);
      child.stdin.end();
    }

    const pending: PendingToolMap = new Map();
    let buf = '';
    let lastSession: string | null = null;
    let errored = false;
    let done: Extract<AgentEvent, { type: 'done' }> | null = null;

    const forward = (e: AgentEvent): void => {
      if (e.type === 'session') {
        lastSession = e.sessionId;
        saveSessionId(root, project, e.sessionId, 'claude');
      }
      if (e.type === 'done') done = e;
      if (shouldPersistEvent(e)) appendChat(root, project, { t: 'event', e });
      onEvent(e);
    };

    child.stdout?.on('data', (d: Buffer) => {
      buf += d.toString();
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        const evt = parseAgentLine(line);
        if (!evt) continue;
        for (const e of eventsFromLine(evt, pending)) forward(e);
      }
    });

    child.on('error', () => {
      errored = true;
      onEvent({ type: 'offline', reason: 'claude CLI not found — run `claude login`' });
    });

    child.on('close', () => {
      inflight.delete(project);
      // flush a trailing partial line if it parses
      const evt = parseAgentLine(buf);
      if (evt) for (const e of eventsFromLine(evt, pending)) forward(e);
      if (lastSession) saveSessionId(root, project, lastSession, 'claude');
      if (errored) {
        resolve({ status: 'offline', result: '', reason: 'claude CLI not found' });
        return;
      }
      // fallback close (process died without a `result` event) — don't double-emit done
      if (!done) {
        forward({ type: 'done', result: '' });
        resolve({ status: 'done', result: '', sessionId: lastSession ?? undefined });
        return;
      }
      const d = done as Extract<AgentEvent, { type: 'done' }>;
      resolve({
        status: 'done',
        result: d.result,
        costUsd: d.costUsd,
        numTurns: d.numTurns,
        sessionId: lastSession ?? undefined,
      });
    });
  });
}

/** Detect the claude CLI (resolution chain + `--version`, 5s cap). Never throws. */
export async function detectClaude(): Promise<AgentDetection> {
  const bin = resolveClaudeBin();
  if (!bin) {
    return {
      id: 'claude',
      found: false,
      error: 'not found — install with: npm install -g @anthropic-ai/claude-code',
    };
  }
  const r = await captureCommand(bin, ['--version'], { timeoutMs: 5_000 });
  if (r.exitCode !== 0) {
    return { id: 'claude', found: false, path: bin, error: `\`--version\` exited ${r.exitCode}` };
  }
  const version = r.stdout.match(/(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/)?.[1];
  return { id: 'claude', found: true, path: bin, version };
}

export const claudeRunner: AgentRunner = {
  id: 'claude',
  detect: detectClaude,
  runTurn: runClaudeTurn,
};
