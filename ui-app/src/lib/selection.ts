/**
 * lib/selection.ts — UIP5.5: the editor↔agent selection bridge (doc 11 §7 idea 2). The fine-tune
 * editor publishes what's selected (a word, segment, scene or audio track); the agent composer
 * shows it as a context chip and sends it BY VALUE inside the next message — the agent gets plain
 * text, no hidden channel. A tiny module store + window event keeps the two panels decoupled.
 */
import { useEffect, useState } from 'react';

export interface SelectionCtx {
  project: string;
  kind: 'word' | 'segment' | 'scene' | 'audio';
  /** short chip text, e.g. `word "sværme"` */
  label: string;
  /** the precise context the agent needs, e.g. timing + file */
  detail: string;
}

const EVENT = 'vibe:selection';
let current: SelectionCtx | null = null;

export function setSelection(s: SelectionCtx | null): void {
  current = s;
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getSelection(): SelectionCtx | null {
  return current;
}

/** Live subscription — re-renders when the fine-tune editor changes the selection. */
export function useSelection(project: string): SelectionCtx | null {
  const [sel, setSel] = useState<SelectionCtx | null>(current);
  useEffect(() => {
    const on = () => setSel(current);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return sel && sel.project === project ? sel : null;
}

/** The by-value prefix prepended to the outgoing agent message. */
export function formatSelectionForAgent(s: SelectionCtx): string {
  return `[Selected in the editor: ${s.kind} ${s.label} — ${s.detail}]`;
}
