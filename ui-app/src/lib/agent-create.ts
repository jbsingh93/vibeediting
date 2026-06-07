/**
 * UIP6.2 — the agent-mode create's pure model (plan §4 agent-mode body). One field: the project
 * name. Reuses the wizard's slug rules verbatim; NO kickoff is stashed (clean slate — the user
 * briefs the agent in the cockpit chat). Gates are kept: agent mode skips the FORM, not the
 * safety model (plan §6 design decision #1).
 */
import type { StageName } from './types';
import { slugify } from './wizard';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

/** Validation → list of human errors (empty = valid). Mirrors the wizard's name rule. */
export function validateAgentName(name: string): string[] {
  const errors: string[] = [];
  const slug = slugify(name);
  if (!name.trim()) errors.push('give the project a name');
  else if (!SLUG_RE.test(slug)) errors.push('the name must reduce to at least 2 characters (a–z, 0–9, dashes)');
  return errors;
}

export interface AgentCreateBody {
  project_id: string;
  inputs: { mode: 'agent'; lang: 'en'; plan_gate_stage: 'motion' };
  approvals_required: StageName[];
  notes: string;
}

/** The POST /api/projects body for agent mode. `inputs.mode:'agent'` is the discriminator
 *  (unused by wizard projects → full back-compat); the brief comes from the chat, not inputs. */
export function buildAgentCreateBody(name: string): AgentCreateBody {
  return {
    project_id: slugify(name),
    inputs: { mode: 'agent', lang: 'en', plan_gate_stage: 'motion' },
    approvals_required: ['motion', 'deliver'],
    notes: 'Agent-mode project — brief comes from the chat.',
  };
}
