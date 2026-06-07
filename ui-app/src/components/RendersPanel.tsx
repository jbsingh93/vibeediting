/**
 * UIP6.13 — the Preview tab's "Renders" section: every produced video for the project (test-video
 * deliverables, out/ + out/work intermediates), newest first, playable inline — with an EXPLICIT
 * draft framing: these are the agent's first versions (v1 / loudnorm), the agent may not be done,
 * and a render is NOT fine-tune data (the editor needs captions/segments/props JSON).
 *
 * D14 — "Save as Template": once the project has at least one render, the human can distill the
 * project (or the chat that produced it) into a reusable template via api.distill. The actual work
 * is the agent's (202 → "distilling… watch the agent feed"); a 409 surfaces the server's reason.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { subscribe } from '../lib/ws';
import { ASSETS_RELOAD_EVENT } from '../lib/upload';
import { formatBytes, timeAgo } from '../lib/assets';
import type { JobsWsMessage, Manifest, RenderInfo, Stage } from '../lib/types';

/** The project counts as "agent done" only when deliver completed AND was approved. */
export function deliverDone(m: Manifest): boolean {
  const d = m.stages.deliver as Stage | undefined;
  return d?.status === 'complete' && d.approved === true;
}

type DistillSource = 'project' | 'chat';

