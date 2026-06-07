/**
 * UIP6.4 — the Agent Plan tab: `manifest.notes` rendered as markdown (the UIP1.2 plan surface,
 * full-size) + the plan-gate status line + the SAME Approve / Ask-for-changes affordances as the
 * GateCard (rendered verbatim when the gate is blocked — amber stays gate-only). The plan is
 * agent-owned: the UI never writes `notes` (§8 fence). AgentPanel's collapsible <details> stays.
 *
 * D19 — plan approval visibly = cost approval: scan the notes for an `Estimated cost: $X.XX …` line
 * and surface it as a prominent amber cost chip directly above the approve affordance. When the plan
 * mentions a paid provider but carries no cost line, show a subtle warning chip instead so a silent
 * paid-generation plan can never be approved without the human seeing the money question.
 */
import type { Manifest, Stage } from '../lib/types';
import { isBlockedGate, planGateStage } from '../lib/gate';
import { GateCard } from './GateCard';
import { Markdown } from './Markdown';
import { EmptyState } from './EmptyState';

/** Paid-generation providers whose mention (without a cost line) warrants the soft warning chip. */
const PAID_PROVIDERS = ['elevenlabs', 'veo', 'runway', 'seedance', 'gpt-image'];

/** First `Estimated cost: $X.XX …` amount found in the notes (case-insensitive), else null. */
export function estimatedCost(notes: string): string | null {
  const m = notes.match(/estimated\s+cost:\s*(\$\s*[\d,]+(?:\.\d+)?)/i);
  return m && m[1] ? m[1].replace(/\s+/g, '') : null;
}

/** Does the plan mention any paid-generation provider (used only when there's no cost line)? */
export function mentionsPaidProvider(notes: string): boolean {
  const lower = notes.toLowerCase();
  return PAID_PROVIDERS.some((p) => lower.includes(p));
}

export function PlanTab({
  manifest,
  onAskChanges,
  onMutated,
}: {
  manifest: Manifest;
  onAskChanges: () => void;
  onMutated: () => void;
}) {
  const stage = planGateStage(manifest);
  const s = manifest.stages[stage] as Stage | undefined;
  const blocked = isBlockedGate(manifest, stage);
  const statusText = s ? s.status : 'not started';

  const notes = manifest.notes ?? '';
  const cost = notes ? estimatedCost(notes) : null;
  const paidNoCost = !cost && notes ? mentionsPaidProvider(notes) : false;

  // D19 — the cost chip sits directly above whatever drives approval (the gate card when blocked,
  // otherwise the Ask-for-changes affordance), so plan approval visibly carries the cost.
  const costChip = cost ? (
    <div
      data-testid="plan-cost-chip"
      style={{
        alignSelf: 'flex-start',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: 'color-mix(in srgb, var(--warn) 14%, var(--surface-1))',
        border: '1px solid var(--warn)',
        borderRadius: 999,
        padding: '5px 13px',
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--warn)',
      }}
    >
      <span aria-hidden>$</span>
      Approving this plan approves an estimated spend of{' '}
      <span className="mono" data-testid="plan-cost-amount" style={{ fontWeight: 800 }}>
        {cost}
      </span>
    </div>
  ) : paidNoCost ? (
    <div
      data-testid="plan-cost-warning"
      style={{
        alignSelf: 'flex-start',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--surface-1)',
        border: '1px solid var(--hairline)',
        borderLeft: '3px solid var(--warn)',
        borderRadius: 'var(--radius-sm)',
        padding: '5px 12px',
        fontSize: 12.5,
        color: 'var(--muted)',
      }}
    >
      <span aria-hidden>⚠</span>
      plan mentions paid generation but no cost line
    </div>
  ) : null;

  return (
    <div data-testid="plan-tab" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="mono" data-testid="plan-gate-status" style={{ color: 'var(--muted)', fontSize: 11.5 }}>
        plan gate: {stage} · {statusText}
        {s?.status === 'complete' && s.approved ? ' · approved ✓' : ''}
      </div>

      {blocked && costChip}

      {blocked && (
        <GateCard manifest={manifest} stage={stage} onAskChanges={() => onAskChanges()} onMutated={onMutated} />
      )}

      {manifest.notes ? (
        <div style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: '6px 16px 12px' }}>
          <Markdown md={manifest.notes} />
        </div>
      ) : (
        <EmptyState title="No plan yet" hint="Brief the agent — it writes its plan (the scene table) here and stops at the plan gate for your approval." />
      )}

      {!blocked && manifest.notes && costChip}

      {!blocked && manifest.notes && (
        <button
          data-testid="plan-ask-changes"
          onClick={onAskChanges}
          style={{
            alignSelf: 'flex-start',
            background: 'transparent',
            color: 'var(--secondary)',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-sm)',
            padding: '7px 14px',
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          Ask for changes
        </button>
      )}
    </div>
  );
}
