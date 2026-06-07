/**
 * SETTINGS ▸ System health — renders GET /api/health, the `vibe doctor` report as a page.
 *
 * The payload is the DoctorReport from src/commands/doctor.ts, extended by the server with a
 * `modifiedEngineFiles` count (src/server/health-routes.ts). Status is NEVER colour alone — every
 * row carries a word + glyph + colour. Hand-edited engine files are surfaced because they fork the
 * project off the `vibe upgrade` path (doc 07 §4). Secrets stay booleans — values never appear.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';

type CheckStatus = 'ok' | 'warn' | 'fail';

interface DoctorCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  hint?: string;
}

/** The /api/health payload: the vibe DoctorReport + the server's modified-engine-files count. */
interface HealthReport {
  version: string;
  platform: { os: string; arch: string; node: string };
  projectDir: string;
  initialized: boolean;
  agentPreference: string;
  checks: DoctorCheck[];
  summary: { ok: number; warn: number; fail: number };
  ok: boolean;
  modifiedEngineFiles: number;
}

const STATUS_META: Record<CheckStatus, { glyph: string; word: string; color: string }> = {
  ok: { glyph: '●', word: 'ok', color: 'var(--success)' },
  warn: { glyph: '●', word: 'warn', color: 'var(--warn)' },
  fail: { glyph: '●', word: 'fail', color: 'var(--danger)' },
};

/** The agent-CLI rows get a touch of emphasis — "at least one brain" is the load-bearing check. */
const AGENT_CHECK_IDS = new Set(['claude', 'codex', 'agent']);

export function Health() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(() => {
    setLoading(true);
    api
      .health()
      .then((r) => {
        // api.health() is typed against lib/types' DoctorReport; the server returns the richer
        // vibe shape (src/commands/doctor.ts + modifiedEngineFiles). Narrow via unknown.
        setReport(r as unknown as HealthReport);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(run, [run]);

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '32px 28px 64px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 31, fontWeight: 700, margin: 0 }}>System health</h1>
        <button onClick={run} disabled={loading} style={ghostBtn}>
          {loading ? 'Running…' : 'Re-run doctor'}
        </button>
      </header>

      {error && (
        <div style={{ color: 'var(--danger)', marginBottom: 16 }}>
          ✕ {error}
        </div>
      )}

      {report && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
            <span style={{ color: 'var(--muted)', fontSize: 14 }}>
              {report.summary.ok} ok · {report.summary.warn} warn · {report.summary.fail} fail
            </span>
            <span className="mono" style={{ color: 'var(--muted)', fontSize: 12.5 }}>
              v{report.version} · {report.platform.os} {report.platform.arch} · node {report.platform.node}
            </span>
            {!report.initialized && (
              <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>
                (not inside a vibe project — project checks skipped)
              </span>
            )}
          </div>

          <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius)', overflow: 'hidden' }} data-testid="health-table">
            {report.checks.map((c, i) => {
              const meta = STATUS_META[c.status];
              return (
                <div
                  key={c.id}
                  data-check={c.id}
                  data-check-status={c.status}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '16px 56px 200px 1fr',
                    gap: 12,
                    alignItems: 'baseline',
                    padding: '10px 14px',
                    background: i % 2 ? 'var(--surface-1)' : 'transparent',
                  }}
                >
                  <span aria-hidden style={{ color: meta.color, fontSize: 18, lineHeight: 1 }} title={meta.word}>
                    {meta.glyph}
                  </span>
                  <span style={{ color: meta.color, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {meta.word}
                  </span>
                  <span style={{ fontWeight: AGENT_CHECK_IDS.has(c.id) ? 700 : 600 }}>{c.label}</span>
                  <span>
                    <span className="mono" style={{ color: 'var(--muted)', fontSize: 13 }}>
                      {c.detail}
                    </span>
                    {c.hint && c.status !== 'ok' && (
                      <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginTop: 3 }}>
                        ↳ {c.hint}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Engine-divergence row: hand-edited engine files fork off the upgrade path (doc 07 §4). */}
          <div
            data-testid="modified-engine-files"
            data-modified={report.modifiedEngineFiles}
            style={{
              marginTop: 14,
              display: 'flex',
              alignItems: 'baseline',
              gap: 12,
              padding: '12px 14px',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius)',
              background: report.modifiedEngineFiles > 0 ? 'color-mix(in srgb, var(--warn) 8%, var(--surface-1))' : 'var(--surface-1)',
            }}
          >
            <span aria-hidden style={{ color: report.modifiedEngineFiles > 0 ? 'var(--warn)' : 'var(--success)', fontSize: 18, lineHeight: 1 }}>
              ●
            </span>
            <span>
              <span style={{ fontWeight: 600 }}>Modified engine files: {report.modifiedEngineFiles}</span>
              <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>
                Hand-edited engine files (capabilities/, src/components/) won't be auto-upgraded — see{' '}
                <span className="mono">vibe upgrade</span>.
              </span>
            </span>
          </div>
        </>
      )}

      {!report && !error && <div style={{ color: 'var(--muted)' }}>Running preflight…</div>}
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--secondary)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 16px',
  fontWeight: 600,
};
