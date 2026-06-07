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
} from '../finetune';
import { findBlockArrays, getAtPath, schemaToFields, setAtPath } from '../schema-form';
import { captionsSchema } from '../../../../template/src/components/captions';

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
