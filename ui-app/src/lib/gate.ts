/** Gate helpers (client). Mirrors the server's plan-gate convention (UIP1.2) + blocked-gate detection. */
import { STAGE_ORDER, type Manifest, type StageName, type Stage } from './types';

export const DEFAULT_PLAN_GATE_STAGE: StageName = 'motion';

/** The gated StageName that holds the plan/storyboard (inputs.plan_gate_stage, default motion). */
export function planGateStage(m: Manifest): StageName {
  const v = (m.inputs as Record<string, unknown>).plan_gate_stage;
  return typeof v === 'string' && (STAGE_ORDER as string[]).includes(v) ? (v as StageName) : DEFAULT_PLAN_GATE_STAGE;
}

/** Stages that are a gate (in approvals_required) AND currently blocked — i.e. "needs me". */
export function blockedGates(m: Manifest): StageName[] {
  return STAGE_ORDER.filter(
    (s) => m.approvals_required.includes(s) && (m.stages[s] as Stage | undefined)?.status === 'blocked',
  );
}

/** True if this stage is a gate currently holding outputs for human approval. */
export function isBlockedGate(m: Manifest, stage: StageName): boolean {
  return m.approvals_required.includes(stage) && (m.stages[stage] as Stage | undefined)?.status === 'blocked';
}
