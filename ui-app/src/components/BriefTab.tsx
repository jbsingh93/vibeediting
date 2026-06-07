/**
 * UIP6.3 — the Brief editor tab: projects/<p>/brief.md rendered as markdown, ✎ Edit toggles a
 * textarea, ▸ Save brief is the ONE accent action when dirty. Saves go through PUT /:id/brief
 * with the optimistic `expect` sha (the p4 pattern); a 409 — or an agent write arriving over the
 * `brief` WS event while you're mid-edit — surfaces the same Keep-mine / Reload choice as the
 * fine-tune editor. The UI writes brief.md ONLY (never notes/inputs — §8 fence).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { subscribe } from '../lib/ws';
import type { BriefState, ManifestWsMessage } from '../lib/types';
import { Markdown } from './Markdown';

export function BriefTab({ projectId }: { projectId: string }) {
  const [brief, setBrief] = useState<BriefState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  const [conflict, setConflict] = useState<{ sha256: string; md: string; detail: string } | null>(null);
  const stateRef = useRef({ editing, draft, brief });
  stateRef.current = { editing, draft, brief };

  const load = useCallback(() => {
    api
      .brief(projectId)
      .then((b) => {
        setBrief(b);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, [projectId]);

  useEffect(() => {
    setBrief(null);
    setEditing(false);
    setConflict(null);
    setNote(null);
    load();
    // live updates: the watcher broadcasts { type:'brief' } when the agent (or anyone) writes the file
    return subscribe<ManifestWsMessage>('manifests', (msg) => {
      if (msg.type !== 'brief' || msg.project_id !== projectId) return;
      const cur = stateRef.current;
      const dirty = cur.editing && cur.brief !== null && cur.draft !== cur.brief.md;
      if (!dirty) {
        load();
        return;
      }
      // mid-edit: don't clobber the draft — surface the agent's version as a conflict choice
      api
        .brief(projectId)
        .then((b) => {
          if (b.sha256 !== stateRef.current.brief?.sha256) {
            setConflict({ sha256: b.sha256, md: b.md, detail: 'brief.md changed on disk while you were editing (probably the agent)' });
          }
        })
        .catch(() => undefined);
    });
  }, [projectId, load]);

  const dirty = editing && brief !== null && draft !== brief.md;

  async function save() {
    if (!brief) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await api.briefSave(projectId, { md: draft, expect: brief.exists ? brief.sha256 : undefined });
      if ('conflict' in res) {
        setConflict({ sha256: res.sha256, md: res.md, detail: res.detail });
        return;
      }
      setBrief({ md: draft, sha256: res.sha256, exists: true });
      setEditing(false);
      setNote({ msg: '✓ brief saved', kind: 'ok' });
    } catch (e) {
      setNote({ msg: `✕ ${e instanceof ApiError ? e.message : String(e)}`, kind: 'err' });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div style={{ color: 'var(--danger)', fontSize: 13 }}>✕ {error}</div>;
  if (!brief) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading brief…</div>;

  return (
    <div data-testid="brief-tab" style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="mono" style={{ color: 'var(--muted)', fontSize: 11 }}>
          projects/{projectId}/brief.md{brief.exists ? '' : ' · not written yet'}
        </span>
        <span style={{ flex: 1 }} />
        {note && (
          <span data-testid="brief-note" style={{ fontSize: 12.5, color: note.kind === 'ok' ? 'var(--success)' : 'var(--danger)' }}>
            {note.msg}
          </span>
        )}
        {!editing && (
          <button
            data-testid="brief-edit"
            onClick={() => {
              setDraft(brief.md);
              setEditing(true);
              setNote(null);
            }}
            style={ghostBtn}
          >
            ✎ Edit
          </button>
        )}
        {editing && (
          <>
            <button data-testid="brief-cancel" onClick={() => setEditing(false)} disabled={busy} style={ghostBtn}>
              ✕ Discard
            </button>
            <button
              data-testid="brief-save"
              onClick={save}
              disabled={!dirty || busy}
              style={{
                background: dirty && !busy ? 'var(--accent)' : 'var(--surface-2)',
                color: dirty && !busy ? 'var(--primary)' : 'var(--muted)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 14px',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              {busy ? 'Saving…' : '▸ Save brief'}
            </button>
          </>
        )}
      </div>

      {conflict && (
        <div
          data-testid="brief-conflict"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline)', borderLeft: '3px solid var(--accent)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 13 }}
        >
          <div style={{ marginBottom: 8 }}>{conflict.detail}.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              data-testid="brief-conflict-reload"
              onClick={() => {
                setBrief({ md: conflict.md, sha256: conflict.sha256, exists: true });
                setDraft(conflict.md);
                setConflict(null);
              }}
              style={ghostBtn}
            >
              Load theirs
            </button>
            <button
              data-testid="brief-conflict-keep"
              onClick={() => {
                setBrief((b) => (b ? { ...b, sha256: conflict.sha256, exists: true } : b));
                setConflict(null);
              }}
              style={ghostBtn}
              title="Adopts the new disk state as the base — your next ▸ Save overwrites it"
            >
              Keep mine (Save overwrites)
            </button>
          </div>
        </div>
      )}

      {editing ? (
        <textarea
          data-testid="brief-editor"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="mono"
          style={{
            flex: 1,
            minHeight: 260,
            resize: 'vertical',
            background: 'var(--surface-1)',
            color: 'var(--secondary)',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-sm)',
            padding: 12,
            fontSize: 12.5,
            lineHeight: 1.6,
          }}
        />
      ) : (
        <div style={{ overflow: 'auto', minHeight: 0 }}>
          <Markdown md={brief.md} />
        </div>
      )}
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--secondary)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-sm)',
  padding: '5px 12px',
  fontWeight: 600,
  fontSize: 12.5,
};
