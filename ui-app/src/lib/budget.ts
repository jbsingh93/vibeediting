/** UIP3.5 — pure budget-bar math over budget.json ledger entries (unit-tested).
 *  Mirrors orchestrate/budget-guard.ts semantics: spent = Σ costUsd, RPM = calls in the last 60s.
 *  The UI READS the ledger; it never writes it (scope fence §8). */
import type { BudgetEntry } from './types';

export function spentUsd(entries: BudgetEntry[]): number {
  return +entries.reduce((sum, e) => sum + (Number.isFinite(e.costUsd) ? e.costUsd : 0), 0).toFixed(6);
}

/** Paid calls within the rolling 60s window (budget-guard.ts recentRpm). */
export function recentRpm(entries: BudgetEntry[], now: number = Date.now()): number {
  return entries.filter((e) => {
    const t = new Date(e.ts).getTime();
    return Number.isFinite(t) && now - t < 60_000 && now - t >= 0;
  }).length;
}

/** Bar fill 0..1 vs the cap; null when no cap is configured (bar hidden, total still shown). */
export function barFraction(spent: number, capUsd: number | null): number | null {
  if (capUsd == null || !Number.isFinite(capUsd) || capUsd <= 0) return null;
  return Math.max(0, Math.min(1, spent / capUsd));
}

/** Read the optional project cap from manifest inputs (inputs.max_cost_usd). */
export function capFromInputs(inputs: Record<string, unknown>): number | null {
  const v = inputs.max_cost_usd;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function fmtUsd(v: number): string {
  return `$${v.toFixed(2)}`;
}