export function RendersPanel({ manifest }: { manifest: Manifest }) {
  const projectId = manifest.project_id;
  const [renders, setRenders] = useState<RenderInfo[] | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  // D14 — inline "Save as Template" form state.
  const [distillOpen, setDistillOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [distillSource, setDistillSource] = useState<DistillSource>('project');
  const [distillBusy, setDistillBusy] = useState(false);
  const [distillNote, setDistillNote] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);

  const reload = useCallback(() => {
    api
      .renders(projectId)
      .then((r) => setRenders(r.renders))
      .catch((e) => {
        if (!(e instanceof ApiError)) setRenders([]);
      });
  }, [projectId]);

  useEffect(() => {
    setRenders(null);
    setPlaying(null);
    setDistillOpen(false);
    setDistillNote(null);
    reload();
    // stay live: agent turns nudge vibe:assets-reload; UI render jobs land on /ws/jobs
    const onNudge = () => reload();
    window.addEventListener(ASSETS_RELOAD_EVENT, onNudge);
    const unsub = subscribe<JobsWsMessage>('jobs', (msg) => {
      if (msg.type === 'job' && msg.job.project === projectId && msg.job.status === 'done') reload();
    });
    return () => {
      window.removeEventListener(ASSETS_RELOAD_EVENT, onNudge);
      unsub();
    };
  }, [projectId, reload]);

  async function distill() {
    const name = templateName.trim();
    if (!name || distillBusy) return;
    setDistillBusy(true);
    setDistillNote(null);
    try {
      await api.distill({ project: projectId, name, source: distillSource });
      setDistillNote({ msg: 'distilling… watch the agent feed', kind: 'ok' });
      setDistillOpen(false);
      setTemplateName('');
    } catch (e) {
      // 409 → the server's reason verbatim (e.g. a template by that name already exists); any other
      // failure surfaces its message the same way.
      setDistillNote({ msg: e instanceof ApiError ? e.message : String(e), kind: 'err' });
    } finally {
      setDistillBusy(false);
    }
  }

  if (renders === null) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>Scanning renders…</div>;
  if (renders.length === 0) {
    return (
      <div data-testid="renders-empty" style={{ color: 'var(--muted)', fontSize: 13 }}>
        No renders yet — they appear here the moment the agent (or Deliver) produces one.
      </div>
    );
  }

  const done = deliverDone(manifest);

  return (
    <div data-testid="renders-panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {!done && (
        <div
          data-testid="renders-draft-banner"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline)', borderLeft: '3px solid var(--accent)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}
        >
          ⚠ <strong style={{ color: 'var(--secondary)' }}>Drafts — the agent is not done.</strong> These are first
          versions (v1 / loudnorm) for review, not finals — and a render is not fine-tune data: the
          Fine-tune editor unlocks when captions/segments/props JSON land in public/{projectId}/.
        </div>
      )}

      {/* D14 — Save as Template (visible whenever there is at least one render) */}
      <div data-testid="renders-distill" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            data-testid="open-save-template"
            onClick={() => {
              setDistillOpen((v) => !v);
              setDistillNote(null);
            }}
            style={{ background: 'transparent', color: 'var(--secondary)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: '5px 12px', fontWeight: 700, fontSize: 12.5 }}
          >
            ⧉ Save as Template
          </button>
          {distillNote && (
            <span data-testid="distill-note" style={{ fontSize: 12.5, color: distillNote.kind === 'ok' ? 'var(--success)' : 'var(--danger)' }}>
              {distillNote.kind === 'ok' ? '✓' : '✕'} {distillNote.msg}
            </span>
          )}
        </div>
        {distillOpen && (
          <div
            data-testid="distill-form"
            style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface-1)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: 12, maxWidth: 460 }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5 }}>
              <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Template name</span>
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. punchy-product-reel"
                data-testid="distill-name"
                className="mono"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void distill();
                  }
                }}
                style={{ background: 'var(--surface-2)', color: 'var(--secondary)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', fontSize: 13 }}
              />
            </label>
            <div role="radiogroup" aria-label="Template source" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['project', 'chat'] as DistillSource[]).map((src) => {
                const on = distillSource === src;
                return (
                  <button
                    key={src}
                    role="radio"
                    aria-checked={on}
                    data-distill-source={src}
                    onClick={() => setDistillSource(src)}
                    style={{
                      background: on ? 'color-mix(in srgb, var(--accent) 12%, var(--surface-2))' : 'var(--surface-2)',
                      color: 'var(--secondary)',
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--hairline)'}`,
                      borderRadius: 999,
                      padding: '5px 13px',
                      fontSize: 12.5,
                      fontWeight: 600,
                    }}
                  >
                    {on ? '● ' : '○ '}
                    {src === 'project' ? 'from this project' : 'from the chat'}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                data-testid="distill-submit"
                onClick={() => void distill()}
                disabled={!templateName.trim() || distillBusy}
                style={{
                  background: templateName.trim() && !distillBusy ? 'var(--accent)' : 'var(--surface-2)',
                  color: templateName.trim() && !distillBusy ? 'var(--primary)' : 'var(--muted)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '7px 14px',
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {distillBusy ? 'Distilling…' : '▸ Distill template'}
              </button>
              <button
                data-testid="distill-cancel"
                onClick={() => setDistillOpen(false)}
                disabled={distillBusy}
                style={{ background: 'transparent', color: 'var(--secondary)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: '7px 12px', fontWeight: 600, fontSize: 13 }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {renders.map((r) => (
        <div key={r.relPath} data-testid="render-row" style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span aria-hidden>🎬</span>
            <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={r.relPath}>
              {r.name}
            </span>
            <span
              className="mono"
              data-render-kind={r.loudnorm ? 'loudnorm' : 'draft'}
              style={{ fontSize: 10.5, color: r.loudnorm ? 'var(--success)' : 'var(--muted)', border: '1px solid var(--hairline)', borderRadius: 999, padding: '1px 7px' }}
            >
              {r.loudnorm ? 'loudnorm −14 LUFS' : 'draft'}
            </span>
            <button
              onClick={() => setPlaying((p) => (p === r.relPath ? null : r.relPath))}
              data-render-action="play"
              style={{ background: 'transparent', color: 'var(--secondary)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: '3px 10px', fontWeight: 600, fontSize: 11.5 }}
            >
              {playing === r.relPath ? '✕ close' : '▸ play'}
            </button>
          </div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span>{formatBytes(r.bytes)}</span>
            <span>{timeAgo(r.mtime)}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.relPath}</span>
          </div>
          {playing === r.relPath && (
            <video data-testid="render-player" src={r.url} controls preload="metadata" style={{ width: '100%', maxHeight: 380, background: '#000', borderRadius: 6 }} />
          )}
        </div>
      ))}
    </div>
  );
}
