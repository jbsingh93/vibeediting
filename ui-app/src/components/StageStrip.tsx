import { STAGE_STATUS_META } from '../lib/status';
import { STAGE_ORDER, type Manifest, type StageName, type Stage } from '../lib/types';

/**
 * The live pipeline stage strip (Concept E rail, folded into F). Renders every stage PRESENT in the
 * manifest, in canonical order, with its status glyph. A gate (stage in approvals_required sitting at
 * `blocked`) gets the amber emphasis — the only place amber is allowed, so the eye finds "needs me".
 */
export function StageStrip({ manifest }: { manifest: Manifest }) {
  const present = STAGE_ORDER.filter((s) => manifest.stages[s]);
  if (present.length === 0) {
    return <div style={{ color: 'var(--muted)', fontSize: 14 }}>No stages yet — planning.</div>;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }} data-testid="stage-strip">
      {present.map((name, i) => (
        <StageStep
          key={name}
          name={name}
          stage={manifest.stages[name] as Stage}
          isGate={manifest.approvals_required.includes(name)}
          last={i === present.length - 1}
        />
      ))}
    </div>
  );
}

function StageStep({ name, stage, isGate, last }: { name: StageName; stage: Stage; isGate: boolean; last: boolean }) {
  const meta = STAGE_STATUS_META[stage.status] ?? STAGE_STATUS_META.pending;
  const gateBlocked = isGate && stage.status === 'blocked';
  return (
    <>
      <div
        data-stage={name}
        data-stage-status={stage.status}
        title={`${name}: ${stage.status}${isGate ? ' · gate' : ''}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 600,
          color: meta.color,
          background: gateBlocked ? 'color-mix(in srgb, var(--warn) 16%, transparent)' : 'var(--surface-1)',
          border: gateBlocked ? '1px solid var(--warn)' : '1px solid var(--hairline)',
        }}
      >
        <span aria-hidden>{meta.icon}</span>
        <span>{name}</span>
        {isGate && (
          <span title="approval gate" style={{ opacity: 0.7, fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>
            gate
          </span>
        )}
      </div>
      {!last && <span aria-hidden style={{ color: 'var(--hairline)' }}>→</span>}
    </>
  );
}
