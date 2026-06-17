/**
 * UIP2.4 — the Deliver screen: preset dropdown (the EXACT 10-preset union, lib/presets.ts),
 * loudnorm −14 LUFS / −1 dBTP ON by default (CLAUDE.md delivery rule), variant rows (one template →
 * many aspect comps), queue handoff to the Seam-2 job runner. The chain renders to out/<p>/… and
 * loudnorms into deliver/<project>/ — the deliverable convention.
 *
 * Comp ids come from GET /api/comps (the server parses the project's src/Root.tsx) — the prebuilt
 * client can only BUNDLE the demo comp, but the Deliver tab renders through the project's own CLI,
 * so USER comps must be listed too (live-found at V5 Proof B: the static list re-rendered the
 * wrong comp). Falls back to the bundled COMP_IDS when the route is unavailable.
 */
import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { PRESETS, PRESET_HINTS } from '../lib/presets';
import { COMP_IDS, type CompId } from '../lib/comp-ids';
import type { Preset } from '../lib/types';

interface VariantRow {
  compId: string;
  preset: Preset;
}

export function DeliverPanel({ projectId, defaultComp }: { projectId: string; defaultComp: CompId }) {
  const [rows, setRows] = useState<VariantRow[]>([{ compId: defaultComp, preset: 'vertical-ad' }]);
  const [comps, setComps] = useState<string[]>([...COMP_IDS]);
  const [loudnorm, setLoudnorm] = useState(true); // default ON (hard rule)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [queuedMsg, setQueuedMsg] = useState<string | null>(null);
  // UI-P4: when the fine-tune editor saved a props.json, offer to render with it (default ON).
  const [hasProps, setHasProps] = useState(false);
  const [useProps, setUseProps] = useState(true);

  useEffect(() => {
    api
      .finetune(projectId)
      .then((s) => setHasProps(s.docs.some((d) => d.kind === 'props')))
      .catch(() => setHasProps(false));
    api
      .comps()
      .then(({ comps: ids }) => {
        if (ids.length > 0) setComps(ids);
        // No auto-preference: comps are WORKSPACE-global while projects are per-video, so the
        // UI cannot reliably guess which comp belongs to this project — the user picks.
      })
      .catch(() => {});
  }, [projectId]);

  function setRow(i: number, patch: Partial<VariantRow>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function queue(dryRun: boolean) {
    setBusy(true);
    setErr(null);
    setQueuedMsg(null);
    try {
      const { jobs } = await api.deliver({
        project: projectId,
        items: rows.map((r) => ({ compId: r.compId, preset: r.preset })),
        loudnorm,
        dryRun,
        propsFile: hasProps && useProps ? `public/${projectId}/props.json` : undefined,
      });
      setQueuedMsg(
        dryRun
          ? `${jobs.length} dry-run job(s) queued — see the Queue for the exact render argv.`
          : `${jobs.length} render(s) queued${loudnorm ? ` · loudnorm → deliver/${projectId}/` : ''}.`,
      );
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="deliver-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <SectionHead>Variants (one template → many)</SectionHead>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((row, i) => (
            <div key={i} data-testid={`deliver-row-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={row.compId} onChange={(e) => setRow(i, { compId: e.target.value })} data-testid={`deliver-comp-${i}`} style={selectStyle}>
                {comps.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
              <select value={row.preset} onChange={(e) => setRow(i, { preset: e.target.value as Preset })} data-testid={`deliver-preset-${i}`} style={selectStyle}>
                {PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {p} — {PRESET_HINTS[p]}
                  </option>
                ))}
              </select>
              {rows.length > 1 && (
                <button onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))} title="remove variant" style={iconBtn}>
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() => setRows((prev) => [...prev, { compId: prev[prev.length - 1]?.compId ?? defaultComp, preset: 'square-ad' }])}
          data-testid="add-variant"
          style={{ ...ghostBtn, marginTop: 8 }}
        >
          + variant
        </button>
      </div>

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
        <input type="checkbox" checked={loudnorm} onChange={(e) => setLoudnorm(e.target.checked)} data-testid="loudnorm-toggle" />
        loudnorm master <span className="mono" style={{ color: 'var(--muted)' }}>−14 LUFS / −1 dBTP</span>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>→ deliver/{projectId}/…-loudnorm.mp4</span>
      </label>

      {hasProps && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={useProps} onChange={(e) => setUseProps(e.target.checked)} data-testid="props-toggle" />
          render with the fine-tuned props
          <span className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>public/{projectId}/props.json</span>
        </label>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => queue(false)} disabled={busy || rows.length === 0} data-testid="deliver-queue" style={primaryBtn}>
          {busy ? 'Queueing…' : `▸ Render ${rows.length} → queue`}
        </button>
        <button onClick={() => queue(true)} disabled={busy || rows.length === 0} data-testid="deliver-dry-run" style={ghostBtn} title="preview the exact render argv without rendering">
          Dry run
        </button>
        <a href="#/queue" style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
          open Queue →
        </a>
      </div>

      {queuedMsg && (
        <div data-testid="deliver-queued" style={{ color: 'var(--success)', fontSize: 13 }}>
          ✓ {queuedMsg}
        </div>
      )}
      {err && <div style={{ color: 'var(--danger)', fontSize: 13 }}>✕ {err}</div>}
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>{children}</div>;
}

const selectStyle: React.CSSProperties = {
  background: 'var(--surface-1)',
  color: 'var(--secondary)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-sm)',
  padding: '6px 10px',
  fontSize: 13,
  maxWidth: 320,
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
