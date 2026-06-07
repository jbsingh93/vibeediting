/** Tri-panel layout presets (doc 11 §5) — pure CSS-grid column templates over the same 3 panels. */
export type LayoutMode = 'A' | 'B' | 'C' | 'D';

export interface Cols {
  assets: string;
  agent: string;
  editor: string;
}

export const LAYOUT_LABELS: Record<LayoutMode, string> = {
  A: 'Balanced',
  B: 'Conversation',
  C: 'Editor',
  D: 'Focus',
};

export function layoutColumns(mode: LayoutMode): Cols {
  switch (mode) {
    case 'A': // balanced 22/38/40
      return { assets: 'minmax(200px, 0.85fr)', agent: 'minmax(0, 1.35fr)', editor: 'minmax(0, 1.5fr)' };
    case 'B': // conversation — editor collapses
      return { assets: 'minmax(180px, 0.7fr)', agent: 'minmax(0, 2fr)', editor: '0' };
    case 'C': // editor — agent shrinks to a rail
      return { assets: 'minmax(180px, 0.7fr)', agent: 'minmax(0, 0.7fr)', editor: 'minmax(0, 2.4fr)' };
    case 'D': // focus/theater — editor only
      return { assets: '0', agent: '0', editor: '1fr' };
  }
}
