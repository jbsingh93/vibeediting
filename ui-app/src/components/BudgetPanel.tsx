/**
 * UIP3.5 — Budget & Provenance (doc 05 §6): two read-only truths. The budget ledger
 * (out/work/<p>/orchestrate/budget.json, written ONLY by APIBudgetGuard) with a spent-vs-cap bar +
 * rolling RPM, and the durable git-tracked provenance.log timeline (readProvenance — corrupt lines
 * already skipped server-side). The UI never writes either (scope fence §8).
 */
import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { spentUsd, recentRpm, barFraction, capFromInputs, fmtUsd } from '../lib/budget';
import type { BudgetEntry, Manifest, ProvenanceRecord } from '../lib/types';
import { EmptyState } from './EmptyState';

export function BudgetPanel({ manifest }: { manifest: Manifest }) {
  const projectId = manifest.project_id;
  const [entries, setEntries] = useState<BudgetEntry[] | null | undefined>(undefined); // undefined=loading
  const [prov, setProv] = useState<ProvenanceRecord[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .budget(projectId)
      .then((b) => setEntries(b))
      .catch((e) => setErr(e instanceof ApiError ? e.message : String(e)));
    api
      .provenance(projectId)
      .then((p) => setProv(p))
      .catch((e) => setErr(e instanceof ApiError ? e.message : String(e)));
  }, [projectId]);

  const cap = capFromInputs(manifest.inputs as Record<string, unknown>);
  const ledger = Array.isArray(entries) ? entries : [];
  const spent = spentUsd(ledger);
  const frac = barFraction(spent, cap);
  const rpm = recentRpm(ledger);

  return (
    <div data-testid="budget-panel" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {err && <div style={{ color: 'var(--danger)', fontSize: 13 }}>✕ {err}</div>}

      <section>
        <SectionHead>Budget (budget.json — written by the capability guard, read-only here)</SectionHead>
        {entries === undefined && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>}
        {entries !== undefined && ledger.length === 0 && (
          <EmptyState title="No paid generation yet" hint="Veo/Runway/Seedance & co. record their spend here via the budget guard." />
        )}
        {ledger.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span className="mono" data-testid="budget-spent" style={{ fontSize: 14, fontWeight: 700 }}>
                spent {fmtUsd(spent)}
                {cap != null ? ` / cap ${fmtUsd(cap)}` : ' (no cap set)'}
              </span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>RPM {rpm}/60s</span>
            </div>
            {frac != null && (
              <div
                role="progressbar"
                aria-valuenow={Math.round(frac * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                data-testid="budget-bar"
                style={{ height: 8, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden', maxWidth: 420 }}
              >
                <div
                  style={{
                    width: `${frac * 100}%`,
                    height: '100%',
                    background: frac >= 1 ? 'var(--danger)' : 'var(--secondary)',
                  }}
                />
              </div>
            )}
            <table style={{ borderCollapse: 'collapse', fontSize: 12.5, maxWidth: 640 }}>
              <tbody>
                {ledger.map((e, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--hairline)' }}>
                    <td className="mono" style={{ padding: '5px 10px 5px 0', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {e.ts.slice(11, 19)}
                    </td>
                    <td style={{ padding: '5px 10px 5px 0' }}>{e.capability}</td>
                    <td className="mono" style={{ padding: '5px 10px 5px 0', color: 'var(--muted)' }}>{e.model}</td>
                    <td className="mono" style={{ padding: '5px 0', textAlign: 'right' }}>{fmtUsd(e.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <SectionHead>Provenance (append-only, git-tracked)</SectionHead>
        {prov === null && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>}
        {prov !== null && prov.length === 0 && (
          <EmptyState title="No provenance records yet" hint="Capability runs append here — the project's audit trail." />
        )}
        {prov !== null && prov.length > 0 && (
          <div data-testid="provenance-list" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 760 }}>
            {[...prov].reverse().map((r, i) => {
              const first = r.outputs && r.outputs.length > 0 ? r.outputs[0] : undefined;
              return (
                <div
                  key={i}
                  data-testid="provenance-row"
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'baseline',
                    fontSize: 12.5,
                    borderBottom: '1px solid var(--hairline)',
                    paddingBottom: 6,
                    flexWrap: 'wrap',
                  }}
                >
                  <span className="mono" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtTs(r.ts)}</span>
                  <span style={{ fontWeight: 600 }}>{r.capability}</span>
                  {first && r.outputs && (
                    <span className="mono" style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      → {basename(first.path)} · sha {first.sha256.slice(0, 8)}… · {fmtKb(first.bytes)}
                      {r.outputs.length > 1 ? ` (+${r.outputs.length - 1})` : ''}
                    </span>
                  )}
                  {r.note && <span style={{ color: 'var(--muted)' }}>{r.note}</span>}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function fmtTs(ts: string): string {
  const t = new Date(ts);
  return Number.isNaN(t.getTime()) ? ts : `${ts.slice(0, 10)} ${ts.slice(11, 16)}`;
}
function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}
function fmtKb(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>
      {children}
    </div>
  );
}
