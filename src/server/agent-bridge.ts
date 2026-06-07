/**
 * src/server/agent-bridge.ts — the ONE entry point routes use to run an agent turn.
 *
 * Wraps AgentRunner selection (D2: vibe.config.json agent: auto|claude|codex) for the served
 * project. The adapter persists the transcript + session internally (socket-independent) and
 * serializes turns per project (busy → a polite text event), so callers only stream events.
 */
import { selectRunner } from '../agent/runner.js';
import type { TurnResult } from '../agent/runner-types.js';
import type { AgentEvent } from '../agent/events.js';
import { projectDir } from './context.js';

// ── Agent-feed watchers (VT.4 F18) ───────────────────────────────────────────
// A normal chat turn streams to the /ws/agent socket that SENT it. But turns started server-side
// (e.g. "Save as Template" distill via POST /api/templates/distill) have no initiating socket, so
// nothing reached the live feed — the "watch the agent feed" hint showed nothing until a reload.
// /ws/agent sockets announce the project they're viewing ({type:'watch', project}); HTTP-triggered
// turns call broadcastAgentEvent() to push their events to those watchers live. (Chat turns do NOT
// broadcast — they already reach their own socket — so the initiator never double-renders.)
const agentWatchers = new Map<string, Set<(e: AgentEvent) => void>>();

export function registerAgentWatcher(project: string, send: (e: AgentEvent) => void): void {
  let set = agentWatchers.get(project);
  if (!set) agentWatchers.set(project, (set = new Set()));
  set.add(send);
}

export function unregisterAgentWatcher(project: string, send: (e: AgentEvent) => void): void {
  agentWatchers.get(project)?.delete(send);
}

export function broadcastAgentEvent(project: string, e: AgentEvent): void {
  for (const send of agentWatchers.get(project) ?? []) {
    try {
      send(e);
    } catch {
      /* socket gone — close handler unregisters it */
    }
  }
}

export async function runAgentTurn(
  project: string,
  prompt: string,
  onEvent: (e: AgentEvent) => void,
): Promise<TurnResult> {
  const { runner } = await selectRunner(projectDir());
  if (!runner) {
    const reason =
      'no agent CLI found — install Claude Code (npm i -g @anthropic-ai/claude-code) or Codex CLI (npm i -g @openai/codex)';
    onEvent({ type: 'offline', reason });
    return { status: 'offline', result: '', reason };
  }
  return runner.runTurn({ projectDir: projectDir(), project, prompt, onEvent });
}
