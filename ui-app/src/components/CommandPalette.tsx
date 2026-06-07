/**
 * UIP5.1 — the command palette: Ctrl+K from anywhere → fuzzy-find a view, project, stage jump, or
 * a blocked gate to approve, all keyboard-only. Items rebuild on every open (live projects +
 * the current project's manifest) so the list is always honest. Esc closes; ↑/↓ + Enter run.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { Manifest, StageName } from '../lib/types';
import { filterItems, gateItems, projectItems, stageJumpItems, viewItems, wikiItem, type PaletteItem } from '../lib/palette';
import { WIKI_OPEN_EVENT } from './WikiModal';

/** Project.tsx listens for this to switch editor tabs / scroll to a stage card (palette jumps). */
export const EDITOR_JUMP_EVENT = 'vibe:editor-jump';
/** Project.tsx listens for this to reload its manifest after a palette-side mutation. */
export const PROJECT_RELOAD_EVENT = 'vibe:project-reload';

export function CommandPalette({ projectId }: { projectId: string | null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [items, setItems] = useState<PaletteItem[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setCursor(0);
    setNote(null);
  }, []);

  const go = useCallback(
    (hash: string) => {
      location.hash = hash;
      close();
    },
    [close],
  );

  const approve = useCallback(
    (stage: StageName) => {
      if (!projectId) return;
      api
        .approveStage(projectId, stage)
        .then(() => {
          window.dispatchEvent(new CustomEvent(PROJECT_RELOAD_EVENT));
          close();
        })
        .catch((e) => setNote(`✕ ${e instanceof ApiError ? e.message : String(e)}`));
    },
    [projectId, close],
  );

  const jump = useCallback(
    (target: { stage?: StageName; tab?: string }) => {
      window.dispatchEvent(new CustomEvent(EDITOR_JUMP_EVENT, { detail: target }));
      close();
    },
    [close],
  );

  // build items fresh on open — live projects + (when on a cockpit) the manifest's gates/stages
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const base = [
      ...viewItems(go),
      wikiItem(() => {
        window.dispatchEvent(new CustomEvent(WIKI_OPEN_EVENT));
        close();
      }),
    ];
    setItems(base);
    void (async () => {
      const [projectsRes, manifest] = await Promise.all([
        api.projects().catch(() => null),
        projectId ? api.project(projectId).catch(() => null) : Promise.resolve(null as Manifest | null),
      ]);
      if (!alive) return;
      const next: PaletteItem[] = [];
      if (manifest) next.push(...gateItems(manifest, approve), ...stageJumpItems(manifest, jump));
      next.push(...base);
      if (projectsRes) next.push(...projectItems(projectsRes.projects.map((p) => p.project_id), go));
      setItems(next);
    })();
    return () => {
      alive = false;
    };
  }, [open, projectId, go, approve, jump]);

  // global Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Esc closes from anywhere while open (the input handler only covers a focused input)
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, close]);

  // Focus trap: a late-mounting autoFocus elsewhere (e.g. a GateCard's Approve button arriving
  // with the manifest fetch) must not steal typing from an open palette — QA-found (UI-P5).
  useEffect(() => {
    if (!open) return;
    const onFocusIn = (e: FocusEvent) => {
      const overlay = overlayRef.current;
      if (overlay && e.target instanceof Node && !overlay.contains(e.target)) inputRef.current?.focus();
    };
    window.addEventListener('focusin', onFocusIn);
    return () => window.removeEventListener('focusin', onFocusIn);
  }, [open]);

  const visible = useMemo(() => filterItems(items, query).slice(0, 12), [items, query]);
  const clampedCursor = Math.min(cursor, Math.max(0, visible.length - 1));

  // keep the active row in view while arrowing
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-palette-index="${clampedCursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [clampedCursor]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      data-testid="palette-overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', justifyContent: 'center' }}
    >
      <div
        data-testid="palette"
        role="dialog"
        aria-label="Command palette"
        style={{
          marginTop: 110,
          width: 560,
          maxWidth: 'calc(100vw - 40px)',
          alignSelf: 'flex-start',
          background: 'var(--surface-1)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-md, 10px)',
          boxShadow: '0 18px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        <input
          ref={inputRef}
          data-testid="palette-input"
          autoFocus // keyboard-first: typing must work the instant the palette opens
          value={query}
          placeholder="Type a command — approve a gate, jump to a stage, open a project…"
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              close();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, visible.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              visible[clampedCursor]?.run();
            }
          }}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: 'transparent',
            color: 'var(--secondary)',
            border: 'none',
            borderBottom: '1px solid var(--hairline)',
            outline: 'none',
            padding: '13px 16px',
            fontSize: 14.5,
            fontFamily: 'inherit',
          }}
        />
        {note && (
          <div className="mono" style={{ color: 'var(--danger)', fontSize: 12, padding: '8px 16px' }}>
            {note}
          </div>
        )}
        <div ref={listRef} style={{ maxHeight: 380, overflow: 'auto', padding: 6 }}>
          {visible.length === 0 && (
            <div style={{ color: 'var(--muted)', fontSize: 13, padding: '14px 12px' }}>No match — try a view, stage or project name.</div>
          )}
          {visible.map((item, i) => {
            const active = i === clampedCursor;
            return (
              <button
                key={item.id}
                data-testid="palette-item"
                data-palette-id={item.id}
                data-palette-index={i}
                onClick={() => item.run()}
                onPointerEnter={() => setCursor(i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  textAlign: 'left',
                  background: active ? 'var(--surface-2)' : 'transparent',
                  color: 'var(--secondary)',
                  border: 'none',
                  borderLeft: `3px solid ${active ? 'var(--accent)' : 'transparent'}`,
                  borderRadius: 6,
                  padding: '8px 10px',
                  fontSize: 13.5,
                  cursor: 'pointer',
                }}
              >
                <span aria-hidden style={{ width: 16, textAlign: 'center', color: 'var(--muted)' }}>
                  {item.group === 'gate' ? '🔒' : item.group === 'view' ? '▤' : item.group === 'project' ? '▣' : '↪'}
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: item.group === 'gate' ? 700 : 500 }}>
                  {item.title}
                </span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {item.hint}
                </span>
                {active && (
                  <span className="mono" aria-hidden style={{ fontSize: 11, color: 'var(--muted)' }}>
                    ⏎
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div
          className="mono"
          style={{ borderTop: '1px solid var(--hairline)', color: 'var(--muted)', fontSize: 10.5, padding: '7px 16px', display: 'flex', gap: 14 }}
        >
          <span>↑↓ choose</span>
          <span>⏎ run</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
