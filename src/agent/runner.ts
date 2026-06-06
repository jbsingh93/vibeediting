/**
 * AgentRunner selection (D2): `vibe.config.json → agent: "auto" | "claude" | "codex"`.
 * `auto` = claude if found, else codex (Claude Code is first-class; Codex is supported with
 * documented deltas — no skills/persona/hooks, rules ride AGENTS.md, safety = codex sandbox).
 *
 * detectAgents() is the unified report consumed by `vibe doctor` and (later) the UI Health page.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { claudeRunner } from './claude-adapter.js';
import { codexRunner } from './codex-adapter.js';
import type { AgentDetection, AgentId, AgentRunner } from './runner-types.js';

export type AgentPreference = AgentId | 'auto';

export const RUNNERS: Record<AgentId, AgentRunner> = {
  claude: claudeRunner,
  codex: codexRunner,
};

/** Read the project's agent preference from vibe.config.json (defensive; default 'auto'). */
export function readAgentPreference(projectDir: string): AgentPreference {
  try {
    const raw = fs.readFileSync(path.join(projectDir, 'vibe.config.json'), 'utf8');
    const cfg = JSON.parse(raw) as { agent?: unknown };
    if (cfg.agent === 'claude' || cfg.agent === 'codex' || cfg.agent === 'auto') return cfg.agent;
  } catch {
    /* missing/malformed config → auto */
  }
  return 'auto';
}

export interface AgentSelection {
  runner: AgentRunner | null;
  preference: AgentPreference;
  detections: AgentDetection[];
}

/** Detect both agent CLIs concurrently (the doctor/Health report). */
export async function detectAgents(): Promise<AgentDetection[]> {
  return Promise.all([claudeRunner.detect(), codexRunner.detect()]);
}

/**
 * Pick the runner for a project. An explicit preference is honored even when undetected
 * (the turn itself degrades to an `offline` event with install instructions); `auto`
 * requires a successful detection — claude first, then codex.
 */
export async function selectRunner(
  projectDir: string,
  override?: AgentPreference,
): Promise<AgentSelection> {
  const preference = override ?? readAgentPreference(projectDir);
  const detections = await detectAgents();
  if (preference !== 'auto') {
    return { runner: RUNNERS[preference], preference, detections };
  }
  const found = detections.find((d) => d.found);
  return { runner: found ? RUNNERS[found.id] : null, preference, detections };
}
