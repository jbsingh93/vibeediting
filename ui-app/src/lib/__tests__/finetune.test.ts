/**
 * Ported from the parent p4-pure.test.ts: caption word math, emphasis toggle, align/reset,
 * EDL placement + inverse mapping, audio gain/duck/window/track ops, timeline geometry, the
 * immutable undo/redo stack, and the schema-form generator. The captions.json round-trip uses the
 * REAL captionsSchema from the template payload (the on-disk contract the editor must preserve).
 *
 * Skipped vs parent: sceneBlocks (component SceneTrack) and the p4-routes server helpers
 * (classifyFinetuneDoc / validateFinetuneFile / segmentSources / setHash) — those are server-side
 * and owned by tests/unit, not the ui-app lib.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  ALIGN_SNAP_MS,
  MIN_WORD_MS,
  addTrack,
  alignToVoice,
  applyRemappedWordEdit,
  edlTotalFrames,
  gainDbToAmplitude,
  historyInit,
  historyPush,
  historyRedo,
  historyUndo,
  isEmphasized,
  moveTrack,
  moveWord,
  msToX,
  nudgeSegment,
  placeEdl,
  rangeSpan,
  splitSegment,
  deleteSegment,
  deleteSegments,
  moveSegment,
  insertSegment,
  playheadToSource,
  transitionFrames,
  transitionPresentation,
  effectsPresentation,
  defaultEffect,
  addEffect,
  removeEffect,
  moveEffect,
  updateEffect,
  remapEdlCaptions,
  resetToBaseline,
  resizeWord,
  setTrackDuck,
  setTrackGain,
  snapMs,
  toggleEmphasis,
  trackVolumeAt,
  voWindows,
  pickDefaultRender,
  xToMs,
  type AudioTrack,
  type CaptionWord,
  type EdlSegment,
  type RemappedWord,
} from '../finetune';
import { edlSegmentSchema, segmentsDocSchema, transitionSchema, effectSchema } from '../finetune';
import { findBlockArrays, getAtPath, schemaToFields, setAtPath } from '../schema-form';
import { captionsSchema } from '../../../../template/src/components/captions';
import {
  segmentsDocSchema as templateSegmentsDocSchema,
  placeEdl as templatePlaceEdl,
  transitionFrames as templateTransitionFrames,
  transitionPresentation as templateTransitionPresentation,
  effectsPresentation as templateEffectsPresentation,
} from '../../../../template/src/components/edl';
import type { Effect } from '../finetune';

const W = (text: string, startMs: number, endMs: number): CaptionWord => ({ text, startMs, endMs });

const WORDS: CaptionWord[] = [W('AI', 0, 300), W('tog', 350, 600), W('dit', 650, 900), W('job', 950, 1400)];

// ── caption math ──────────────────────────────────────────────────────────────

describe('moveWord', () => {
  it('shifts start+end together', () => {
    const out = moveWord(WORDS, 1, 30);
    expect(out[1]).toMatchObject({ startMs: 380, endMs: 630 });
    expect(out[0]).toBe(WORDS[0]); // others untouched
  });
  it('clamps at the previous word and at 0', () => {
    expect(moveWord(WORDS, 1, -500)[1]!.startMs).toBe(300); // prev.endMs
    expect(moveWord(WORDS, 0, -500)[0]!.startMs).toBe(0);
  });
  it('clamps at the next word', () => {
    const out = moveWord(WORDS, 1, 5000);
    expect(out[1]!.endMs).toBe(650); // next.startMs
  });
  it('returns the same array when nothing changes', () => {
    expect(moveWord(WORDS, 0, -1)).toBe(WORDS);
  });
});

describe('resizeWord', () => {
  it('drags an edge and keeps the minimum duration', () => {
    const out = resizeWord(WORDS, 1, 'start', 500);
    expect(out[1]!.startMs).toBe(600 - MIN_WORD_MS);
  });
  it('never crosses the neighbour on that side', () => {
    expect(resizeWord(WORDS, 1, 'start', -500)[1]!.startMs).toBe(300);
    expect(resizeWord(WORDS, 1, 'end', 500)[1]!.endMs).toBe(650);
  });
  it('end edge of the last word is free', () => {
    expect(resizeWord(WORDS, 3, 'end', 5000)[3]!.endMs).toBe(6400);
  });
});

describe('emphasis toggle (double-click)', () => {
  it('adds/removes punctuation-insensitively', () => {
    const list = toggleEmphasis([], 'JOB!');
    expect(list).toEqual(['job']);
    expect(isEmphasized(list, 'job,')).toBe(true);
    expect(toggleEmphasis(list, 'Job')).toEqual([]);
  });
  it('matches the comp behaviour for pre-listed variants', () => {
    expect(isEmphasized(['vinder.'], 'vinder')).toBe(true);
  });
});

describe('alignToVoice / resetToBaseline', () => {
  const baseline = [W('AI', 0, 300), W('tog', 400, 600)];
  it('snaps starts to the nearest onset within the window, keeping duration', () => {
    const drifted = [W('AI', 90, 390), W('tog', 480, 680)];
    const out = alignToVoice(drifted, baseline);
    expect(out[0]).toMatchObject({ startMs: 0, endMs: 300 });
    expect(out[1]).toMatchObject({ startMs: 400, endMs: 600 });
  });
  it('leaves words farther than the snap window alone', () => {
    const far = [W('AI', ALIGN_SNAP_MS + 500, ALIGN_SNAP_MS + 800)];
    expect(alignToVoice(far, baseline)[0]!.startMs).toBe(ALIGN_SNAP_MS + 500);
  });
  it('reset restores baseline copies', () => {
    const out = resetToBaseline(baseline);
    expect(out).toEqual(baseline);
    expect(out[0]).not.toBe(baseline[0]);
  });
});

describe('captions.json round-trip preserves captionsSchema (hard requirement)', () => {
  it('edited words still parse and keep timestampMs/confidence', () => {
    const loaded = captionsSchema.parse([
      { text: 'Hej', startMs: 0, endMs: 400, timestampMs: 10, confidence: 0.93 },
      { text: 'verden', startMs: 450, endMs: 900, timestampMs: 460, confidence: 0.88 },
    ]);
    let words: CaptionWord[] = loaded;
    words = moveWord(words, 1, 80);
    words = resizeWord(words, 0, 'end', -50);
    const reparsed = captionsSchema.parse(words);
    expect(reparsed[0]!.timestampMs).toBe(10);
    expect(reparsed[1]!.confidence).toBe(0.88);
    expect(reparsed[1]!.startMs).toBe(530);
    // no extra keys leak into the saved JSON
    expect(Object.keys(words[1]!).sort()).toEqual(['confidence', 'endMs', 'startMs', 'text', 'timestampMs']);
  });
});

// ── EDL math ─────────────────────────────────────────────────────────────────

const SEGS: EdlSegment[] = [
  { id: 'a', srcStart: 10, srcEnd: 12 },
  { id: 'b', srcStart: 20, srcEnd: 23 },
];

describe('placeEdl / edlTotalFrames', () => {
  it('mirrors the comps: crossfade overlaps consecutive segments', () => {
    const placed = placeEdl(SEGS, 30, 8);
    expect(placed[0]).toMatchObject({ from: 0, durationInFrames: 60 });
    expect(placed[1]).toMatchObject({ from: 52, durationInFrames: 90 });
    expect(edlTotalFrames(SEGS, 30, 8)).toBe(142);
  });
});

describe('nudgeSegment', () => {
  it('nudges with 0.01 precision and keeps the minimum body', () => {
    expect(nudgeSegment(SEGS, 0, 'srcStart', 0.05)[0]!.srcStart).toBe(10.05);
    expect(nudgeSegment(SEGS, 0, 'srcStart', 99)[0]!.srcStart).toBe(11.8); // srcEnd - 0.2
    expect(nudgeSegment(SEGS, 0, 'srcEnd', -99)[0]!.srcEnd).toBe(10.2);
  });
  it('srcStart never below 0', () => {
    expect(nudgeSegment(SEGS, 0, 'srcStart', -99)[0]!.srcStart).toBe(0);
  });
});

describe('remapEdlCaptions + inverse mapping', () => {
  const sources = {
    '': [W('inde', 10_500, 10_900), W('ude', 15_000, 15_400), W('to', 20_500, 21_000)],
  };
  it('projects only kept words onto the output timeline, tagged with their source index', () => {
    const placed = placeEdl(SEGS, 30, 8);
    const out = remapEdlCaptions(placed, 30, sources);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ text: 'inde', startMs: 500, srcIndex: 0, segIndex: 0 });
    // segment b starts at frame 52 → 1733.3ms; word at src 20.5s = +0.5s into b
    expect(Math.round(out[1]!.startMs)).toBe(Math.round((52 / 30) * 1000 + 500));
    expect(out[1]!.srcIndex).toBe(2);
  });
  it('multi-source EDLs only pull words from the segment’s own caption set', () => {
    const multi = placeEdl(
      [
        { id: 'x', srcStart: 10, srcEnd: 12, cap: 'v1' },
        { id: 'y', srcStart: 10, srcEnd: 12, cap: 'v2' },
      ],
      30,
      0,
    );
    const out = remapEdlCaptions(multi, 30, { v1: [W('en', 10_100, 10_300)], v2: [W('to', 10_200, 10_400)] });
    expect(out.map((w) => w.text)).toEqual(['en', 'to']);
    expect(out[1]!.capKey).toBe('v2');
  });
  it('an output-time edit lands as the same delta in source time, clamped to the segment window', () => {
    const placed = placeEdl(SEGS, 30, 8);
    const chips = remapEdlCaptions(placed, 30, sources);
    const edited = applyRemappedWordEdit(sources, placed, chips[0]!, { kind: 'move', deltaMs: 200 });
    expect(edited['']![0]!.startMs).toBe(10_700);
    // dragging far left clamps at the segment's kept start (10s)
    const clamped = applyRemappedWordEdit(sources, placed, chips[0]!, { kind: 'move', deltaMs: -5000 });
    expect(clamped['']![0]!.startMs).toBe(10_000);
    // never touches other sets/words
    expect(edited['']![2]).toBe(sources['']![2]);
  });
});

// ── audio math ───────────────────────────────────────────────────────────────

describe('audio: gain, duck, windows, tracks', () => {
  const bgm: AudioTrack = { id: 'bgm-1', role: 'bgm', src: 'p/bgm.mp3', offsetSec: 0, gainDb: -12, duck: { depth: 0.12 } };
  it('gainDb → amplitude', () => {
    expect(gainDbToAmplitude(0)).toBe(1);
    expect(gainDbToAmplitude(-6)).toBeCloseTo(0.501, 2);
  });
  it('voWindows merges adjacent words into speech windows', () => {
    const wins = voWindows([
      { startMs: 0, endMs: 300 },
      { startMs: 400, endMs: 900 }, // gap 0.1s < 0.35 → merged
      { startMs: 3000, endMs: 3500 },
    ]);
    expect(wins).toEqual([
      [0, 0.9],
      [3, 3.5],
    ]);
  });
  it('trackVolumeAt ducks to gain×depth inside a voice window and recovers outside', () => {
    const wins: [number, number][] = [[2, 4]];
    const base = gainDbToAmplitude(-12);
    expect(trackVolumeAt(bgm, wins, 3)).toBeCloseTo(base * 0.12, 5);
    expect(trackVolumeAt(bgm, wins, 10)).toBeCloseTo(base, 5);
    const noDuck = trackVolumeAt({ ...bgm, duck: undefined }, wins, 3);
    expect(noDuck).toBeCloseTo(base, 5);
  });
  it('moveTrack clamps at 0; gain clamps to [-36, +12]; duck off removes the key', () => {
    expect(moveTrack([bgm], 'bgm-1', -5)[0]!.offsetSec).toBe(0);
    expect(setTrackGain([bgm], 'bgm-1', 99)[0]!.gainDb).toBe(12);
    expect(setTrackDuck([bgm], 'bgm-1', null)[0]).not.toHaveProperty('duck');
  });
  it('addTrack de-duplicates ids and gives BGM the house duck by default', () => {
    let tracks = addTrack([], 'bgm', 'p/bed.mp3');
    tracks = addTrack(tracks, 'bgm', 'p/bed.mp3');
    expect(tracks.map((t) => t.id)).toEqual(['bgm-bed', 'bgm-bed-2']);
    expect(tracks[0]!.duck?.depth).toBe(0.12);
    expect(addTrack([], 'sfx', 'p/whoosh.mp3')[0]!.duck).toBeUndefined();
  });
});

// ── geometry + history ─────────────────────────────────────────────────────────

describe('geometry + snapping + history', () => {
  it('msToX/xToMs round-trip at any zoom', () => {
    expect(xToMs(msToX(1234, 80), 80)).toBeCloseTo(1234, 6);
  });
  it('snapMs picks the nearest candidate inside the threshold only', () => {
    expect(snapMs(1010, [1000, 2000], 50)).toBe(1000);
    expect(snapMs(1100, [1000, 2000], 50)).toBe(1100);
  });
  it('undo/redo walk the stack; a new edit clears the future', () => {
    let h = historyInit(1);
    h = historyPush(h, 2);
    h = historyPush(h, 3);
    h = historyUndo(h);
    expect(h.present).toBe(2);
    h = historyRedo(h);
    expect(h.present).toBe(3);
    h = historyUndo(h);
    h = historyPush(h, 9);
    expect(h.future).toEqual([]);
    expect(h.past).toEqual([1, 2]);
  });
});

// ── schema-form generation ──────────────────────────────────────────────────────

describe('schemaToFields (the generated inspector)', () => {
  const scene = z.object({
    kind: z.enum(['hookCard', 'clip']),
    name: z.string(),
    durationSec: z.number(),
    trimSec: z.number().default(0),
    voReady: z.boolean().default(true),
    emphasisWords: z.array(z.string()).optional(),
    pulse: z.object({ cx: z.number(), cy: z.number() }).optional(),
    beats: z.array(z.object({ t: z.number() })).optional(), // array-of-objects → NOT a field
  });
  const json = z.toJSONSchema(scene, { io: 'input' }) as Parameters<typeof schemaToFields>[0];

  it('maps zod types to the right controls and flattens nested objects', () => {
    const fields = schemaToFields(json);
    const byPath = Object.fromEntries(fields.map((f) => [f.path, f.kind]));
    expect(byPath).toMatchObject({
      kind: 'select',
      name: 'text',
      durationSec: 'number',
      trimSec: 'number',
      voReady: 'boolean',
      emphasisWords: 'tags',
      'pulse.cx': 'number',
      'pulse.cy': 'number',
    });
    expect(byPath.beats).toBeUndefined(); // blocks, not a form field
    expect(fields.find((f) => f.path === 'kind')?.options).toEqual(['hookCard', 'clip']);
  });

  it('getAtPath/setAtPath are immutable and dotted', () => {
    const obj = { pulse: { cx: 1, cy: 2 }, name: 'x' };
    expect(getAtPath(obj, 'pulse.cy')).toBe(2);
    const next = setAtPath(obj, 'pulse.cy', 9);
    expect(next.pulse.cy).toBe(9);
    expect(obj.pulse.cy).toBe(2);
  });

  it('findBlockArrays locates the scenes/beats arrays', () => {
    const root = z.toJSONSchema(z.object({ scenes: z.array(scene), musicSrc: z.string() }), { io: 'input' });
    const blocks = findBlockArrays(root as Parameters<typeof findBlockArrays>[0]);
    expect(blocks.map((b) => b.path)).toEqual(['scenes']);
  });
});

// ── render-preview default (Julian 2026-06-07: fine-tune edits the RENDERED versions) ──────────
describe('pickDefaultRender', () => {
  const renders = [
    { url: '/out/p/v1.mp4', mtime: '2026-06-07T10:00:00Z' },
    { url: '/deliver/p/final.mp4', mtime: '2026-06-07T12:00:00Z' },
    { url: '/out/work/p/draft.mp4', mtime: '2026-06-07T11:00:00Z' },
  ];
  it('defaults to the NEWEST render when the data preview has no video of its own', () => {
    expect(pickDefaultRender(false, renders)).toBe('/deliver/p/final.mp4');
  });
  it('stays in data-preview mode when EDL segments / videoSrc can reconstruct the video', () => {
    expect(pickDefaultRender(true, renders)).toBeNull();
  });
  it('returns null when there are no renders yet', () => {
    expect(pickDefaultRender(false, [])).toBeNull();
  });
});

// ── structural verbs (VE.2.1) — split · delete+ripple · reorder ──────────────────────────────
describe('structural verbs', () => {
  const SEGS: EdlSegment[] = [
    { id: 's1', srcStart: 0, srcEnd: 2, src: 'raw/a.mp4', cap: '' },
    { id: 's2', srcStart: 5, srcEnd: 7, src: 'raw/a.mp4', cap: '' },
  ];

  it('splitSegment divides a clip into -a/-b, preserving src/cap, hard-cutting the new edge', () => {
    const out = splitSegment(SEGS, 0, 1.0);
    expect(out.map((s) => s.id)).toEqual(['s1-a', 's1-b', 's2']);
    expect(out[0]).toMatchObject({ srcStart: 0, srcEnd: 1, src: 'raw/a.mp4', cap: '' });
    expect(out[1]).toMatchObject({ srcStart: 1, srcEnd: 2, src: 'raw/a.mp4', cap: '' });
    expect(out[1].transition).toEqual({ kind: 'cut', durationFrames: 0 });
    expect(out[0].transition).toBeUndefined();
  });

  it('splitSegment refuses a cut too close to either edge (returns ===)', () => {
    expect(splitSegment(SEGS, 0, 0.1)).toBe(SEGS); // < MIN_SEGMENT_SEC from start
    expect(splitSegment(SEGS, 0, 1.95)).toBe(SEGS); // < MIN_SEGMENT_SEC from end
    expect(splitSegment(SEGS, 9, 1)).toBe(SEGS); // bad index
  });

  it('a contiguous split leaves the output timeline + caption projection identical (D30)', () => {
    const fps = 30;
    const sources = { '': [W('a', 100, 400), W('b', 1100, 1400), W('c', 5100, 5400)] };
    const before = remapEdlCaptions(placeEdl(SEGS, fps, 0), fps, sources);
    const split = splitSegment(SEGS, 0, 1.0);
    const after = remapEdlCaptions(placeEdl(split, fps, 0), fps, sources);
    expect(edlTotalFrames(split, fps, 0)).toBe(edlTotalFrames(SEGS, fps, 0));
    expect(after.map((w) => w.text)).toEqual(before.map((w) => w.text)); // a,b,c survive
    expect(after.map((w) => Math.round(w.startMs))).toEqual(before.map((w) => Math.round(w.startMs)));
  });

  it('deleteSegment removes a clip but never empties the cut', () => {
    expect(deleteSegment(SEGS, 0).map((s) => s.id)).toEqual(['s2']);
    expect(deleteSegment([SEGS[0]!], 0)).toEqual([SEGS[0]]); // refuse to empty
  });

  it('deleting drops the captions outside the kept windows automatically (D30)', () => {
    const fps = 30;
    const sources = { '': [W('a', 100, 400), W('b', 5100, 5400)] };
    const kept = remapEdlCaptions(placeEdl(deleteSegment(SEGS, 0), fps, 0), fps, sources);
    expect(kept.map((w) => w.text)).toEqual(['b']); // 'a' lived in the deleted s1 → gone
  });

  it('deleteSegments drops a set and never empties; no-op stays ===', () => {
    const three = [...SEGS, { id: 's3', srcStart: 9, srcEnd: 10 }];
    expect(deleteSegments(three, [0, 2]).map((s) => s.id)).toEqual(['s2']);
    expect(deleteSegments(three, [0, 1, 2])).toBe(three); // would empty → refuse
    expect(deleteSegments(three, [])).toBe(three); // no-op
  });

  it('moveSegment reorders, clamps, and no-ops on same index', () => {
    expect(moveSegment(SEGS, 0, 1).map((s) => s.id)).toEqual(['s2', 's1']);
    expect(moveSegment(SEGS, 1, 0).map((s) => s.id)).toEqual(['s2', 's1']);
    expect(moveSegment(SEGS, 0, 0)).toBe(SEGS);
    expect(moveSegment(SEGS, 0, 99).map((s) => s.id)).toEqual(['s2', 's1']); // clamp to last
  });

  it('insertSegment drops a b-roll cutaway after the chosen index with its own src', () => {
    const out = insertSegment(SEGS, 0, { id: 'broll-1', src: 'p/broll.mp4', srcStart: 0, srcEnd: 1.5 });
    expect(out.map((s) => s.id)).toEqual(['s1', 'broll-1', 's2']);
    expect(out[1]).toMatchObject({ id: 'broll-1', src: 'p/broll.mp4', srcStart: 0, srcEnd: 1.5 });
  });

  it('insertSegment prepends with afterIndex -1 and appends past the end', () => {
    expect(insertSegment(SEGS, -1, { id: 'x', src: 'p/x.mp4', srcStart: 0, srcEnd: 1 }).map((s) => s.id)).toEqual([
      'x',
      's1',
      's2',
    ]);
    expect(insertSegment(SEGS, 99, { id: 'y', src: 'p/y.mp4', srcStart: 0, srcEnd: 1 }).map((s) => s.id)).toEqual([
      's1',
      's2',
      'y',
    ]);
  });

  it('inserted cutaway ripples the tail automatically (placeEdl)', () => {
    const out = insertSegment(SEGS, 0, { id: 'b', src: 'p/b.mp4', srcStart: 0, srcEnd: 2 });
    // s1 (2s) + b (2s) + s2 (2s) @30fps crossfade 0 = 180 frames
    expect(edlTotalFrames(out, 30, 0)).toBe(180);
  });

  it('playheadToSource inverse-maps an output frame to its segment + source second', () => {
    const placed = placeEdl(SEGS, 30, 0); // s1 [0,60), s2 [60,120)
    expect(playheadToSource(placed, 30, 30)).toEqual({ segIndex: 0, atSrcSec: 1 }); // 30f into s1 = 1s src
    expect(playheadToSource(placed, 30, 75)).toEqual({ segIndex: 1, atSrcSec: 5.5 }); // 15f into s2 = 5.5s src
    expect(playheadToSource(placed, 30, 200)).toBeNull(); // past the end
  });
});

// ── typed transitions (VE.4) — per-edge placement + presentation + cross-mirror parity ──────
describe('typed transitions', () => {
  it('transitionFrames: absent ⇒ crossfade default, cut ⇒ 0, typed ⇒ its duration', () => {
    expect(transitionFrames({ id: 'a', srcStart: 0, srcEnd: 1 }, 8)).toBe(8);
    expect(transitionFrames({ id: 'a', srcStart: 0, srcEnd: 1, transition: { kind: 'cut', durationFrames: 0 } }, 8)).toBe(0);
    expect(transitionFrames({ id: 'a', srcStart: 0, srcEnd: 1, transition: { kind: 'slide', durationFrames: 12 } }, 8)).toBe(12);
  });

  it('placeEdl honors per-edge overlaps (cut = no overlap, typed = its frames)', () => {
    const segs: EdlSegment[] = [
      { id: 's1', srcStart: 0, srcEnd: 1 }, // 30f
      { id: 's2', srcStart: 0, srcEnd: 1, transition: { kind: 'cut', durationFrames: 0 } }, // hard cut → no overlap
      { id: 's3', srcStart: 0, srcEnd: 1, transition: { kind: 'wipe', durationFrames: 10 } }, // 10f overlap
    ];
    const placed = placeEdl(segs, 30, 8);
    expect(placed[0].from).toBe(0);
    expect(placed[1].from).toBe(30); // cut: s1 ends at 30, s2 starts at 30
    expect(placed[2].from).toBe(50); // s2 ends at 60, minus 10f wipe overlap = 50
    // total = last.from + last.dur = 50 + 30 = 80
    expect(edlTotalFrames(segs, 30, 8)).toBe(80);
  });

  it('a pre-VE EDL (no transitions) places exactly as the flat crossfade did (regression)', () => {
    const segs: EdlSegment[] = [
      { id: 's1', srcStart: 0, srcEnd: 2 },
      { id: 's2', srcStart: 0, srcEnd: 2 },
      { id: 's3', srcStart: 0, srcEnd: 2 },
    ];
    const placed = placeEdl(segs, 30, 8);
    expect(placed.map((p) => p.from)).toEqual([0, 52, 104]); // 60 - 8 each step
  });

  it('transitionPresentation: each kind maps to deterministic CSS', () => {
    expect(transitionPresentation('cut', undefined, 0.5)).toEqual({ clip: {}, backdrop: 0 });
    expect(transitionPresentation('dissolve', undefined, 0.25)).toEqual({ clip: { opacity: 0.25 }, backdrop: 0 });
    expect(transitionPresentation('fade', undefined, 0.25)).toEqual({ clip: { opacity: 0.25 }, backdrop: 0.75 });
    expect(transitionPresentation('slide', 'l', 0)).toEqual({ clip: { transform: 'translateX(-100%)' }, backdrop: 0 });
    expect(transitionPresentation('slide', 'r', 1)).toEqual({ clip: { transform: 'translateX(0%)' }, backdrop: 0 });
    expect(transitionPresentation('wipe', 'l', 0)).toEqual({ clip: { clipPath: 'inset(0 100% 0 0)' }, backdrop: 0 });
    expect(transitionPresentation('wipe', 'l', 1)).toEqual({ clip: { clipPath: 'inset(0 0% 0 0)' }, backdrop: 0 });
  });

  it('clamps progress outside 0..1', () => {
    expect(transitionPresentation('dissolve', undefined, -0.5).clip.opacity).toBe(0);
    expect(transitionPresentation('dissolve', undefined, 2).clip.opacity).toBe(1);
  });

  it('ui-app and the template render comp produce IDENTICAL transition math (preview == render)', () => {
    const kinds = ['cut', 'dissolve', 'fade', 'slide', 'wipe'] as const;
    const dirs = ['l', 'r', 'u', 'd', undefined] as const;
    for (const k of kinds) {
      for (const d of dirs) {
        for (const p of [0, 0.33, 0.5, 0.8, 1]) {
          expect(transitionPresentation(k, d, p)).toEqual(templateTransitionPresentation(k, d, p));
        }
      }
    }
    const segs: EdlSegment[] = [
      { id: 's1', srcStart: 0, srcEnd: 1 },
      { id: 's2', srcStart: 0, srcEnd: 1, transition: { kind: 'wipe', durationFrames: 10 } },
    ];
    expect(placeEdl(segs, 30, 8).map((p) => p.from)).toEqual(templatePlaceEdl(segs, 30, 8).map((p) => p.from));
    expect(transitionFrames(segs[1], 8)).toBe(templateTransitionFrames(segs[1], 8));
  });
});

// ── per-clip effects (VE.5 / D27) — render math + stack ops + cross-mirror parity ──────────────
describe('per-clip effects', () => {
  it('effectsPresentation: absent / empty stack ⇒ no CSS, playbackRate 1 (backward-compat)', () => {
    expect(effectsPresentation(undefined)).toEqual({ style: {}, playbackRate: 1 });
    expect(effectsPresentation([])).toEqual({ style: {}, playbackRate: 1 });
  });

  it('transform ⇒ translate(px) + scale, composed into one transform string', () => {
    expect(effectsPresentation([{ type: 'transform', scale: 1.2, x: 30, y: -10 }])).toEqual({
      style: { transform: 'translate(30px, -10px) scale(1.2)' },
      playbackRate: 1,
    });
    // neutral transform (scale 1, no translate) emits nothing
    expect(effectsPresentation([{ type: 'transform', scale: 1, x: 0, y: 0 }])).toEqual({ style: {}, playbackRate: 1 });
    // scale-only / translate-only
    expect(effectsPresentation([{ type: 'transform', scale: 2 }]).style.transform).toBe('scale(2)');
    expect(effectsPresentation([{ type: 'transform', x: 12 }]).style.transform).toBe('translate(12px, 0px)');
  });

  it('opacity multiplies into style.opacity', () => {
    expect(effectsPresentation([{ type: 'opacity', value: 0.5 }]).style.opacity).toBe(0.5);
    expect(effectsPresentation([{ type: 'opacity', value: 0.5 }, { type: 'opacity', value: 0.5 }]).style.opacity).toBe(0.25);
  });

  it('speed becomes playbackRate (no CSS); the slot length is unchanged (D33 constant speed)', () => {
    const p = effectsPresentation([{ type: 'speed', rate: 2 }]);
    expect(p.playbackRate).toBe(2);
    expect(p.style).toEqual({});
  });

  it('colorCorrect becomes a CSS filter (brightness/contrast/saturate)', () => {
    expect(effectsPresentation([{ type: 'colorCorrect', brightness: 1.1, contrast: 0.9, saturation: 1.3 }]).style.filter).toBe(
      'brightness(1.1) contrast(0.9) saturate(1.3)',
    );
    // partial colorCorrect ⇒ the omitted multipliers default to 1
    expect(effectsPresentation([{ type: 'colorCorrect', saturation: 0 }]).style.filter).toBe('brightness(1) contrast(1) saturate(0)');
  });

  it('a lut effect is a no-op at launch (schema-reserved for VE.5.6)', () => {
    expect(effectsPresentation([{ type: 'lut', src: 'luts/teal.cube' }])).toEqual({ style: {}, playbackRate: 1 });
  });

  it('a full ordered stack composes transform + opacity + filter + playbackRate together', () => {
    const p = effectsPresentation([
      { type: 'transform', scale: 1.1, x: 0, y: -20 },
      { type: 'opacity', value: 0.9 },
      { type: 'speed', rate: 1.5 },
      { type: 'colorCorrect', brightness: 1.05, contrast: 1.1, saturation: 1.2 },
    ]);
    expect(p).toEqual({
      style: {
        transform: 'translate(0px, -20px) scale(1.1)',
        opacity: 0.9,
        filter: 'brightness(1.05) contrast(1.1) saturate(1.2)',
      },
      playbackRate: 1.5,
    });
  });

  it('ui-app and the template render comp produce IDENTICAL effect math (preview == render)', () => {
    const fixtures: (Effect[] | undefined)[] = [
      undefined,
      [],
      [{ type: 'transform', scale: 1.25, x: 40, y: -15 }],
      [{ type: 'opacity', value: 0.7 }],
      [{ type: 'speed', rate: 0.5 }],
      [{ type: 'colorCorrect', brightness: 1.2, contrast: 0.8, saturation: 1.4 }],
      [{ type: 'lut', src: 'luts/x.cube' }],
      [
        { type: 'transform', scale: 1.1, x: 10, y: 10 },
        { type: 'opacity', value: 0.8 },
        { type: 'speed', rate: 2 },
        { type: 'colorCorrect', brightness: 0.9 },
      ],
    ];
    for (const fx of fixtures) {
      expect(effectsPresentation(fx)).toEqual(templateEffectsPresentation(fx));
    }
  });

  it('stack ops: defaultEffect, add, remove, move, update are pure', () => {
    expect(defaultEffect('transform')).toEqual({ type: 'transform', scale: 1, x: 0, y: 0 });
    expect(defaultEffect('opacity')).toEqual({ type: 'opacity', value: 1 });
    expect(defaultEffect('speed')).toEqual({ type: 'speed', rate: 1 });
    expect(defaultEffect('colorCorrect')).toEqual({ type: 'colorCorrect', brightness: 1, contrast: 1, saturation: 1 });

    const a = addEffect(undefined, defaultEffect('opacity'));
    expect(a).toEqual([{ type: 'opacity', value: 1 }]);
    const b = addEffect(a, defaultEffect('speed'));
    expect(b.map((e) => e.type)).toEqual(['opacity', 'speed']);

    // reorder
    expect(moveEffect(b, 0, 1).map((e) => e.type)).toEqual(['speed', 'opacity']);
    expect(moveEffect(b, 0, 0)).toBe(b); // ===-stable no-op
    expect(moveEffect(b, 5, 0)).toBe(b); // out-of-range no-op

    // update a field without touching `type`
    const u = updateEffect(b, 0, { value: 0.4 });
    expect(u[0]).toEqual({ type: 'opacity', value: 0.4 });
    expect(updateEffect(b, 9, { value: 0.4 })).toBe(b); // out-of-range no-op

    // remove
    expect(removeEffect(b, 0).map((e) => e.type)).toEqual(['speed']);
    expect(removeEffect(b, 9)).toBe(b); // out-of-range no-op
  });
});

// ── range selection (VE.1.1 — the keystone) ─────────────────────────────────────────────────
describe('rangeSpan', () => {
  // 3 back-to-back 1s clips (crossfade 0) → output windows [0,1000),[1000,2000),[2000,3000) ms.
  const SEGS: EdlSegment[] = [
    { id: 's1', srcStart: 0, srcEnd: 1 },
    { id: 's2', srcStart: 1, srcEnd: 2 },
    { id: 's3', srcStart: 2, srcEnd: 3 },
  ];
  const placed = placeEdl(SEGS, 30, 0);
  const RW = (startMs: number, endMs: number, srcIndex: number, segIndex: number, capKey = ''): RemappedWord => ({
    text: 'w',
    startMs,
    endMs,
    timestampMs: null,
    confidence: null,
    srcIndex,
    capKey,
    segIndex,
  });
  const words: RemappedWord[] = [RW(100, 400, 0, 0), RW(1100, 1400, 1, 1), RW(2100, 2400, 2, 2)];
  const audio: AudioTrack[] = [
    { id: 'vo', role: 'vo', src: 'a/vo.mp3', offsetSec: 0, gainDb: 0 },
    { id: 'bgm', role: 'bgm', src: 'a/bgm.mp3', offsetSec: 1.5, gainDb: -12, duck: { depth: 0.12 } },
  ];

  it('a zero-width (empty) range touches nothing', () => {
    const s = rangeSpan({ placed, fps: 30, words, audio }, 500, 500);
    expect(s.segIndexes).toEqual([]);
    expect(s.wordIds).toEqual([]);
    expect(s.audioTrackIds).toEqual([]);
    expect(s.affectedDocs).toEqual([]);
    expect(s.durationMs).toBe(0);
  });

  it('normalizes a backwards drag (hi < lo)', () => {
    const s = rangeSpan({ placed, fps: 30, words, audio }, 1400, 1100);
    expect(s.startMs).toBe(1100);
    expect(s.endMs).toBe(1400);
  });

  it('spans one segment + its word + affects segments/captions', () => {
    const s = rangeSpan({ placed, fps: 30, words, audio }, 1100, 1300);
    expect(s.segIndexes).toEqual([1]);
    expect(s.wordIds).toEqual([{ capKey: '', srcIndex: 1 }]);
    expect(s.affectedDocs).toContain('segments.json');
    expect(s.affectedDocs).toContain('captions.json');
  });

  it('partial-word overlap still counts the word', () => {
    const s = rangeSpan({ placed, fps: 30, words }, 350, 450); // clips word [100,400]
    expect(s.wordIds).toEqual([{ capKey: '', srcIndex: 0 }]);
  });

  it('a multi-segment window spans every overlapped clip', () => {
    const s = rangeSpan({ placed, fps: 30, words }, 900, 2100);
    expect(s.segIndexes).toEqual([0, 1, 2]);
  });

  it('counts audio tracks audible in the window + adds audio-mix.json', () => {
    const s = rangeSpan({ placed, fps: 30, words, audio }, 1600, 1800);
    expect(s.audioTrackIds).toEqual(['vo', 'bgm']); // vo@0 and bgm@1.5s both start before 1800
    expect(s.affectedDocs).toContain('audio-mix.json');
    const before = rangeSpan({ placed, fps: 30, audio }, 200, 400); // before bgm starts
    expect(before.audioTrackIds).toEqual(['vo']);
  });

  it('maps capKeys to caption filenames via capDocNames', () => {
    const multiWords: RemappedWord[] = [RW(1100, 1400, 0, 1, 'subs')];
    const s = rangeSpan(
      { placed, fps: 30, words: multiWords, capDocNames: { subs: 'captions-subs.json' } },
      1000,
      1500,
    );
    expect(s.affectedDocs).toContain('captions-subs.json');
    expect(s.capKeys).toEqual(['subs']);
  });
});

// ── EDL transition/effects schema (VE.0) — client mirror + cross-check vs the template owner ──
describe('EDL transition/effects schema (client mirror)', () => {
  const LEGACY_DOC = {
    fps: 30,
    crossfadeFrames: 8,
    src: 'raw/main.mp4',
    segments: [
      { id: 's1', srcStart: 0, srcEnd: 2.5, cap: '' },
      { id: 's2', srcStart: 5, srcEnd: 8.2, cap: '' },
    ],
  };
  const VE_DOC = {
    fps: 30,
    crossfadeFrames: 8,
    segments: [
      {
        id: 's1',
        srcStart: 0,
        srcEnd: 2,
        src: 'raw/a.mp4',
        transition: { kind: 'wipe', durationFrames: 10, direction: 'r' },
        effects: [
          { type: 'transform', scale: 1.1, x: 0, y: -20 },
          { type: 'opacity', value: 0.9 },
          { type: 'speed', rate: 1.5 },
          { type: 'colorCorrect', brightness: 1.05, contrast: 1.1, saturation: 1.2 },
        ],
      },
    ],
  };

  it('accepts a legacy doc and round-trips it byte-identically (no injected VE defaults)', () => {
    const parsed = segmentsDocSchema.parse(LEGACY_DOC);
    expect(parsed.segments[0].transition).toBeUndefined();
    expect(parsed.segments[0].effects).toBeUndefined();
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(LEGACY_DOC));
  });

  it('accepts the full VE shape', () => {
    expect(segmentsDocSchema.safeParse(VE_DOC).success).toBe(true);
    expect(edlSegmentSchema.safeParse(VE_DOC.segments[0]).success).toBe(true);
  });

  it('stays strict on bad transitions/effects', () => {
    expect(effectSchema.safeParse({ type: 'opacity', value: 1.5 }).success).toBe(false);
    expect(effectSchema.safeParse({ type: 'speed', rate: 0 }).success).toBe(false);
    expect(effectSchema.safeParse({ type: 'wat' }).success).toBe(false);
    expect(transitionSchema.safeParse({ kind: 'zoom', durationFrames: 8 }).success).toBe(false);
    expect(effectSchema.safeParse({ type: 'lut', src: 'luts/teal.cube' }).success).toBe(true);
  });

  it('agrees with the template schema owner on the same fixtures (mirror parity)', () => {
    for (const doc of [LEGACY_DOC, VE_DOC]) {
      expect(segmentsDocSchema.safeParse(doc).success).toBe(templateSegmentsDocSchema.safeParse(doc).success);
    }
    const bad = { fps: 30, crossfadeFrames: 8, segments: [{ id: 'x', srcStart: 0, srcEnd: 1, effects: [{ type: 'opacity', value: 9 }] }] };
    expect(segmentsDocSchema.safeParse(bad).success).toBe(false);
    expect(templateSegmentsDocSchema.safeParse(bad).success).toBe(false);
  });
});
