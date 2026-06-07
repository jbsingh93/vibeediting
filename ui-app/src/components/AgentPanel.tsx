/**
 * UIP1.5 (client) — the middle panel: talk to the agent + watch it work. The agent is the native
 * `claude` CLI (D9); this panel just renders the AgentEvent feed (chat bubbles interleaved with the
 * glyph-coded activity stream, doc 11 §2) and sends user text / intents. When `claude` isn't logged
 * in it shows an offline banner and the rest of the cockpit keeps working.
 *
 * D14 — "Turn this conversation into a template": next to the composer, an action opens a small
 * name/source mini-form (source preset to 'chat') that calls api.distill. The agent does the actual
 * distillation (202 → "distilling… watch the agent feed"); a 409 shows the server's reason.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { api, ApiError } from '../lib/api';
import type { Manifest } from '../lib/types';
import type { AgentApi, FeedItem } from '../lib/agent';
import { formatSelectionForAgent, setSelection, useSelection } from '../lib/selection';
import { uploadFiles, type FileUploadState } from '../lib/upload';
import { COMPOSER_PREFILL_EVENT } from './WikiModal';
import { Markdown } from './Markdown';
import { QuestionCard } from './QuestionCard';

type DistillSource = 'project' | 'chat';

export function AgentPanel({
  manifest,
  agent,
  inputRef,
}: {
  manifest: Manifest;
  agent: AgentApi;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [draft, setDraft] = useState('');
  const [uploads, setUploads] = useState<FileUploadState[] | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // UIP5.5 — selection-aware chat: what's selected in the fine-tune editor rides along by value.
  const selection = useSelection(manifest.project_id);
  // UIP6.2 — agent-mode projects get a clean-slate composer (the brief comes from the chat).
  const agentMode = (manifest.inputs as Record<string, unknown>).mode === 'agent';
  // D14 — "Turn this conversation into a template" mini-form (source preset to 'chat').
  const [distillOpen, setDistillOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [distillSource, setDistillSource] = useState<DistillSource>('chat');
  const [distillBusy, setDistillBusy] = useState(false);
  const [distillNote, setDistillNote] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);

  // autoscroll the feed as it grows
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [agent.feed.length]);

  // UIP6.8 — "Ask the agent about this" (wiki) PREFILLS the composer, never auto-sends.
  useEffect(() => {
    const onPrefill = (e: Event) => {
      const text = (e as CustomEvent).detail?.text;
      if (typeof text !== 'string') return;
      setDraft(text);
      // defer past the wiki modal's close — its focus trap would steal the focus right back
      // if we focused synchronously while the overlay is still mounted (live-MCP QA find)
      setTimeout(() => inputRef.current?.focus(), 0);
    };
    window.addEventListener(COMPOSER_PREFILL_EVENT, onPrefill);
    return () => window.removeEventListener(COMPOSER_PREFILL_EVENT, onPrefill);
  }, [inputRef]);

  function submit() {
    const t = draft.trim();
    if (!t) return;
    agent.send(selection ? `${formatSelectionForAgent(selection)}\n${t}` : t);
    setDraft('');
  }

  /** Insert text at the composer caret BY VALUE (the drag-to-mention discipline). */
  const insertAtCaret = useCallback(
    (text: string) => {
      const el = inputRef.current;
      setDraft((cur) => {
        const at = el?.selectionStart ?? cur.length;
        const before = cur.slice(0, at);
        const after = cur.slice(at);
        const sep = before && !before.endsWith(' ') ? ' ' : '';
        return `${before}${sep}${text} ${after}`;
      });
      el?.focus();
    },
    [inputRef],
  );

  // UIP6.7 — chat upload bridge: OS file drop / paste / 📎 all go through the SAME endpoint the
  // Assets panel uses; each returned relPath lands at the caret; the grid refreshes via the
  // upload helper's vibe:assets-reload event. Failures surface the server's reason verbatim.
  const uploadToProject = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploadErr(null);
      try {
        const res = await uploadFiles(manifest.project_id, files, 'auto', setUploads);
        for (const a of res.uploaded) insertAtCaret(a.relPath);
        if (res.rejected.length > 0) {
          setUploadErr(res.rejected.map((r) => `${r.name}: ${r.reason}`).join(' · '));
        }
      } catch (e) {
        setUploadErr(e instanceof Error ? e.message : String(e));
      } finally {
        setUploads(null);
      }
    },
    [manifest.project_id, insertAtCaret],
  );

  // UIP5.5 text mention + UIP6.7 file drop share the drop handler.
  function onDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      e.preventDefault();
      void uploadToProject([...e.dataTransfer.files]);
      return;
    }
    const text = e.dataTransfer.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    insertAtCaret(text);
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.length > 0) {
      e.preventDefault();
      void uploadToProject(files);
    }
  }

  // D14 — distill the conversation (or project) into a reusable template; the agent does the work.
  async function distill() {
    const name = templateName.trim();
    if (!name || distillBusy) return;
    setDistillBusy(true);
    setDistillNote(null);
    try {
      await api.distill({ project: manifest.project_id, name, source: distillSource });
      setDistillNote({ msg: 'distilling… watch the agent feed', kind: 'ok' });
      setDistillOpen(false);
      setTemplateName('');
    } catch (e) {
      // 409 → the server's reason verbatim (e.g. duplicate template name); other failures the same.
      setDistillNote({ msg: e instanceof ApiError ? e.message : String(e), kind: 'err' });
    } finally {
      setDistillBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {agent.offline && (
        <div
          data-testid="agent-offline"
          // calm, neutral degradation notice — NOT amber (amber is reserved for gates, doc 08).
          style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: 'var(--muted)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 13, marginBottom: 12 }}
        >
          <span aria-hidden style={{ marginRight: 6 }}>⚠</span>
          Agent offline — run <span className="mono" style={{ color: 'var(--secondary)' }}>claude login</span>. Gates and views still work.
        </div>
      )}

      <div ref={feedRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }} data-testid="agent-feed">
        {agent.feed.length === 0 && !agent.offline && (
          <div style={{ color: 'var(--muted)', fontSize: 13 }} data-testid={agentMode ? 'agent-clean-slate' : undefined}>
            {agentMode
              ? 'Describe the video you want — the agent plans, you approve. Drop media files here (or ＋ Import in Assets); the agent writes the brief and stops at the plan gate.'
              : "Tell the agent what to make, or approve a gate. You'll watch each capability call appear here as it runs."}
          </div>
        )}
        {agent.feed.map((item) => (
          <FeedRow key={item.id} item={item} onExplain={agent.explainActivity} onAnswer={agent.answerQuestion} />
        ))}
        {agent.working && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)', fontSize: 13 }}>
            <span className="vibe-pulse" aria-hidden>◔</span> agent working…
            <button onClick={agent.cancel} style={{ background: 'transparent', color: 'var(--muted)', border: '1px solid var(--hairline)', borderRadius: 6, padding: '2px 8px', fontSize: 12 }}>
              Stop
            </button>
          </div>
        )}
      </div>

      {/* plan / scene table (the context behind the plan gate) */}
      {manifest.notes && (
        <details style={{ marginTop: 10, borderTop: '1px solid var(--hairline)', paddingTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Plan</summary>
          <pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.5, background: 'var(--surface-1)', border: '1px solid var(--hairline)', borderRadius: 8, padding: 12, margin: '8px 0 0', maxHeight: 200, overflow: 'auto' }}>
            {manifest.notes}
          </pre>
        </details>
      )}

      {selection && (
        <div
          data-testid="selection-chip"
          style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 999, padding: '4px 6px 4px 11px', fontSize: 12 }}
        >
          <span aria-hidden style={{ color: 'var(--muted)' }}>⌖</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }} title={selection.detail}>
            {selection.kind} {selection.label}
          </span>
          <button
            data-testid="selection-chip-clear"
            onClick={() => setSelection(null)}
            aria-label="Clear selection context"
            style={{ background: 'transparent', color: 'var(--muted)', border: 'none', fontSize: 13, lineHeight: 1, padding: '0 4px' }}
          >
            ×
          </button>
        </div>
      )}

      {uploads && uploads.length > 0 && (
        <div data-testid="composer-upload-chip" className="mono" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--muted)', background: 'var(--surface-1)', border: '1px solid var(--hairline)', borderRadius: 999, padding: '4px 12px', alignSelf: 'flex-start' }}>
          <span className="vibe-pulse" aria-hidden style={{ color: 'var(--accent)' }}>⤒</span>
          {uploads.map((u) => `${u.name} ${u.status === 'uploading' ? `${u.pct}%` : u.status === 'done' ? '✓' : '✕'}`).join(' · ')}
        </div>
      )}
      {uploadErr && (
        <div data-testid="composer-upload-error" style={{ marginTop: 8, color: 'var(--danger)', fontSize: 12.5 }}>
          ✕ {uploadErr}
        </div>
      )}

      {/* D14 — "Turn this conversation into a template" (the cockpit has no menu, so it sits by the composer) */}
      <div data-testid="agent-distill" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            data-testid="open-conversation-template"
            onClick={() => {
              setDistillOpen((v) => !v);
              setDistillNote(null);
            }}
            style={{ alignSelf: 'flex-start', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--hairline)', borderRadius: 999, padding: '3px 11px', fontWeight: 600, fontSize: 11.5 }}
          >
            ⧉ Turn this conversation into a template
          </button>
          {distillNote && (
            <span data-testid="agent-distill-note" style={{ fontSize: 12, color: distillNote.kind === 'ok' ? 'var(--success)' : 'var(--danger)' }}>
              {distillNote.kind === 'ok' ? '✓' : '✕'} {distillNote.msg}
            </span>
          )}
        </div>
        {distillOpen && (
          <div
            data-testid="agent-distill-form"
            style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface-1)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: 12, maxWidth: 460 }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5 }}>
              <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Template name</span>
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. punchy-product-reel"
                data-testid="agent-distill-name"
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
              {(['chat', 'project'] as DistillSource[]).map((src) => {
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
                    {src === 'chat' ? 'from the chat' : 'from this project'}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                data-testid="agent-distill-submit"
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
                data-testid="agent-distill-cancel"
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

      <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('text/plain') || e.dataTransfer.types.includes('Files')) e.preventDefault();
          }}
          onDrop={onDrop}
          onPaste={onPaste}
          placeholder={
            agentMode && agent.feed.length === 0
              ? 'Describe the video you want — the agent plans, you approve.'
              : 'Message the agent…  (Enter to send · Shift+Enter newline · drag an asset or a file in)'
          }
          rows={2}
          data-testid="agent-input"
          style={{ flex: 1, resize: 'none', background: 'var(--surface-1)', color: 'var(--secondary)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.4 }}
        />
        {/* UIP6.7 — 📎 picker: same upload path as the Assets panel */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          data-testid="composer-file-input"
          style={{ display: 'none' }}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            void uploadToProject(files);
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          data-testid="composer-attach"
          title="Upload media into public/<project>/ and mention it"
          aria-label="Attach files"
          style={{ background: 'transparent', color: 'var(--muted)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: '9px 10px', fontSize: 14, lineHeight: 1 }}
        >
          📎
        </button>
        <button onClick={submit} disabled={!draft.trim()} style={{ background: draft.trim() ? 'var(--accent)' : 'var(--surface-2)', color: draft.trim() ? 'var(--primary)' : 'var(--muted)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '9px 16px', fontWeight: 700, fontSize: 14 }}>
          Send
        </button>
      </div>
    </div>
  );
}

function FeedRow({
  item,
  onExplain,
  onAnswer,
}: {
  item: FeedItem;
  onExplain: (row: string) => void;
  onAnswer: (itemId: number, text: string) => void;
}) {
  if (item.kind === 'user') {
    return (
      <div style={{ alignSelf: 'flex-end', maxWidth: '85%', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: '12px 12px 4px 12px', padding: '8px 12px', fontSize: 13.5, whiteSpace: 'pre-wrap' }}>
        {item.text}
      </div>
    );
  }
  if (item.kind === 'assistant') {
    // UIP6.11 — the agent writes markdown (plans, tables, **bold**): render it for real with the
    // in-house engine (escape-first; React escapes all text — same renderer as Brief/Plan/wiki).
    return (
      <div data-testid="assistant-md" style={{ alignSelf: 'flex-start', maxWidth: '92%', fontSize: 13.5, lineHeight: 1.5 }}>
        <Markdown md={item.text} />
      </div>
    );
  }
  if (item.kind === 'question') {
    // UIP6.11 — the AskUserQuestion card; once answered it collapses to a quiet receipt.
    if (item.answered) {
      return (
        <div data-testid="question-answered" style={{ color: 'var(--muted)', fontSize: 12 }}>
          ✓ answered the agent's question
        </div>
      );
    }
    return <QuestionCard questions={item.questions} onSubmit={(text) => onAnswer(item.id, text)} />;
  }
  if (item.kind === 'system') {
    return <div style={{ color: 'var(--muted)', fontSize: 12, fontStyle: 'italic' }}>{item.text}</div>;
  }
  // activity row
  const color = item.status === 'error' ? 'var(--danger)' : item.status === 'ok' ? 'var(--success)' : 'var(--accent)';
  return (
    <button
      onClick={() => onExplain(`${item.capability ?? ''} ${item.label}`.trim())}
      data-activity={item.capability ?? item.label}
      data-activity-status={item.status}
      title="ask the agent to explain this step"
      style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', background: 'var(--surface-1)', border: '1px solid var(--hairline)', borderLeft: `3px solid ${color}`, borderRadius: 6, padding: '6px 10px', fontSize: 12.5, color: 'var(--secondary)', width: '100%' }}
    >
      <span aria-hidden style={{ fontSize: 14 }}>{item.glyph}</span>
      {item.capability && <span className="mono" style={{ color: 'var(--muted)' }}>{item.capability}</span>}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{item.label}</span>
      <span aria-hidden style={{ color }}>{item.status === 'start' ? '◔' : item.status === 'ok' ? '✓' : '✕'}</span>
    </button>
  );
}
