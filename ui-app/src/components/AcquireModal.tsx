/**
 * UIP3.2 — the "Bring something in" modal (doc 05 §1a). One URL + a what-is-it choice routed to the
 * whitelisted acquire verbs: media (yt-dlp) · asset (download-asset) · page (fetch-url) ·
 * MIMIC (download + reference-analyze → style-spec.json). Fetch = the one accent action.
 */
import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { AcquireWhat } from '../lib/types';

const WHAT_OPTIONS: { id: AcquireWhat; label: string; hint: string }[] = [
  { id: 'media', label: 'A video/clip to use', hint: 'yt-dlp → test-video/<p>/refs/' },
  { id: 'asset', label: 'An asset (image/font/LUT)', hint: 'download-asset' },
  { id: 'page', label: 'A page of text/reference', hint: 'fetch-url → markdown' },
  { id: 'mimic', label: 'A video to MIMIC', hint: '+ reference-analyze → style-spec' },
];

export function AcquireModal({ projectId, onClose, onQueued }: { projectId: string; onClose: () => void; onQueued: (msg: string) => void }) {
  const [url, setUrl] = useState('');
  const [what, setWhat] = useState<AcquireWhat>('media');
  const [audioOnly, setAudioOnly] = useState(false);
  const [ship, setShip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function fetchIt() {
    setErr(null);
    if (!/^https?:\/\/\S+/i.test(url.trim())) {
      setErr('Paste a full http(s) URL first.');
      return;
    }
    setBusy(true);
    try {
      const { job } = await api.acquire({ project: projectId, url: url.trim(), what, audioOnly: audioOnly || undefined, ship: ship || undefined });
      onQueued(what === 'mimic' ? `Mimic queued (${job.label}) — the style-spec card appears when the analysis lands.` : `Queued: ${job.label}`);
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bring something in"
      data-testid="acquire-modal"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 'min(520px, 92vw)',
          background: 'var(--surface-1)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius)',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Bring something in</div>
          <button onClick={onClose} aria-label="close" style={iconBtn}>
            ✕
          </button>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <span style={{ color: 'var(--muted)', fontWeight: 600 }}>URL</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=…"
            data-testid="acquire-url"
            className="mono"
            style={inputStyle}
            autoFocus
          />
        </label>

        <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <legend style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 600, marginBottom: 6, padding: 0 }}>What is it?</legend>
          {WHAT_OPTIONS.map((o) => (
            <label
              key={o.id}
              data-acquire-what={o.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 13.5,
                cursor: 'pointer',
                padding: '7px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid',
                borderColor: what === o.id ? 'var(--secondary)' : 'var(--hairline)',
                background: what === o.id ? 'var(--surface-2)' : 'transparent',
              }}
            >
              <input type="radio" name="acquire-what" checked={what === o.id} onChange={() => setWhat(o.id)} />
              <span style={{ flex: 1 }}>{o.label}</span>
              <span className="mono" style={{ color: 'var(--muted)', fontSize: 11.5 }}>{o.hint}</span>
            </label>
          ))}
        </fieldset>

        <div style={{ display: 'flex', gap: 18, fontSize: 13 }}>
          {what === 'media' && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
              <input type="checkbox" checked={audioOnly} onChange={(e) => setAudioOnly(e.target.checked)} data-testid="acquire-audio-only" />
              audio only
            </label>
          )}
          {what === 'asset' && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
              <input type="checkbox" checked={ship} onChange={(e) => setShip(e.target.checked)} data-testid="acquire-ship" />
              ship to <span className="mono">public/{projectId}/refs/</span>
            </label>
          )}
        </div>

        {err && (
          <div data-testid="acquire-error" style={{ color: 'var(--danger)', fontSize: 13 }}>
            ✕ {err}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={ghostBtn}>
            Cancel
          </button>
          <button onClick={fetchIt} disabled={busy} data-testid="acquire-fetch" style={primaryBtn}>
            {busy ? 'Queueing…' : '▸ Fetch'}
          </button>
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 11.5 }}>
          Every acquisition is provenance-logged (source URL + sha256) by the capability itself.
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface-2)',
  color: 'var(--secondary)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 10px',
  fontSize: 13,
};
const primaryBtn: React.CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--primary)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  padding: '9px 16px',
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
  fontSize: 13,
};
const iconBtn: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--muted)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-sm)',
  padding: '4px 9px',
  fontSize: 12,
};
