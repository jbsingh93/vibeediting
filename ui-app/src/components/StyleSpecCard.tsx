/**
 * UIP3.2 — the style-spec card (doc 05 §1b): MEASURED objective signals (ground truth) beside the
 * COUNCIL's specialist reads, from a reference-analyze style-spec.json. "Use as my style" hands the
 * spec to the AGENT (UI = intents; applying a style is the agent's job, doc 06).
 */
import type { StyleSpecInfo } from '../lib/types';

export function StyleSpecCard({ info, onUse }: { info: StyleSpecInfo; onUse: (relPath: string) => void }) {
  const s = info.spec.signals;
  const specialists = (info.spec.specialists ?? []).filter((x) => !x.error && (x.summary || x.specialist));
  return (
    <div
      data-testid="style-spec-card"
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-sm)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          Style spec — <span className="mono" style={{ fontWeight: 500 }}>{info.name}</span>
        </div>
        <button onClick={() => onUse(info.relPath)} data-testid="use-style" style={ghostBtn}>
          ▸ Use as my style
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 2fr', gap: 12 }}>
        <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: 10 }}>
          <PanelHead>Measured (objective)</PanelHead>
          {s ? (
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', fontSize: 12.5 }}>
              <Meta k="duration" v={s.durationSec != null ? `${s.durationSec}s` : '—'} />
              <Meta k="cuts" v={s.cutCount != null ? String(s.cutCount) : '—'} />
              <Meta k="ASL" v={s.aslSec != null ? `${s.aslSec}s` : '—'} />
              <Meta k="loudness" v={s.lufs != null ? `${s.lufs} LUFS` : 'n/a'} />
            </dl>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>no signals recorded</div>
          )}
          {s?.palette && s.palette.length > 0 && (
            <div style={{ display: 'flex', gap: 3, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {s.palette.slice(0, 8).map((hex, i) => (
                <span key={i} title={hex} style={{ width: 16, height: 16, borderRadius: 3, background: hex, border: '1px solid var(--hairline)', display: 'inline-block' }} />
              ))}
            </div>
          )}
        </div>

        <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: 10 }}>
          <PanelHead>Council ({specialists.length} specialists)</PanelHead>
          {specialists.length === 0 && (
            <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>
              {info.spec.note ?? 'no specialist reads in this spec'}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflow: 'auto' }}>
            {specialists.map((sp, i) => (
              <div key={i} style={{ fontSize: 12.5 }}>
                <span className="mono" style={{ color: 'var(--muted)' }}>{sp.specialist ?? '?'}</span>{' '}
                {sp.summary ?? ''}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ color: 'var(--muted)', fontSize: 11.5 }}>
        ⓘ Identity-locked faces in a reference → the router picks Veo for any generation (never Seedance — GAP-50).
      </div>
    </div>
  );
}

function PanelHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 7 }}>
      {children}
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'contents' }}>
      <dt style={{ color: 'var(--muted)' }}>{k}</dt>
      <dd className="mono" style={{ margin: 0 }}>{v}</dd>
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--secondary)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-sm)',
  padding: '6px 12px',
  fontWeight: 600,
  fontSize: 12.5,
  whiteSpace: 'nowrap',
};
