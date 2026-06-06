/**
 * Per-project chat transcript + agent-session persistence.
 *
 * The chat feed must survive refresh/close: every user message + every feed-relevant
 * AgentEvent is appended to projects/<p>/chat.jsonl (NDJSON, durable, git-trackable like the
 * manifest) and replayed on load. Session continuity lives in projects/<p>/agent.json
 * ({session_id}) → the adapter passes --resume on the next turn. Both are sidecar files in
 * the USER'S project — the package never holds state of its own.
 *
 * All functions take an explicit projectsRoot (the project's projects/ dir; tests point it
 * at a temp dir) — no module-global state.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentEvent } from './events.js';

export type ChatEntry =
  | { ts: string; t: 'user'; text: string }
  | { ts: string; t: 'event'; e: AgentEvent };

/** What appendChat takes (Omit<> would collapse the union's variant fields). */
export type ChatEntryInput = { t: 'user'; text: string } | { t: 'event'; e: AgentEvent };

function chatFile(projectsRoot: string, project: string): string {
  return path.join(projectsRoot, project, 'chat.jsonl');
}

/** Which AgentEvents are worth replaying (session/offline are transient, not history). */
export function shouldPersistEvent(e: AgentEvent): boolean {
  return e.type === 'text' || e.type === 'tool' || e.type === 'question' || e.type === 'done';
}

export function appendChat(projectsRoot: string, project: string, entry: ChatEntryInput): void {
  try {
    const p = chatFile(projectsRoot, project);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', 'utf8');
  } catch {
    /* a failed transcript write never breaks the chat */
  }
}

/** Read the newest `limit` transcript entries (corrupt lines skipped — NDJSON discipline). */
export function readChat(projectsRoot: string, project: string, limit = 500): ChatEntry[] {
  try {
    const p = chatFile(projectsRoot, project);
    if (!fs.existsSync(p)) return [];
    const lines = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean);
    const out: ChatEntry[] = [];
    for (const line of lines.slice(-limit)) {
      try {
        const j = JSON.parse(line) as ChatEntry;
        if (j && (j.t === 'user' || j.t === 'event')) out.push(j);
      } catch {
        /* skip corrupt line */
      }
    }
    return out;
  } catch {
    return [];
  }
}

// ── session continuity: a sidecar per project, survives server restarts ────────
function sessionFile(projectsRoot: string, project: string): string {
  return path.join(projectsRoot, project, 'agent.json');
}

export function readSessionId(projectsRoot: string, project: string): string | null {
  try {
    const j = JSON.parse(fs.readFileSync(sessionFile(projectsRoot, project), 'utf8')) as {
      session_id?: unknown;
    };
    return typeof j.session_id === 'string' ? j.session_id : null;
  } catch {
    return null;
  }
}

export function saveSessionId(projectsRoot: string, project: string, sessionId: string): void {
  try {
    const p = sessionFile(projectsRoot, project);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ session_id: sessionId }, null, 2) + '\n', 'utf8');
  } catch {
    /* non-fatal — multi-turn just falls back to a fresh session */
  }
}
