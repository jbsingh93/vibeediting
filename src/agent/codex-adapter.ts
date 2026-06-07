/**
 * CodexAdapter — the second brain (D2), mapped onto the SAME AgentEvent union as Claude.
 *
 * Verified against codex-cli 0.137.0 (R1 spike, 2026-06-06 — see DEV-DOCS/notes/R1-codex.md):
 *
 *   codex exec --json --skip-git-repo-check -s workspace-write [PROMPT]
 *   codex exec resume <thread_id> --json … [PROMPT]        ← multi-turn continuity
 *
 * JSONL events (one per line on stdout):
 *   thread.started {thread_id}                              → session
 *   turn.started
 *   item.started/.completed {item:{type:'agent_message'|'command_execution'|'file_change'|…}}
 *     agent_message {text}        → text (whole blocks — codex does not stream deltas)
 *     command_execution {command, aggregated_output, exit_code, status} → tool start/ok/error
 *     file_change {changes:[{path,kind}], status}           → tool ✎ start/ok
 *   turn.completed {usage{…}}                               → done (no USD cost — subscription)
 *   turn.failed {error}                                     → done(error) / offline
 *
 * Hard-won spike findings encoded here:
 *   - stdin MUST be closed when the prompt is argv — codex waits forever on an open piped
 *     stdin (it would append it as a <stdin> block). We always close (or write+close) stdin.
 *   - Codex has NO skills / --agent persona / PreToolUse hooks / AskUserQuestion. Project
 *     rules ride in AGENTS.md (auto-read, verified followed); safety = the codex sandbox
 *     (workspace-write), not our firewall hook. Honest delta documented for users.
 *   - No per-turn USD cost in events (subscription) — done.costUsd stays undefined.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import { captureCommand, findOnPath, launchSpec, resolveCmdShimToExe } from '../core/proc.js';
import { classifyTool, type AgentEvent } from './events.js';
import { appendChat, readSessionId, saveSessionId, shouldPersistEvent } from './chat.js';
import { cockpitReminder, readCockpitState } from './cockpit.js';
import { projectsRoot } from './claude-adapter.js';
import type { AgentDetection, AgentRunner, AgentTurnOptions, TurnResult } from './runner-types.js';

/** Resolve the `codex` executable. VIBE_CODEX_BIN (tests/override) → PATH (shim-hardened). */
export function resolveCodexBin(): string | null {
  const override = process.env.VIBE_CODEX_BIN;
  if (override) return fs.existsSync(override) ? override : null;
  const found = findOnPath(['codex']);
  if (!found) return null;
  if (found.toLowerCase().endsWith('.cmd')) {
    const exe = resolveCmdShimToExe(found);
    if (exe) return exe;
  }
  return found;
}

interface CodexItem {
  id?: string;
  type?: string;
  text?: string;
  command?: string;
  aggregated_output?: string;
  exit_code?: number | null;
  status?: string;
  changes?: Array<{ path?: string; kind?: string }>;
}

type CodexLine = Record<string, unknown> & { type?: string; thread_id?: string; item?: CodexItem };

/** Translate one parsed codex JSONL event into zero or more AgentEvents. Pure. */
export function eventsFromCodexLine(evt: CodexLine, lastText: { value: string }): AgentEvent[] {
  const out: AgentEvent[] = [];
  switch (evt.type) {
    case 'thread.started': {
      if (typeof evt.thread_id === 'string') out.push({ type: 'session', sessionId: evt.thread_id });
      break;
    }
    case 'item.started':
    case 'item.completed': {
      const item = evt.item;
      if (!item || typeof item !== 'object') break;
      const started = evt.type === 'item.started';
      const id = String(item.id ?? '');
      if (item.type === 'agent_message' && !started) {
        if (typeof item.text === 'string' && item.text) {
          lastText.value = item.text;
          out.push({ type: 'text', delta: item.text });
        }
      } else if (item.type === 'command_execution') {
        // Reuse the Bash classifier so capability CLIs get the same glyphs as Claude turns.
        const cls = classifyTool('Bash', { command: item.command ?? '' });
        out.push({
          type: 'tool',
          id,
          name: 'Bash',
          status: started ? 'start' : item.exit_code === 0 ? 'ok' : 'error',
          detail: cls.detail,
          capability: cls.capability,
          glyph: cls.glyph,
        });
      } else if (item.type === 'file_change') {
        // Separator-agnostic basename: codex emits OS-native paths (backslashes on Windows),
        // and node's path.basename only splits the CURRENT platform's separator.
        const files = (item.changes ?? [])
          .map((c) => (typeof c.path === 'string' ? (c.path.split(/[\\/]/).pop() ?? '') : ''))
          .filter(Boolean)
          .slice(0, 3)
          .join(', ');
        out.push({
          type: 'tool',
          id,
          name: 'Edit',
          status: started ? 'start' : 'ok',
          detail: files || 'file change',
          glyph: '✎',
        });
      } else if (item.type === 'error' && !started) {
        out.push({ type: 'text', delta: `(codex error: ${item.text ?? 'unknown'})` });
      }
      break;
    }
    case 'turn.completed': {
      out.push({ type: 'done', result: lastText.value });
      break;
    }
    case 'turn.failed': {
      const err = (evt as { error?: { message?: string } }).error?.message ?? 'turn failed';
      out.push({ type: 'done', result: `(codex error: ${err})` });
      break;
    }
  }
  return out;
}

