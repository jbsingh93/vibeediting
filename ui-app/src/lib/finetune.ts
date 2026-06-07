/**
 * lib/finetune.ts — pure fine-tune edit math (UIP4.1/4.2/4.3). No DOM, no fetch — everything here
 * is unit-tested (UIP4.T1). The editor components call these and re-render the Player from the
 * returned state; the save route persists the same objects.
 */
import { z } from 'zod';

// ── shared shapes (mirror the server's p4-routes zod + the comps' timeline types) ──

export interface CaptionWord {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs?: number | null;
  confidence?: number | null;
}

export interface EdlSegment {
  id: string;
  srcStart: number;
  srcEnd: number;
  src?: string;
  cap?: string;
}

export interface SegmentsDoc {
  fps: number;
  crossfadeFrames: number;
  src?: string;
  segments: EdlSegment[];
  emphasisWords?: string[];
}

export interface AudioTrack {
  id: string;
  role: 'vo' | 'bgm' | 'sfx';
  src: string;
  offsetSec: number;
  gainDb: number;
  duck?: { depth: number };
}

export interface AudioMixDoc {
  masterLufs: -14;
  tracks: AudioTrack[];
}

export const EMPTY_AUDIO_MIX: AudioMixDoc = { masterLufs: -14, tracks: [] };

/** client-side mirror of the server's audio-mix validation (same zod). */
export const audioTrackSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['vo', 'bgm', 'sfx']),
  src: z.string().min(1),
  offsetSec: z.number().min(0).default(0),
  gainDb: z.number().min(-36).max(12).default(0),
  duck: z.object({ depth: z.number().min(0).max(1).default(0.12) }).optional(),
});

// ── caption word-chip math (UIP4.1) ────────────────────────────────────────────

export const MIN_WORD_MS = 80;

/** Clamp helper. */
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Shift a whole word by deltaMs. Clamped so it cannot start before 0 and cannot cross its
 * neighbours (a word may touch but never overlap the previous/next word).
 */
export function moveWord(words: CaptionWord[], index: number, deltaMs: number): CaptionWord[] {
  const w = words[index];
  if (!w) return words;
  const dur = w.endMs - w.startMs;
  const lo = index > 0 ? words[index - 1]!.endMs : 0;
  const hi = index < words.length - 1 ? words[index + 1]!.startMs - dur : Number.POSITIVE_INFINITY;
  const start = clamp(w.startMs + deltaMs, lo, Math.max(lo, hi));
  if (start === w.startMs) return words;
  const next = [...words];
  next[index] = { ...w, startMs: round1(start), endMs: round1(start + dur) };
  return next;
}

/**
 * Drag one edge of a word. Keeps ≥ MIN_WORD_MS duration and never crosses the neighbour
 * on that side.
 */
