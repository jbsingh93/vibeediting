/**
 * lib/palette.ts — UIP5.1: the command palette's pure logic (fuzzy filter + item builders).
 *
 * The palette is keyboard-first power UX: Ctrl+K from anywhere → type → Enter. Items are built
 * fresh each time it opens (live projects list + the current project's manifest), so a gate that
 * just unblocked appears and one that was approved disappears. All builders take injected
 * callbacks — unit-testable without a DOM.
 */
import type { Manifest, Stage, StageName } from './types';
import { STAGE_ORDER } from './types';
import { blockedGates } from './gate';

export type PaletteGroup = 'gate' | 'view' | 'project' | 'stage' | 'action';

export interface PaletteItem {
  id: string;
  title: string;
  /** small right-aligned context label, e.g. "view" / "gate" / a project id */
  hint: string;
  group: PaletteGroup;
  run: () => void;
}

/** Group order in the list: gates ("needs me") always first, then views/actions, then jumps. */
const GROUP_RANK: Record<PaletteGroup, number> = { gate: 0, action: 1, view: 2, stage: 3, project: 4 };

/**
 * Subsequence fuzzy score. 0 = no match. Higher = better: consecutive matched runs and
 * word-start hits score more; earlier first-match breaks ties. Case/diacritic-insensitive
 * enough for Nordic text (lowercases only — Danish/Nordic diacritics match themselves).
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 1; // empty query matches everything equally
  const t = text.toLowerCase();
  let score = 0;
  let ti = 0;
  let prevHit = -2;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi]!;
    if (c === ' ') {
      prevHit = -2; // a space resets the run; both words must still match in order
      continue;
    }
    const found = t.indexOf(c, ti);
    if (found === -1) return 0;
    score += 1;
    if (found === prevHit + 1) score += 2; // consecutive run
    if (found === 0 || t[found - 1] === ' ' || t[found - 1] === '-' || t[found - 1] === '/') score += 3; // word start
    prevHit = found;
    ti = found + 1;
  }
  // earlier overall match is slightly better (so "que" prefers "Queue" over "demo-queue-x")
  const first = t.indexOf(q[0]!);
  return score + Math.max(0, 10 - first) / 10;
}

/** Filter + rank: score desc within group rank asc; zero-score items drop. Stable for ties. */
export function filterItems(items: PaletteItem[], query: string): PaletteItem[] {
  const scored = items
    .map((item, i) => ({ item, i, score: fuzzyScore(query, `${item.title} ${item.hint}`) }))
    .filter((s) => s.score > 0);
  scored.sort((a, b) => {
    const g = GROUP_RANK[a.item.group] - GROUP_RANK[b.item.group];
    if (g !== 0) return g;
    if (b.score !== a.score) return b.score - a.score;
    return a.i - b.i;
  });
  return scored.map((s) => s.item);
}

// ── item builders ────────────────────────────────────────────────────────────────

export function viewItems(go: (hash: string) => void): PaletteItem[] {
  const views: { id: string; title: string; hash: string }[] = [
    { id: 'view-home', title: 'Projects (home)', hash: '#/' },
    // UIP6.1/6.10 — the creation split: both modes directly reachable (keyboard-first)
    { id: 'view-new', title: 'New project (wizard)…', hash: '#/new/wizard' },
    { id: 'view-new-agent', title: 'New project (agent mode)…', hash: '#/new/agent' },
    { id: 'view-finetune', title: 'Fine-tune editor', hash: '#/finetune' },
    { id: 'view-keys', title: 'API keys', hash: '#/keys' },
    { id: 'view-brand', title: 'Brand', hash: '#/brand' },
    { id: 'view-queue', title: 'Render queue', hash: '#/queue' },
    { id: 'view-health', title: 'System health', hash: '#/health' },
  ];
  return views.map((v) => ({ id: v.id, title: v.title, hint: 'view', group: 'view', run: () => go(v.hash) }));
}

/** UIP6.8 — the capability wiki opens by event (it's a modal, not a route). */
export function wikiItem(openWiki: () => void): PaletteItem {
  return { id: 'view-wiki', title: 'View: Capability wiki', hint: 'view', group: 'view', run: openWiki };
}

export function projectItems(ids: string[], go: (hash: string) => void): PaletteItem[] {
  return ids.map((p) => ({
    id: `project-${p}`,
    title: `Open ${p}`,
    hint: 'project',
    group: 'project',
    run: () => go(`#/project/${encodeURIComponent(p)}`),
  }));
}

/** Blocked gates on the current project — the keyboard gate-approval path. */
export function gateItems(m: Manifest, approve: (stage: StageName) => void): PaletteItem[] {
  return blockedGates(m).map((stage) => ({
    id: `gate-${stage}`,
    title: `Approve gate: ${stage}`,
    hint: m.project_id,
    group: 'gate',
    run: () => approve(stage),
  }));
}

/** Jump to a stage card / editor tab on the current project's cockpit. */
export function stageJumpItems(m: Manifest, jump: (target: { stage?: StageName; tab?: string }) => void): PaletteItem[] {
  const stages = m.stages as Record<string, Stage | undefined>;
  const present = STAGE_ORDER.filter((s) => stages[s]);
  const stageItems: PaletteItem[] = present.map((stage) => ({
    id: `stage-${stage}`,
    title: `Jump to stage: ${stage}`,
    hint: stages[stage]!.status,
    group: 'stage',
    run: () => jump({ stage }),
  }));
  const tabs: PaletteItem[] = ['overview', 'plan', 'brief', 'preview', 'finetune', 'qa', 'deliver', 'budget', 'graph'].map((tab) => ({
    id: `tab-${tab}`,
    title: `Editor tab: ${tab === 'qa' ? 'QA / Verify' : tab === 'graph' ? 'Graph (advanced)' : tab}`,
    hint: m.project_id,
    group: 'stage',
    run: () => jump({ tab }),
  }));
  return [...stageItems, ...tabs];
}