const inflight = new Map<string, ChildProcess>();

/** True while a codex turn is running for this project. */
export function isCodexBusy(project: string): boolean {
  return inflight.has(project);
}

/** Kill the in-flight codex turn for a project (Stop button). Safe if none is running. */
export function cancelCodexTurn(project: string): void {
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

/** Run one codex turn — same contract as runClaudeTurn (never throws; offline on failure). */
export function runCodexTurn(opts: AgentTurnOptions): Promise<TurnResult> {
  const { projectDir, project, onEvent } = opts;
  let prompt = opts.prompt;
  const root = projectsRoot(projectDir);

  if (inflight.has(project)) {
    onEvent({ type: 'text', delta: '(still working on the previous message — one turn at a time)' });
    return Promise.resolve({ status: 'busy', result: '' });
  }

  const bin = resolveCodexBin();
  if (!bin) {
    const reason = 'codex CLI not found — install with `npm install -g @openai/codex` and run `codex login`';
    onEvent({ type: 'offline', reason });
    return Promise.resolve({ status: 'offline', result: '', reason });
  }

  // Same mechanical cockpit contract as the Claude adapter (adapter-independent discipline).
  const state = readCockpitState(root, project);
  const reminder = state ? cockpitReminder(project, state) : null;
  if (reminder) prompt = `${reminder}\n\n${prompt}`;

  const sessionId = opts.resume ?? readSessionId(root, project, 'codex');

  // Prompt always rides stdin (`codex exec -` reads it) — immune to argv limits/newlines,
  // and stdin ALWAYS gets closed (the spike's hang finding). Note: `exec resume` does not
  // accept `-s` (verified 0.137.0) — the sandbox rides a `-c sandbox_mode=…` override there.
  const args = [
    'exec',
    ...(sessionId ? ['resume', sessionId] : []),
    '--json',
    '--skip-git-repo-check',
    ...(sessionId ? ['-c', 'sandbox_mode="workspace-write"'] : ['-s', 'workspace-write']),
    '-',
  ];

  appendChat(root, project, { t: 'user', text: opts.prompt });

  return new Promise<TurnResult>((resolve) => {
    let child: ChildProcess;
    try {
      const launch = launchSpec(bin, args);
      child = spawn(launch.command, launch.args, {
        cwd: projectDir,
        windowsHide: true,
        windowsVerbatimArguments: launch.windowsVerbatimArguments,
        env: { ...process.env, VIBE_PROJECT: project },
      });
    } catch {
      const reason = 'codex CLI could not be spawned — run `codex login`';
      onEvent({ type: 'offline', reason });
      resolve({ status: 'offline', result: '', reason });
      return;
    }
    inflight.set(project, child);
    if (child.stdin) {
      child.stdin.on('error', () => {
        /* swallow EPIPE */
      });
      child.stdin.write(prompt);
      child.stdin.end();
    }

    const lastText = { value: '' };
    let buf = '';
    let lastSession: string | null = null;
    let errored = false;
    let done: Extract<AgentEvent, { type: 'done' }> | null = null;

    const forward = (e: AgentEvent): void => {
      if (e.type === 'session') {
        lastSession = e.sessionId;
        saveSessionId(root, project, e.sessionId, 'codex');
      }
      if (e.type === 'done') done = e;
      if (shouldPersistEvent(e)) appendChat(root, project, { t: 'event', e });
      onEvent(e);
    };

    const handleLine = (line: string): void => {
      const t = line.trim();
      if (!t.startsWith('{')) return;
      try {
        const evt = JSON.parse(t) as CodexLine;
        for (const e of eventsFromCodexLine(evt, lastText)) forward(e);
      } catch {
        /* ignore malformed lines */
      }
    };

    child.stdout?.on('data', (d: Buffer) => {
      buf += d.toString();
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        handleLine(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    });

    child.on('error', () => {
      errored = true;
      onEvent({ type: 'offline', reason: 'codex CLI not found — run `codex login`' });
    });

    child.on('close', () => {
      inflight.delete(project);
      if (buf.trim()) handleLine(buf);
      if (errored) {
        resolve({ status: 'offline', result: '', reason: 'codex CLI not found' });
        return;
      }
      if (!done) {
        forward({ type: 'done', result: lastText.value });
        resolve({ status: 'done', result: lastText.value, sessionId: lastSession ?? undefined });
        return;
      }
      const d = done as Extract<AgentEvent, { type: 'done' }>;
      resolve({ status: 'done', result: d.result, sessionId: lastSession ?? undefined });
    });
  });
}

/** Detect the codex CLI (`--version`, 5s cap). Never throws. */
export async function detectCodex(): Promise<AgentDetection> {
  const bin = resolveCodexBin();
  if (!bin) {
    return { id: 'codex', found: false, error: 'not found — install with: npm install -g @openai/codex' };
  }
  const r = await captureCommand(bin, ['--version'], { timeoutMs: 5_000 });
  if (r.exitCode !== 0) {
    return { id: 'codex', found: false, path: bin, error: `\`--version\` exited ${r.exitCode}` };
  }
  const version = r.stdout.match(/(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/)?.[1];
  return { id: 'codex', found: true, path: bin, version };
}

export const codexRunner: AgentRunner = {
  id: 'codex',
  detect: detectCodex,
  runTurn: runCodexTurn,
};
