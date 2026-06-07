/**
 * UIP6.8 — the capability wiki modal (D11, BOTH creation modes): a searchable, read-only view of
 * CAPABILITIES.md (§0–§17, parsed live by the server — never a forked copy) + the whitelisted deep
 * guides. Its ONLY action is "Ask the agent about this", which PREFILLS the composer and never
 * auto-sends (§8 fence: the wiki never executes a CLI, never POSTs anywhere).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { fuzzyScore } from '../lib/palette';
import { inlineText, parseMarkdown } from '../lib/markdown';
import type { WikiSection } from '../lib/types';
import { Markdown } from './Markdown';

/** Anything (top bar, palette, chooser) can open the wiki by dispatching this. */
export const WIKI_OPEN_EVENT = 'vibe:wiki-open';
/** AgentPanel listens: prefill the composer with text (never auto-send). */
export const COMPOSER_PREFILL_EVENT = 'vibe:composer-prefill';

/** Deep-guide references found inside a section's text (whitelisted docs only — server re-checks). */
export function guideLinks(md: string): string[] {
  const out = new Set<string>();
  for (const m of md.matchAll(/capabilities\/[\w-]+\/[\w./-]+\.md/g)) {
    if (m[0]) out.add(m[0]);
  }
  return [...out];
}

