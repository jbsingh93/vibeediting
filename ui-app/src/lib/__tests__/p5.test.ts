/**
 * Ported from the parent p5-pure.test.ts: palette fuzzy filter + item builders, node-graph layout,
 * compare-wipe math + URL mapping, the agent-edit diff, and the selection bridge formatting.
 * (selection.ts pulls React for its hooks; only the pure formatSelectionForAgent is exercised.)
 * The "sværme" fixture is kept on purpose — a diacritics robustness fixture (per task §4).
 */
import { describe, it, expect } from 'vitest';
import { fuzzyScore, filterItems, viewItems, projectItems, gateItems, stageJumpItems, type PaletteItem } from '../palette';
import { buildGraph, edgePath, rawJson, NODE_W, NODE_H, PAD, GAP_X } from '../graph';
import { videoOutput, mediaUrl, comparePair, clampWipe, driftCorrection } from '../compare';
import { diffDoc, diffDocs } from '../diff';
import { formatSelectionForAgent } from '../selection';
import type { Manifest, VersionRecord } from '../types';

function mkManifest(): Manifest {
  return {
    schema_version: 1,
    project_id: 'p5-demo',
    status: 'blocked',
    created_at: '2026-06-06T08:00:00Z',
    updated_at: '2026-06-06T08:10:00Z',
    inputs: { format: '9:16-ad', lang: 'da' },
    stages: {
      ingest: { status: 'complete', params: {}, outputs: ['out/work/p5-demo/ingest/captions.json'], attempts: 1 },
      audio: { status: 'complete', params: {}, outputs: [], attempts: 1 },
      color: { status: 'running', params: {}, outputs: [], attempts: 1 },
      motion: { status: 'blocked', params: {}, outputs: ['out/work/p5-demo/motion/preview.mp4'], attempts: 1 },
      deliver: { status: 'pending', params: {}, outputs: [], attempts: 0 },
    },
    approvals_required: ['motion', 'deliver'],
    retry_policy: { max_retries: 2 },
    notes: '',
  } as unknown as Manifest;
}

// ── palette ───────────────────────────────────────────────────────────────────

describe('fuzzyScore', () => {
  it('empty query matches everything', () => {
    expect(fuzzyScore('', 'anything')).toBeGreaterThan(0);
  });
  it('subsequence matches; missing chars do not', () => {
    expect(fuzzyScore('quu', 'Render queue')).toBeGreaterThan(0);
    expect(fuzzyScore('xyz', 'Render queue')).toBe(0);
  });
  it('word-start + consecutive runs beat scattered matches', () => {
    expect(fuzzyScore('que', 'Render queue')).toBeGreaterThan(fuzzyScore('que', 'unique pasted text'));
  });
  it('is case-insensitive and survives Danish glyphs', () => {
    expect(fuzzyScore('FØLG', 'følg med')).toBeGreaterThan(0);
  });
});

