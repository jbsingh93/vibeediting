/**
 * UIP1.3 — the approval gate card. A blocked, gated stage is the one place amber (#FFB020) is allowed
 * (doc 08): the eye should land on "needs me". Approve = approveStage via REST (works even if the
 * agent is offline — gates never depend on the agent). Ask-for-changes hands off to the agent input.
 * Ctrl+Enter approves the focused gate (doc 08 §8). A forked stage also shows the version switcher.
 */
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { Manifest, StageName, Stage } from '../lib/types';
import { planGateStage } from '../lib/gate';

export function GateCard({
  manifest,
  stage,
  autoFocus,
  onAskChanges,
  onMutated,
}: {
  manifest: Manifest;
  stage: StageName;
  autoFocus?: boolean;
  onAskChanges: (stage: StageName) => void;
  onMutated: () => void;
}) {
  const s = manifest.stages[stage] as Stage;
  const isPlan = planGateStage(manifest) === stage;
  const [summary, setSummary] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus) cardRef.current?.focus();
  }, [autoFocus]);

  async function approve() {
    setBusy(true);
    setErr(null);
    try {
      await api.approveStage(manifest.project_id, stage);
      // apply the authoritative result immediately (a same-process server write doesn't reliably
      // re-broadcast over /ws/manifests; external agent/terminal writes still arrive via WS).
      onMutated();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
      setBusy(false);
    }
  }

  function loadSummary() {
    if (summary === null) {
      api
        .gate(manifest.project_id, stage)
        .then((g) => setSummary(g.summary))
        .catch((e) => setSummary(`(could not load review details: ${e instanceof ApiError ? e.message : String(e)})`));
    }
    setShowSummary((v) => !v);
  }

  return (
    <div
      ref={cardRef}
      tabIndex={0}
      data-gate-card={stage}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          if (!busy) approve();
        }
      }}
      style={{
        background: 'color-mix(in srgb, var(--warn) 8%, var(--surface-1))',
        border: '1px solid var(--warn)',
        borderRadius: 'var(--radius-sm)',
        padding: 16,
        outlineOffset: 2,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span aria-hidden style={{ fontSize: 18 }}>🔒</span>
        <strong style={{ color: 'var(--warn)', fontSize: 15 }}>
          {isPlan ? 'Plan' : stage} gate — needs your approval
        </strong>
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
        Stage <span className="mono">{stage}</span> produced its outputs and is held until you review it.
        {isPlan && ' The plan / scene table is in the Agent panel.'}
      </div>

      {s.outputs.length > 0 && (
        <ul className="mono" style={{ margin: '0 0 12px', paddingLeft: 16, fontSize: 12, color: 'var(--muted)' }}>
          {s.outputs.map((o) => (
            <li key={o} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{o}</li>
          ))}
        </ul>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={approve} disabled={busy} data-action="approve" style={primaryBtn}>
          {busy ? 'Approving…' : 'Approve'} <span style={{ opacity: 0.6, fontSize: 11 }}>Ctrl+Enter</span>
        </button>
        <button onClick={() => onAskChanges(stage)} data-action="ask-changes" style={ghostBtn}>
          Ask for changes
        </button>
        <button onClick={loadSummary} data-action="review" style={ghostBtn}>
          {showSummary ? 'Hide details' : 'Review details'}
        </button>
      </div>

      {showSummary && (
        <pre
          className="mono"
          data-testid="gate-summary"
          style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, lineHeight: 1.5, background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 8, padding: 12, marginTop: 12, marginBottom: 0 }}
        >
          {summary ?? 'Loading…'}
        </pre>
      )}

      {err && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>✕ {err}</div>}
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: 'var(--accent)',
  color: 'var(--primary)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 16px',
  fontWeight: 700,
  fontSize: 14,
};
const ghostBtn: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--secondary)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 14px',
  fontWeight: 600,
  fontSize: 14,
};
