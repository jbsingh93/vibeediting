/**
 * UIP2.3 — the QA / Verify screen: objective meters (authoritative) + the Gemini council (advisory
 * taste) + the fused verdict, rendered honestly to verify.ts `decide()` (lib/qa.ts):
 *   - a red objective meter ⇒ Ship disabled, NO override path;
 *   - taste-only blockers ⇒ "your call" escalation with Override-(log reason);
 *   - eyes skipped ⇒ "taste UNVERIFIED" chip.
 * "Run verify" queues a real `orchestrate/verify` job through the Seam-2 job runner.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { qaView, isTasteLens, VERDICT_META } from '../lib/qa';
import { subscribe } from '../lib/ws';
import type { JobsWsMessage, ObjectiveCheck, VerifyResultEnvelope } from '../lib/types';

export function QaPanel({
  projectId,
  onShip,
  onAskAgent,
}: {
  projectId: string;
  onShip: () => void;
  onAskAgent: (text: string) => void;
}) {
  const [envelope, setEnvelope] = useState<VerifyResultEnvelope | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [verifyJobId, setVerifyJobId] = useState<string | null>(null);
  const [overridden, setOverridden] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  const reload = useCallback(() => {
    api
      .verifyResult(projectId)
      .then((r) => {
        setEnvelope(r);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : String(e)));
  }, [projectId]);

  useEffect(() => {
    setOverridden(false);
    reload();
  }, [reload]);

  // when our verify job finishes, re-read the result from disk
  useEffect(() => {
    if (!verifyJobId) return;
    return subscribe<JobsWsMessage>('jobs', (msg) => {
      if (msg.type !== 'job' || msg.job.id !== verifyJobId) return;
      if (msg.job.status === 'done' || msg.job.status === 'failed') {
        setVerifyJobId(null);
        if (msg.job.status === 'failed') setErr(msg.job.error ?? 'verify failed');
        reload();
      }
    });
  }, [verifyJobId, reload]);

  async function runVerify() {
    setErr(null);
    try {
      const { job } = await api.runVerify(projectId);
      setVerifyJobId(job.id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    }
  }

  function doOverride() {
    const reason = overrideReason.trim();
    if (!reason) return;
    setOverridden(true);
    // the agent logs the override reason to provenance (the UI never writes provenance itself)
    onAskAgent(`QA override on "${projectId}": shipping despite the taste-only escalation. Reason: ${reason}. Log this to provenance.`);
  }

  const result = envelope?.result ?? null;
  const view = result ? qaView(result, overridden) : null;

  return (
    <div data-testid="qa-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {view && (
          <span
            data-testid="qa-verdict"
            data-verdict={view.verdict}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 12px',
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 13,
              color: VERDICT_META[view.verdict].color,
              background: `color-mix(in srgb, ${VERDICT_META[view.verdict].color} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${VERDICT_META[view.verdict].color} 35%, transparent)`,
            }}
          >
            <span aria-hidden>{VERDICT_META[view.verdict].icon}</span> verdict: {VERDICT_META[view.verdict].label}
          </span>
        )}
        {view?.tasteUnverified && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', border: '1px dashed var(--hairline)', borderRadius: 999, padding: '3px 10px' }}>
            ⚠ taste UNVERIFIED (eyes skipped)
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={runVerify} disabled={verifyJobId !== null} data-testid="run-verify" style={ghostBtn}>
          {verifyJobId ? '◔ verifying…' : result ? '↻ Re-verify' : '▸ Run verify'}
        </button>
      </div>

      {err && <div style={{ color: 'var(--danger)', fontSize: 13 }}>✕ {err}</div>}

      {envelope === undefined && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading QA state…</div>}
      {envelope === null && !verifyJobId && (
        <div style={{ color: 'var(--muted)', fontSize: 13, border: '1px dashed var(--hairline)', borderRadius: 'var(--radius-sm)', padding: 14 }}>
          No verify run yet for this project. Run verify on the finished video to get the objective meters and (with a
          Gemini key) the council's taste read.
        </div>
      )}

      {result && view && (
        <>
          {/* OBJECTIVE — authoritative */}
          <section>
            <SectionHead>Objective (authoritative)</SectionHead>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="qa-meters">
              {result.technical.map((c) => (
                <MeterRow key={c.id} check={c} />
              ))}
              {result.technical.length === 0 && (
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>No objective meters recorded.</div>
              )}
            </div>
          </section>

          {/* TASTE — advisory council */}
          <section>
            <SectionHead>Taste (Gemini council — advisory)</SectionHead>
            {result.eyes ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }} data-testid="qa-council">
                {result.eyes.specialists.map((s) => (
                  <div
                    key={s.id}
                    data-specialist={s.id}
                    style={{
                      background: 'var(--surface-1)',
                      border: `1px solid ${s.blockers > 0 ? 'var(--danger)' : 'var(--hairline)'}`,
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 10px',
                      fontSize: 12.5,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontWeight: 700 }}>{s.id}</span>
                      <span style={{ color: s.blockers > 0 ? 'var(--danger)' : 'var(--success)' }}>{s.verdict}</span>
                    </div>
                    <div style={{ color: 'var(--muted)', marginTop: 2 }}>
                      {s.blockers > 0 || s.majors > 0
                        ? `${s.blockers} blocker · ${s.majors} major${isTasteLens(s.id) ? ' · taste lens' : ''}`
                        : 'clean'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                Council skipped — objective gate only. Re-verify with a GEMINI key for the taste read.
              </div>
            )}
          </section>

          {/* reasons */}
          {result.reasons.length > 0 && (
            <section>
              <SectionHead>Why</SectionHead>
              <ul className="mono" style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {result.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </section>
          )}

          {/* escalation override (taste-only blockers — the human's call) */}
          {view.canOverride && !overridden && (
            <section
              data-testid="qa-escalate"
              style={{ background: 'color-mix(in srgb, var(--warn) 8%, var(--surface-1))', border: '1px solid var(--warn)', borderRadius: 'var(--radius-sm)', padding: 12 }}
            >
              <div style={{ fontWeight: 700, color: 'var(--warn)', marginBottom: 6 }}>⚖ Taste-only concern — your call</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
                The objective meters passed; only the taste lenses raised blockers. You can override with a logged reason,
                or ask the agent to fix it.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="why is it fine to ship?"
                  data-testid="override-reason"
                  style={{ flex: 1, minWidth: 160, background: 'var(--surface-2)', color: 'var(--secondary)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', fontSize: 13 }}
                />
                <button onClick={doOverride} disabled={!overrideReason.trim()} data-testid="override" style={ghostBtn}>
                  Override (log reason)
                </button>
              </div>
            </section>
          )}
          {overridden && (
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }} data-testid="qa-overridden">
              ✓ escalation overridden — reason sent to the agent for the provenance log.
            </div>
          )}

          {/* ship */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={onShip}
              disabled={!view.shipEnabled}
              data-testid="ship"
              title={view.shipEnabled ? 'continue to deliver' : view.objectiveFailed ? 'an objective meter failed — fix it first (no override)' : 'resolve the blockers first'}
              style={{
                background: view.shipEnabled ? 'var(--accent)' : 'var(--surface-2)',
                color: view.shipEnabled ? 'var(--primary)' : 'var(--muted)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '9px 18px',
                fontWeight: 700,
                fontSize: 14,
                cursor: view.shipEnabled ? 'pointer' : 'not-allowed',
              }}
            >
              Ship → Deliver
            </button>
            {!view.shipEnabled && (
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                {view.objectiveFailed
                  ? 'an objective meter is red — Ship stays disabled until it passes (no override path)'
                  : view.verdict === 'escalate'
                    ? 'override the taste escalation (with a reason) to enable Ship'
                    : 'fix the blockers and re-verify'}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MeterRow({ check }: { check: ObjectiveCheck }) {
  return (
    <div
      data-meter={check.id}
      data-ok={check.ok ? 'true' : 'false'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'var(--surface-1)',
        border: `1px solid ${check.ok ? 'var(--hairline)' : 'var(--danger)'}`,
        borderRadius: 'var(--radius-sm)',
        padding: '7px 10px',
        fontSize: 13,
      }}
    >
      <span aria-hidden style={{ color: check.ok ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
        {check.ok ? '✓' : '✕'}
      </span>
      <span style={{ fontWeight: 600, minWidth: 110 }}>{check.id}</span>
      <span style={{ flex: 1, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {check.message}
      </span>
      {check.value !== undefined && (
        <span className="mono" style={{ fontSize: 12 }}>
          {String(check.value)}
          {check.expected !== undefined && <span style={{ color: 'var(--muted)' }}> / {String(check.expected)}</span>}
        </span>
      )}
      <span style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{check.severity}</span>
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>{children}</div>;
}

const ghostBtn: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--secondary)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-sm)',
  padding: '7px 14px',
  fontWeight: 600,
  fontSize: 13,
};