export function resizeWord(
  words: CaptionWord[],
  index: number,
  edge: 'start' | 'end',
  deltaMs: number,
): CaptionWord[] {
  const w = words[index];
  if (!w) return words;
  const next = [...words];
  if (edge === 'start') {
    const lo = index > 0 ? words[index - 1]!.endMs : 0;
    const start = clamp(w.startMs + deltaMs, lo, w.endMs - MIN_WORD_MS);
    if (start === w.startMs) return words;
    next[index] = { ...w, startMs: round1(start) };
  } else {
    const hi = index < words.length - 1 ? words[index + 1]!.startMs : Number.POSITIVE_INFINITY;
    const end = clamp(w.endMs + deltaMs, w.startMs + MIN_WORD_MS, hi);
    if (end === w.endMs) return words;
    next[index] = { ...w, endMs: round1(end) };
  }
  return next;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Punctuation-insensitive normalize — mirrors src/components/captions.ts normalizeWord. */
export function normalizeWord(w: string): string {
  return w.trim().toLowerCase().replace(/[.,!?…:;"'`]/g, '');
}

/** Double-click emphasis: toggle the word's normalized form in the emphasis list (UIP4.1). */
export function toggleEmphasis(list: string[], word: string): string[] {
  const norm = normalizeWord(word);
  if (!norm) return list;
  const has = list.some((e) => normalizeWord(e) === norm);
  return has ? list.filter((e) => normalizeWord(e) !== norm) : [...list, norm];
}

export function isEmphasized(list: string[], word: string): boolean {
  const norm = normalizeWord(word);
  return list.some((e) => normalizeWord(e) === norm);
}

export const ALIGN_SNAP_MS = 250;

/**
 * "Align to voice" (UIP4.1): snap each word's start to the NEAREST baseline Whisper onset
 * (within ALIGN_SNAP_MS), keeping its duration. The baseline is the pristine transcript
 * (<base>.whisper.json) — the voice truth.
 */
export function alignToVoice(words: CaptionWord[], baseline: CaptionWord[]): CaptionWord[] {
  if (baseline.length === 0) return words;
  const onsets = baseline.map((b) => b.startMs).sort((a, b) => a - b);
  let out = [...words];
  for (let i = 0; i < out.length; i++) {
    const w = out[i]!;
    let best = onsets[0]!;
    for (const o of onsets) if (Math.abs(o - w.startMs) < Math.abs(best - w.startMs)) best = o;
    if (Math.abs(best - w.startMs) > ALIGN_SNAP_MS || best === w.startMs) continue;
    out = moveWord(out, i, best - w.startMs);
  }
  return out;
}

/** "Reset to Whisper" (UIP4.1): restore timings (and dropped words) from the baseline. */
export function resetToBaseline(baseline: CaptionWord[]): CaptionWord[] {
  return baseline.map((b) => ({ ...b }));
}

// ── EDL math (UIP4.3) — generic versions of the timelines' placeSegments/remapCaptions ──

export interface PlacedEdlSegment extends EdlSegment {
  from: number; // output-timeline frame
  durationInFrames: number;
  index: number;
}

export function placeEdl(segments: EdlSegment[], fps: number, crossfadeFrames: number): PlacedEdlSegment[] {
  const placed: PlacedEdlSegment[] = [];
  let cursor = 0;
  segments.forEach((s, index) => {
    const durationInFrames = Math.round((s.srcEnd - s.srcStart) * fps);
    placed.push({ ...s, from: cursor, durationInFrames, index });
    cursor += durationInFrames - crossfadeFrames;
  });
  return placed;
}

export function edlTotalFrames(segments: EdlSegment[], fps: number, crossfadeFrames: number): number {
  if (segments.length === 0) return 1;
  const placed = placeEdl(segments, fps, crossfadeFrames);
  const last = placed[placed.length - 1]!;
  return last.from + last.durationInFrames;
}

export const MIN_SEGMENT_SEC = 0.2;

/**
 * Nudge a segment boundary (UIP4.3). srcStart stays ≥ 0, the segment keeps ≥ MIN_SEGMENT_SEC,
 * values round to 0.01s (the EDLs' precision).
 */
export function nudgeSegment(
  segments: EdlSegment[],
  index: number,
  field: 'srcStart' | 'srcEnd',
  deltaSec: number,
): EdlSegment[] {
  const s = segments[index];
  if (!s) return segments;
  const next = [...segments];
  if (field === 'srcStart') {
    const v = clamp(s.srcStart + deltaSec, 0, s.srcEnd - MIN_SEGMENT_SEC);
    if (v === s.srcStart) return segments;
    next[index] = { ...s, srcStart: round2(v) };
  } else {
    const v = Math.max(s.srcEnd + deltaSec, s.srcStart + MIN_SEGMENT_SEC);
    if (v === s.srcEnd) return segments;
    next[index] = { ...s, srcEnd: round2(v) };
  }
  return next;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Project source-time captions onto the output timeline (generic remapCaptions). `capKey`
 * filters multi-source EDLs: a segment only pulls words from its own caption set.
 * The returned words carry `srcIndex` so edits can be inverse-mapped to the source file.
 */
export interface RemappedWord extends CaptionWord {
  /** index of this word in ITS source captions array. */
  srcIndex: number;
  /** which caption set it came from ('' = the single default set). */
  capKey: string;
  /** the placed segment it appeared in. */
  segIndex: number;
}

export function remapEdlCaptions(
  placed: PlacedEdlSegment[],
  fps: number,
  sources: Record<string, CaptionWord[]>,
): RemappedWord[] {
  const out: RemappedWord[] = [];
  for (const p of placed) {
    const capKey = p.cap ?? '';
    const words = sources[capKey] ?? [];
    const segStartMs = p.srcStart * 1000;
    const segEndMs = p.srcEnd * 1000;
    const offsetMs = (p.from / fps) * 1000;
    words.forEach((c, srcIndex) => {
      if (c.startMs >= segStartMs && c.startMs < segEndMs) {
        out.push({
          ...c,
          startMs: c.startMs - segStartMs + offsetMs,
          endMs: Math.min(c.endMs, segEndMs) - segStartMs + offsetMs,
          srcIndex,
          capKey,
          segIndex: p.index,
        });
      }
    });
  }
  return out;
}

/**
 * Inverse map: an output-timeline delta applied to a remapped word = the same delta in source
 * time (placement is offset-only inside a segment). Clamped so the word stays inside its
 * segment's kept window — a word dragged outside kept material would silently disappear.
 */
export function applyRemappedWordEdit(
  sources: Record<string, CaptionWord[]>,
  placed: PlacedEdlSegment[],
  word: RemappedWord,
  edit: { kind: 'move' | 'resize-start' | 'resize-end'; deltaMs: number },
): Record<string, CaptionWord[]> {
  const seg = placed[word.segIndex];
  const src = sources[word.capKey];
  if (!seg || !src || !src[word.srcIndex]) return sources;
  const segStartMs = seg.srcStart * 1000;
  const segEndMs = seg.srcEnd * 1000;
  const w = src[word.srcIndex]!;
  let deltaMs = edit.deltaMs;
  if (edit.kind === 'move' || edit.kind === 'resize-start') {
    deltaMs = clamp(deltaMs, segStartMs - w.startMs, segEndMs - 50 - w.startMs);
  }
  const edited =
    edit.kind === 'move'
      ? moveWord(src, word.srcIndex, deltaMs)
      : resizeWord(src, word.srcIndex, edit.kind === 'resize-start' ? 'start' : 'end', deltaMs);
  if (edited === src) return sources;
  return { ...sources, [word.capKey]: edited };
}

// ── audio math (UIP4.2) ─────────────────────────────────────────────────────────

export const DEFAULT_DUCK_DEPTH = 0.12;

export function gainDbToAmplitude(gainDb: number): number {
  return Math.pow(10, gainDb / 20);
}

/** Spoken-word windows (sec) from output-time captions — what BGM ducks under. */
export function voWindows(words: { startMs: number; endMs: number }[]): [number, number][] {
  const wins: [number, number][] = [];
  for (const w of [...words].sort((a, b) => a.startMs - b.startMs)) {
    const s = w.startMs / 1000;
    const e = w.endMs / 1000;
    const last = wins[wins.length - 1];
    if (last && s - last[1] < 0.35) last[1] = Math.max(last[1], e);
    else wins.push([s, e]);
  }
  return wins;
}

/**
 * Preview volume for a track at output-time `sec` (UIP4.2). BGM with duck dips to
 * `gain × depth` inside a voice window (with a 0.25s ease on both sides — matches the house
 * dissolve feel, 0.25s ease). Pure → unit-tested; the FineTunePreview's <Audio volume={…}> calls it.
 */
export function trackVolumeAt(track: AudioTrack, windows: [number, number][], sec: number): number {
  const base = gainDbToAmplitude(track.gainDb);
  if (!track.duck) return base;
  const depth = track.duck.depth;
  const EASE = 0.25;
  let env = 0; // 0 = no duck, 1 = fully ducked
  for (const [s, e] of windows) {
    if (sec >= s - EASE && sec <= e + EASE) {
      const inEase = clamp((sec - (s - EASE)) / EASE, 0, 1);
      const outEase = clamp(((e + EASE) - sec) / EASE, 0, 1);
      env = Math.max(env, Math.min(inEase, outEase));
    }
  }
  return base * (1 - env) + base * depth * env;
}

export function moveTrack(tracks: AudioTrack[], id: string, deltaSec: number): AudioTrack[] {
  return tracks.map((t) => (t.id === id ? { ...t, offsetSec: round2(Math.max(0, t.offsetSec + deltaSec)) } : t));
}

export function setTrackGain(tracks: AudioTrack[], id: string, gainDb: number): AudioTrack[] {
  const v = clamp(Math.round(gainDb * 10) / 10, -36, 12);
  return tracks.map((t) => (t.id === id ? { ...t, gainDb: v } : t));
}

export function setTrackDuck(tracks: AudioTrack[], id: string, depth: number | null): AudioTrack[] {
  return tracks.map((t) => {
    if (t.id !== id) return t;
    if (depth === null) {
      const rest = { ...t };
      delete rest.duck;
      return rest;
    }
    return { ...t, duck: { depth: clamp(depth, 0, 1) } };
  });
}

/** Add a track from a project audio asset; id de-duplicates against existing track ids. */
export function addTrack(tracks: AudioTrack[], role: AudioTrack['role'], src: string): AudioTrack[] {
  const base = role + '-' + (src.split('/').pop() ?? 'track').replace(/\.[a-z0-9]+$/i, '');
  let id = base;
  let n = 2;
  while (tracks.some((t) => t.id === id)) id = `${base}-${n++}`;
  const duck = role === 'bgm' ? { depth: DEFAULT_DUCK_DEPTH } : undefined;
  return [...tracks, { id, role, src, offsetSec: 0, gainDb: role === 'bgm' ? -12 : 0, ...(duck ? { duck } : {}) }];
}

// ── timeline geometry + undo ────────────────────────────────────────────────────

/** ms → px at a zoom of `pxPerSec`. */
export const msToX = (ms: number, pxPerSec: number) => (ms / 1000) * pxPerSec;
export const xToMs = (x: number, pxPerSec: number) => (x / pxPerSec) * 1000;

/** Snap a time to the nearest candidate within `thresholdMs` (drag snapping). */
export function snapMs(ms: number, candidates: number[], thresholdMs: number): number {
  let best = ms;
  let bestDist = thresholdMs;
  for (const c of candidates) {
    const d = Math.abs(c - ms);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

/** A tiny immutable undo/redo stack (UIP4.T3 wants undo to feel right). */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export function historyInit<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export function historyPush<T>(h: History<T>, next: T, cap = 100): History<T> {
  if (next === h.present) return h;
  return { past: [...h.past.slice(-cap + 1), h.present], present: next, future: [] };
}

export function historyUndo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1]!, future: [h.present, ...h.future] };
}

export function historyRedo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  return { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) };
}