export function WikiModal({ projectId }: { projectId: string | null }) {
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<WikiSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [doc, setDoc] = useState<{ path: string; md: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setDoc(null);
  }, []);

  // open from anywhere (top bar 📖 / palette / chooser link)
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(WIKI_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(WIKI_OPEN_EVENT, onOpen);
  }, []);

  // fetch fresh on every open — CAPABILITIES.md is the live source of truth
  useEffect(() => {
    if (!open) return;
    let alive = true;
    api
      .wiki()
      .then((r) => {
        if (!alive) return;
        setSections(r.sections);
        setError(null);
        setSelected((cur) => cur ?? r.sections[0]?.id ?? null);
      })
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [open]);

  // Esc closes; focus trap per the UI-P5 pattern of record (CommandPalette)
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onFocusIn = (e: FocusEvent) => {
      const overlay = overlayRef.current;
      if (overlay && e.target instanceof Node && !overlay.contains(e.target)) inputRef.current?.focus();
    };
    window.addEventListener('keydown', onEsc);
    window.addEventListener('focusin', onFocusIn);
    return () => {
      window.removeEventListener('keydown', onEsc);
      window.removeEventListener('focusin', onFocusIn);
    };
  }, [open, close]);

  // search corpus: title + flattened body text per section
  const filtered = useMemo(() => {
    if (!sections) return [];
    if (!query.trim()) return sections;
    return sections
      .map((s) => ({ s, score: fuzzyScore(query, `${s.title} ${inlineText(parseMarkdown(s.md).flatMap((b) => ('inline' in b ? b.inline : [])))}`) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.s);
  }, [sections, query]);

  const current = sections?.find((s) => s.id === selected) ?? filtered[0] ?? null;
  const guides = useMemo(() => (current ? guideLinks(current.md) : []), [current]);

  const askAgent = useCallback(() => {
    if (!current) return;
    // strip the section numbering + status glyphs — the prefill should read like a human ask
    const subject = current.title
      .replace(/^\d+\.\s*/, '')
      .replace(/[✅🔗🧭✂🟡⚪]/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    window.dispatchEvent(
      new CustomEvent(COMPOSER_PREFILL_EVENT, {
        detail: { text: `Explain how to use ${subject} on this project, with a concrete example.` },
      }),
    );
    close();
  }, [current, close]);

  const openGuide = useCallback((p: string) => {
    api
      .wikiDoc(p)
      .then((r) => setDoc({ path: p, md: r.md }))
      .catch((e) => setDoc({ path: p, md: `_Could not load ${p}: ${e instanceof ApiError ? e.message : String(e)}_` }));
  }, []);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      data-testid="wiki-overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
    >
      <div
        data-testid="wiki-modal"
        role="dialog"
        aria-label="Capability wiki"
        style={{
          width: 920,
          maxWidth: 'calc(100vw - 40px)',
          height: 'min(640px, calc(100vh - 60px))',
          background: 'var(--surface-1)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-md, 10px)',
          boxShadow: '0 18px 60px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--hairline)' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>📖 Capability wiki</span>
          <span style={{ color: 'var(--muted)', fontSize: 11.5 }} className="mono">
            CAPABILITIES.md · read-only
          </span>
          <input
            ref={inputRef}
            autoFocus
            data-testid="wiki-search"
            value={query}
            placeholder="Search capabilities…"
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, background: 'var(--surface-2)', color: 'var(--secondary)', border: '1px solid var(--hairline)', borderRadius: 999, padding: '6px 14px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
          />
          <button onClick={close} aria-label="Close wiki" data-testid="wiki-close" style={{ background: 'transparent', color: 'var(--muted)', border: 'none', fontSize: 16, padding: 4 }}>
            ✕
          </button>
        </div>

        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 13, padding: 16 }}>✕ {error}</div>
        )}
        {!sections && !error && <div style={{ color: 'var(--muted)', fontSize: 13, padding: 16 }}>Loading…</div>}

        {sections && (
          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <nav aria-label="Wiki sections" style={{ width: 250, flex: '0 0 250px', overflow: 'auto', borderRight: '1px solid var(--hairline)', padding: 8 }}>
              {filtered.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 12.5, padding: 10 }}>No match.</div>}
              {filtered.map((s) => (
                <button
                  key={s.id}
                  data-wiki-section={s.id}
                  onClick={() => {
                    setSelected(s.id);
                    setDoc(null);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: current?.id === s.id && !doc ? 'var(--surface-2)' : 'transparent',
                    color: current?.id === s.id && !doc ? 'var(--secondary)' : 'var(--muted)',
                    border: 'none',
                    borderLeft: `3px solid ${current?.id === s.id && !doc ? 'var(--accent)' : 'transparent'}`,
                    borderRadius: 6,
                    padding: '7px 10px',
                    fontSize: 12.5,
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={s.title}
                >
                  {s.title}
                </button>
              ))}
            </nav>

            <div data-testid="wiki-content" style={{ flex: 1, overflow: 'auto', padding: '6px 20px 20px' }}>
              {doc ? (
                <>
                  <button onClick={() => setDoc(null)} data-testid="wiki-doc-back" style={ghostBtn}>
                    ◀ back to {current?.title ?? 'section'}
                  </button>
                  <div className="mono" style={{ color: 'var(--muted)', fontSize: 11, margin: '10px 0 2px' }}>{doc.path}</div>
                  <Markdown md={doc.md} />
                </>
              ) : current ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 2px', flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, flex: 1, minWidth: 200 }}>{current.title}</h2>
                    {projectId && (
                      <button onClick={askAgent} data-testid="wiki-ask-agent" style={ghostBtn} title="Prefills the agent composer — nothing is sent until you press Send">
                        💬 Ask the agent about this
                      </button>
                    )}
                  </div>
                  <Markdown md={current.md} />
                  {guides.length > 0 && (
                    <div style={{ marginTop: 16, borderTop: '1px solid var(--hairline)', paddingTop: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Deep guides
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {guides.map((g) => (
                          <button key={g} className="mono" data-wiki-doc={g} onClick={() => openGuide(g)} style={{ ...ghostBtn, fontSize: 11.5 }}>
                            📄 {g}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: 'var(--muted)', fontSize: 13, padding: 16 }}>Pick a section.</div>
              )}
            </div>
          </div>
        )}

        <div className="mono" style={{ borderTop: '1px solid var(--hairline)', color: 'var(--muted)', fontSize: 10.5, padding: '7px 16px', display: 'flex', gap: 14 }}>
          <span>esc close</span>
          <span>read-only — the agent runs capabilities, the wiki only explains them</span>
        </div>
      </div>
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--secondary)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-sm)',
  padding: '5px 11px',
  fontWeight: 600,
  fontSize: 12.5,
};
