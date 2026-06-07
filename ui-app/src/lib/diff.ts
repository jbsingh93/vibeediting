/**
 * lib/diff.ts — UIP5.5: inline agent-edit diffs (doc 11 §7 idea 4). When a fine-tune doc changes
 * on disk UNDER the open editor (the agent rewrote it), we show exactly what changed — field by
 * field — so the user can accept theirs or keep their own. Pure structural diff over JSON values
 * with caption/segment-aware labels; generic dotted paths otherwise. Unit-tested, no DOM.
 */

export interface DiffRow {
  /** doc basename, e.g. captions.json */
  doc: string;
  /** human label, e.g. `word 3 "overtager" startMs` */
  label: string;
  mine: string;
  theirs: string;
}

const MAX_ROWS_PER_DOC = 40;

function show(v: unknown): string {
  if (v === undefined) return '—';
  if (typeof v === 'string') return v.length > 40 ? `${v.slice(0, 37)}…` : v;
  return JSON.stringify(v);
}

/** Generic deep diff → dotted-path rows. Arrays compare by index; length changes get one row. */
function deepDiff(doc: string, a: unknown, b: unknown, path: string, rows: DiffRow[]): void {
  if (rows.length >= MAX_ROWS_PER_DOC) return;
  if (Object.is(a, b)) return;
  const aObj = a !== null && typeof a === 'object';
  const bObj = b !== null && typeof b === 'object';
  if (!aObj || !bObj) {
    if (JSON.stringify(a) !== JSON.stringify(b)) rows.push({ doc, label: path || '(value)', mine: show(a), theirs: show(b) });
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) rows.push({ doc, label: `${path || '(list)'} length`, mine: String(a.length), theirs: String(b.length) });
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) deepDiff(doc, a[i], b[i], `${path}[${i}]`, rows);
    return;
  }
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  for (const k of keys) {
    deepDiff(doc, (a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k, rows);
  }
}

interface WordLike {
  text?: string;
  startMs?: number;
  endMs?: number;
}

/** Caption-aware diff: rows like `word 2 "sværme" startMs 700 → 950` instead of `[2].startMs`. */
function captionDiff(doc: string, mine: WordLike[], theirs: WordLike[], rows: DiffRow[]): void {
  if (mine.length !== theirs.length) {
    rows.push({ doc, label: 'word count', mine: String(mine.length), theirs: String(theirs.length) });
  }
  const n = Math.min(mine.length, theirs.length);
  for (let i = 0; i < n && rows.length < MAX_ROWS_PER_DOC; i++) {
    const a = mine[i]!;
    const b = theirs[i]!;
    const name = `word ${i} "${a.text ?? b.text ?? ''}"`;
    for (const f of ['text', 'startMs', 'endMs'] as const) {
      if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) {
        rows.push({ doc, label: `${name} ${f}`, mine: show(a[f]), theirs: show(b[f]) });
      }
    }
  }
}

function isWordArray(v: unknown): v is WordLike[] {
  return Array.isArray(v) && v.every((w) => w !== null && typeof w === 'object' && 'startMs' in (w as object));
}

/** Diff one doc (by basename) — caption files get word-aware labels, everything else dotted paths. */
export function diffDoc(doc: string, mine: unknown, theirs: unknown): DiffRow[] {
  const rows: DiffRow[] = [];
  if (isWordArray(mine) && isWordArray(theirs)) captionDiff(doc, mine, theirs, rows);
  else deepDiff(doc, mine, theirs, '', rows);
  return rows;
}

/** Diff every doc present in either map. `mine` = the editor's serialized state, `theirs` = disk. */
export function diffDocs(mine: Record<string, unknown>, theirs: Record<string, unknown>): DiffRow[] {
  const rows: DiffRow[] = [];
  const names = new Set([...Object.keys(mine), ...Object.keys(theirs)]);
  for (const name of names) {
    if (!(name in mine)) rows.push({ doc: name, label: '(new file)', mine: '—', theirs: 'created on disk' });
    else if (!(name in theirs)) rows.push({ doc: name, label: '(file)', mine: 'in editor', theirs: 'deleted on disk' });
    else rows.push(...diffDoc(name, mine[name], theirs[name]));
  }
  return rows;
}
