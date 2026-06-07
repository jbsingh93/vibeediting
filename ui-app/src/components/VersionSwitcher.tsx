/** UIP1.6 — version switcher bound to stage.versions[]. Click a fork to re-approve it (approveVersion). */
import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { StageName, VersionRecord } from '../lib/types';

export function VersionSwitcher({
  projectId,
  stage,
  versions,
  onMutated,
}: {
  projectId: string;
  stage: StageName;
  versions: VersionRecord[];
  onMutated: () => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (versions.length < 2) return null; // nothing to switch between until the first fork

  async function approve(v: number) {
    setBusy(v);
    setErr(null);
    try {
      await api.approveVersion(projectId, stage, v);
      onMutated();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ marginTop: 12 }} data-testid="version-switcher" data-stage={stage}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
        Versions — approved is authoritative; switching never deletes the other
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {versions.map((r) => (
          <button
            key={r.v}
            onClick={() => !r.approved && approve(r.v)}
            disabled={r.approved || busy !== null}
            data-version={r.v}
            data-approved={r.approved ? 'true' : 'false'}
            title={r.approved ? 'approved (active)' : `approve v${r.v}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              cursor: r.approved ? 'default' : 'pointer',
              color: r.approved ? 'var(--primary)' : 'var(--secondary)',
              background: r.approved ? 'var(--success)' : 'var(--surface-2)',
              border: `1px solid ${r.approved ? 'var(--success)' : 'var(--hairline)'}`,
              opacity: busy !== null && busy !== r.v ? 0.5 : 1,
            }}
          >
            <span aria-hidden>{r.approved ? '✓' : busy === r.v ? '…' : '○'}</span>v{r.v}
          </button>
        ))}
      </div>
      {err && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>✕ {err}</div>}
    </div>
  );
}