describe('filterItems', () => {
  const mk = (id: string, title: string, group: PaletteItem['group']): PaletteItem => ({ id, title, hint: '', group, run: () => undefined });
  it('gates always rank before views/projects regardless of score', () => {
    const items = [mk('p', 'Open approve-me', 'project'), mk('g', 'Approve gate: motion', 'gate'), mk('v', 'Approve-ish view', 'view')];
    const out = filterItems(items, 'approve');
    expect(out[0]!.id).toBe('g');
  });
  it('drops zero-score items and keeps stable order on ties', () => {
    const items = [mk('a', 'Alpha', 'view'), mk('b', 'Beta', 'view')];
    expect(filterItems(items, 'zzz')).toEqual([]);
    expect(filterItems(items, '').map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('palette builders', () => {
  it('viewItems navigate to their hash', () => {
    const gone: string[] = [];
    const items = viewItems((h) => gone.push(h));
    items.find((i) => i.id === 'view-queue')!.run();
    expect(gone).toEqual(['#/queue']);
    expect(items.every((i) => i.group === 'view')).toBe(true);
  });
  it('projectItems encode the id into the hash', () => {
    const gone: string[] = [];
    projectItems(['min film'], (h) => gone.push(h))[0]!.run();
    expect(gone[0]).toBe('#/project/min%20film');
  });
  it('gateItems lists ONLY blocked gates (keyboard gate-approval)', () => {
    const m = mkManifest();
    const approved: string[] = [];
    const items = gateItems(m, (s) => approved.push(s));
    expect(items.map((i) => i.id)).toEqual(['gate-motion']); // deliver is a gate but pending, color runs but isn't a gate
    items[0]!.run();
    expect(approved).toEqual(['motion']);
  });
  it('stageJumpItems covers recorded stages + editor tabs', () => {
    const m = mkManifest();
    const jumps: unknown[] = [];
    const items = stageJumpItems(m, (t) => jumps.push(t));
    expect(items.find((i) => i.id === 'stage-motion')).toBeTruthy();
    expect(items.find((i) => i.id === 'stage-vfx')).toBeUndefined(); // not recorded on the manifest
    items.find((i) => i.id === 'tab-graph')!.run();
    expect(jumps).toEqual([{ tab: 'graph' }]);
  });
});

// ── node graph ───────────────────────────────────────────────────────────────

describe('buildGraph', () => {
  it('lays out recorded stages in canonical order, wrapping rows', () => {
    const g = buildGraph(mkManifest(), 4);
    expect(g.nodes.map((n) => n.id)).toEqual(['ingest', 'audio', 'color', 'motion', 'deliver']);
    expect(g.nodes[0]).toMatchObject({ x: PAD, y: PAD, status: 'complete', gate: false });
    expect(g.nodes[3]!.x).toBe(PAD + 3 * (NODE_W + GAP_X)); // 4th column
    expect(g.nodes[4]!.x).toBe(PAD); // wrapped to row 2
    expect(g.nodes[4]!.y).toBeGreaterThan(PAD);
    expect(g.nodes[3]!.gate).toBe(true);
  });
  it('edges connect consecutive stages; the wrap edge elbows', () => {
    const g = buildGraph(mkManifest(), 4);
    expect(g.edges).toHaveLength(4);
    const wrap = g.edges[3]!;
    expect(wrap.wrap).toBe(true);
    expect(edgePath(wrap)).toContain('L'); // elbow path
    const straight = g.edges[0]!;
    expect(straight.wrap).toBe(false);
    expect(edgePath(straight)).toBe(`M ${straight.x1} ${straight.y1} L ${straight.x2} ${straight.y2}`);
    expect(straight.y1).toBe(PAD + NODE_H / 2);
  });
  it('empty manifest → empty graph with sane bounds', () => {
    const m = mkManifest();
    (m as { stages: Record<string, unknown> }).stages = {};
    const g = buildGraph(m);
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
    expect(g.width).toBeGreaterThan(0);
  });
});

describe('rawJson', () => {
  it('scopes to one stage when selected, whole manifest otherwise', () => {
    const m = mkManifest();
    expect(rawJson(m, 'motion')).toContain('"motion"');
    expect(rawJson(m, 'motion')).not.toContain('"ingest"');
    expect(rawJson(m, null)).toContain('"project_id"');
  });
});

// ── compare wipe ─────────────────────────────────────────────────────────────

describe('videoOutput + mediaUrl', () => {
  it('picks the first video file among outputs', () => {
    expect(videoOutput(['a.json', 'b.mp4', 'c.mov'])).toBe('b.mp4');
    expect(videoOutput(['a.json'])).toBeNull();
  });
  it('maps out/work + public paths (both slash styles) onto the served mounts', () => {
    expect(mediaUrl('C:\\repo\\out\\work\\p\\motion\\clip-v1.mp4')).toBe('/work/p/motion/clip-v1.mp4');
    expect(mediaUrl('out/work/p/motion/clip.mp4')).toBe('/work/p/motion/clip.mp4');
    expect(mediaUrl('C:/repo/public/giveaway/stitched.mp4')).toBe('/giveaway/stitched.mp4');
    expect(mediaUrl('test-video/p/final.mp4')).toBeNull(); // not served — honest null
    expect(mediaUrl(null)).toBeNull();
  });
});

describe('comparePair', () => {
  const rec = (v: number, approved: boolean, out: string[]): VersionRecord => ({ v, approved, outputs: out, created_at: '2026-06-06T08:00:00Z' });
  it('null until there are two versions', () => {
    expect(comparePair([rec(1, true, ['out/work/p/m/a.mp4'])])).toBeNull();
  });
  it('A = approved/active, B = newest other; URLs mapped', () => {
    const pair = comparePair([rec(1, true, ['out/work/p/m/v1.mp4']), rec(2, false, ['out/work/p/m/v2.mp4']), rec(3, false, ['out/work/p/m/v3.mp4'])])!;
    expect(pair.a).toMatchObject({ v: 1, approved: true, url: '/work/p/m/v1.mp4' });
    expect(pair.b).toMatchObject({ v: 3, url: '/work/p/m/v3.mp4' }); // newest fork
  });
  it('when v2 is the approved one, it becomes side A', () => {
    const pair = comparePair([rec(1, false, []), rec(2, true, ['out/work/p/m/v2.mp4'])])!;
    expect(pair.a.v).toBe(2);
    expect(pair.b.v).toBe(1);
    expect(pair.b.url).toBeNull(); // no video output → honest placeholder side
  });
});

describe('wipe + sync math', () => {
  it('clampWipe keeps both sides visible', () => {
    expect(clampWipe(-10)).toBe(3);
    expect(clampWipe(50)).toBe(50);
    expect(clampWipe(120)).toBe(97);
  });
  it('driftCorrection snaps only past tolerance', () => {
    expect(driftCorrection(1.0, 1.05)).toBeNull();
    expect(driftCorrection(1.0, 1.2)).toBe(1.0);
  });
});

// ── diff + selection ───────────────────────────────────────────────────────────

describe('diffDoc', () => {
  it('caption arrays get word-aware labels', () => {
    const mine = [{ text: 'AI', startMs: 200, endMs: 600 }, { text: 'sværme', startMs: 700, endMs: 1200 }];
    const theirs = [{ text: 'AI', startMs: 200, endMs: 600 }, { text: 'sværme', startMs: 950, endMs: 1200 }];
    const rows = diffDoc('captions.json', mine, theirs);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ doc: 'captions.json', label: 'word 1 "sværme" startMs', mine: '700', theirs: '950' });
  });
  it('word-count changes are one row, not an index storm', () => {
    const mine = [{ text: 'a', startMs: 0, endMs: 100 }];
    const theirs = [{ text: 'a', startMs: 0, endMs: 100 }, { text: 'b', startMs: 200, endMs: 300 }];
    expect(diffDoc('captions.json', mine, theirs)[0]!.label).toBe('word count');
  });
  it('generic docs diff by dotted path (segments, audio-mix, props)', () => {
    const rows = diffDoc(
      'segments.json',
      { fps: 30, segments: [{ id: 'k1', srcStart: 0, srcEnd: 6 }] },
      { fps: 30, segments: [{ id: 'k1', srcStart: 0.4, srcEnd: 6 }] },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe('segments[0].srcStart');
    expect(rows[0]!.theirs).toBe('0.4');
  });
  it('identical docs → no rows', () => {
    expect(diffDoc('props.json', { a: 1 }, { a: 1 })).toEqual([]);
  });
});

describe('diffDocs', () => {
  it('covers new-on-disk and deleted-on-disk files', () => {
    const rows = diffDocs({ 'captions.json': [] }, { 'captions.json': [], 'audio-mix.json': { tracks: [] } });
    expect(rows).toEqual([{ doc: 'audio-mix.json', label: '(new file)', mine: '—', theirs: 'created on disk' }]);
  });
});

describe('formatSelectionForAgent', () => {
  it('sends the context by value, readable as plain text', () => {
    const s = formatSelectionForAgent({ project: 'p', kind: 'word', label: '“sværme”', detail: 'captions.json word 1, on screen 0.70s–1.20s' });
    expect(s).toBe('[Selected in the editor: word “sværme” — captions.json word 1, on screen 0.70s–1.20s]');
  });
});
