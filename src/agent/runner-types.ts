/**
 * The AgentRunner abstraction (D2): one interface, two brains.
 * Claude Code is first-class; Codex CLI is supported via an adapter mapped onto the SAME
 * AgentEvent union so the UI and CLI are adapter-agnostic.
 *
 * (Types live in their own module so adapters and the selector can import without cycles.)
 */
import type { AgentEvent } from './events.js';

export type AgentId = 'claude' | 'codex';

export interface AgentDetection {
  id: AgentId;
  found: boolean;
  path?: string;
  version?: string;
  error?: string;
}

export interface AgentTurnOptions {
  /** The vibe project root (cwd of the spawn — the agent inherits CLAUDE.md / AGENTS.md there). */
  projectDir: string;
  /** The video-project id under projects/. */
  project: string;
  prompt: string;
  /** Explicit session to resume; default = the persisted projects/<p>/agent.json session. */
  resume?: string;
  onEvent: (e: AgentEvent) => void;
}

export interface TurnResult {
  status: 'done' | 'offline' | 'busy';
  result: string;
  costUsd?: number;
  numTurns?: number;
  sessionId?: string;
  reason?: string;
}

export interface AgentRunner {
  id: AgentId;
  detect(): Promise<AgentDetection>;
  runTurn(opts: AgentTurnOptions): Promise<TurnResult>;
}
