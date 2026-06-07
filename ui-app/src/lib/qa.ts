/**
 * UIP2.3 — pure QA-screen verdict logic over a VerifyResult (plan §2.4). This file keeps the UI
 * honest to verify.ts `decide()`:
 *   - objective meters are AUTHORITATIVE → any failed blocker meter disables Ship, no override path;
 *   - council technical-lens blockers → fix (Ship disabled);
 *   - taste-only blockers (transition/story) → escalate: "your call" + Override-with-logged-reason;
 *   - ship → Ship enabled. eyes === null → "taste UNVERIFIED" warning chip.
 * Unit-tested against one fixture per decide() branch (§6T.1).
 */
import type { VerifyResult, Verdict } from './types';

/** Mirrors verify.ts SPECIALIST_STAGE taste flags (transition/story are the taste lenses). */
const TASTE_LENSES = new Set(['transition', 'story']);

export interface QaView {
  verdict: Verdict;
  /** Ship is enabled ONLY on a clean `ship` — or on `escalate` AFTER an explicit override. */
  shipEnabled: boolean;
  /** escalate = taste-only blockers → human call with an override path. */
  canOverride: boolean;
  /** objective meters failed → no override path exists at all. */
  objectiveFailed: boolean;
  tasteUnverified: boolean;
  failedMeters: number;
  councilBlockers: number;
}

export function qaView(result: VerifyResult, overridden = false): QaView {
  const objectiveFailed = result.technical.some((c) => !c.ok && c.severity === 'blocker');
  const failedMeters = result.technical.filter((c) => !c.ok).length;
  const councilBlockers = result.eyes?.totalBlockers ?? 0;
  const canOverride = result.verdict === 'escalate';
  return {
    verdict: result.verdict,
    shipEnabled: result.verdict === 'ship' || (result.verdict === 'escalate' && overridden),
    canOverride,
    objectiveFailed,
    tasteUnverified: result.eyes === null,
    failedMeters,
    councilBlockers,
  };
}

/** True when this council specialist is a pure-taste lens (escalate, never auto-fix). */
export function isTasteLens(specialistId: string): boolean {
  return TASTE_LENSES.has(specialistId);
}

export const VERDICT_META: Record<Verdict, { label: string; color: string; icon: string }> = {
  ship: { label: 'ship', color: 'var(--success)', icon: '✓' },
  fix: { label: 'fix', color: 'var(--danger)', icon: '✎' },
  rework: { label: 'rework', color: 'var(--danger)', icon: '↻' },
  escalate: { label: 'your call', color: 'var(--warn)', icon: '⚖' },
};
