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
