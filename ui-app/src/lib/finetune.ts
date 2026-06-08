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

/** D26: per-edge transition on a segment's incoming edge (mirrors template/src/components/edl.ts). */
export type TransitionKind = 'cut' | 'dissolve' | 'fade' | 'slide' | 'wipe';
export interface Transition {
  kind: TransitionKind;
  durationFrames: number;
  direction?: 'l' | 'r' | 'u' | 'd';
}

/** D27: one entry in a clip's ordered effects stack. `lut` is schema-reserved (renderer = VE.5.6). */
export type Effect =
  | { type: 'transform'; scale?: number; x?: number; y?: number }
  | { type: 'opacity'; value: number }
  | { type: 'speed'; rate: number }
  | { type: 'colorCorrect'; brightness?: number; contrast?: number; saturation?: number }
  | { type: 'lut'; src: string };

export interface EdlSegment {
  id: string;
  srcStart: number;
  srcEnd: number;
  src?: string;
  cap?: string;
  /** Per-edge transition (incoming edge). Absent ⇒ global crossfadeFrames dissolve. */
  transition?: Transition;
  /** Ordered per-clip effects stack. Absent ⇒ no-op. */
  effects?: Effect[];
  /** D34: this clip's OWN (footage) audio level in dB over the auto fade. Absent ⇒ 0 dB (×1). */
  audioGainDb?: number;
  /** D34: silence this clip's footage audio (video keeps playing). Absent/false ⇒ audible. */
  audioMute?: boolean;
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
  /** D34: source in-point (sec) for a split clip. Absent ⇒ 0 (plays from the file head). */
  srcInSec?: number;
  /** D34: output length (sec) of this clip. Absent ⇒ plays to the end of the timeline (legacy). */
  durationSec?: number;
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
  srcInSec: z.number().min(0).optional(),
  durationSec: z.number().positive().optional(),
});

/** client-side mirror of the server + template EDL schema (same zod; transition/effects optional). */
export const transitionSchema = z.object({
  kind: z.enum(['cut', 'dissolve', 'fade', 'slide', 'wipe']),
  durationFrames: z.number().int().min(0),
  direction: z.enum(['l', 'r', 'u', 'd']).optional(),
});
export const effectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('transform'),
    scale: z.number().positive().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
  }),
  z.object({ type: z.literal('opacity'), value: z.number().min(0).max(1) }),
  z.object({ type: z.literal('speed'), rate: z.number().positive() }),
  z.object({
    type: z.literal('colorCorrect'),
    brightness: z.number().min(0).optional(),
    contrast: z.number().min(0).optional(),
    saturation: z.number().min(0).optional(),
  }),
  z.object({ type: z.literal('lut'), src: z.string().min(1) }),
]);
export const edlSegmentSchema = z.object({
  id: z.string().min(1),
  srcStart: z.number().min(0),
  srcEnd: z.number().positive(),
  src: z.string().optional(),
  cap: z.string().optional(),
  transition: transitionSchema.optional(),
  effects: z.array(effectSchema).optional(),
  audioGainDb: z.number().min(-36).max(12).optional(),
  audioMute: z.boolean().optional(),
});
export const segmentsDocSchema = z.object({
  fps: z.number().positive(),
  crossfadeFrames: z.number().int().min(0),
  src: z.string().optional(),
  segments: z.array(edlSegmentSchema).min(1),
  emphasisWords: z.array(z.string()).optional(),
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

/**
 * Frames the INCOMING edge of `seg` overlaps the previous clip (VE.4). A typed `transition` wins;
 * `cut` (or a 0 duration) means a hard cut (no overlap); absent ⇒ the global `crossfadeFrames`
 * default — so a pre-VE EDL places exactly as before.
 */
export function transitionFrames(seg: EdlSegment | undefined, crossfadeFrames: number): number {
  if (!seg?.transition) return Math.max(0, crossfadeFrames);
  return seg.transition.kind === 'cut' ? 0 : Math.max(0, seg.transition.durationFrames);
}

export function placeEdl(segments: EdlSegment[], fps: number, crossfadeFrames: number): PlacedEdlSegment[] {
  const placed: PlacedEdlSegment[] = [];
  let cursor = 0;
  segments.forEach((s, index) => {
    const durationInFrames = Math.round((s.srcEnd - s.srcStart) * fps);
    placed.push({ ...s, from: cursor, durationInFrames, index });
    // The overlap with the NEXT clip is owned by that clip's incoming transition (default crossfade).
    const next = segments[index + 1];
    const overlap = Math.min(next ? transitionFrames(next, crossfadeFrames) : 0, durationInFrames);
    cursor += durationInFrames - overlap;
  });
  return placed;
}

/**
 * The CSS a typed transition applies to the INCOMING clip over its overlap with the previous clip
 * (VE.4). Pure + deterministic → renders identically in `@remotion/player` (cockpit preview) and the
 * headless-Chromium render, so `preview == render` holds without a comp-library coupling. The
 * outgoing clip stays opaque underneath during the overlap; `backdrop` is a black layer BEHIND the
 * incoming clip (used by `fade` for a dip-through-black). This same function is mirrored verbatim in
 * `template/src/components/edl.ts` so the EdlTimeline render comp produces identical frames.
 */
export interface TransitionFrameStyle {
  clip: { opacity?: number; transform?: string; clipPath?: string };
  /** opacity (0..1) of a black backdrop behind the incoming clip. */
  backdrop: number;
}

export function transitionPresentation(
  kind: TransitionKind,
  direction: 'l' | 'r' | 'u' | 'd' | undefined,
  progress: number,
): TransitionFrameStyle {
  const p = Math.max(0, Math.min(1, progress));
  const dist = (1 - p) * 100; // % offscreen at the start of the slide
  switch (kind) {
    case 'cut':
      return { clip: {}, backdrop: 0 };
    case 'dissolve':
      return { clip: { opacity: p }, backdrop: 0 };
    case 'fade':
      return { clip: { opacity: p }, backdrop: 1 - p };
    case 'slide': {
      const t =
        direction === 'r'
          ? `translateX(${dist}%)`
          : direction === 'u'
            ? `translateY(${-dist}%)`
            : direction === 'd'
              ? `translateY(${dist}%)`
              : `translateX(${-dist}%)`; // 'l' (default): from the left
      return { clip: { transform: t }, backdrop: 0 };
    }
    case 'wipe': {
      const rem = 100 - p * 100; // remaining hidden %
      const inset =
        direction === 'r'
          ? `inset(0 0 0 ${rem}%)`
          : direction === 'u'
            ? `inset(0 0 ${rem}% 0)`
            : direction === 'd'
              ? `inset(${rem}% 0 0 0)`
              : `inset(0 ${rem}% 0 0)`; // 'l' (default): reveal from the left
      return { clip: { clipPath: inset }, backdrop: 0 };
    }
    default:
      return { clip: { opacity: p }, backdrop: 0 };
  }
}

export function edlTotalFrames(segments: EdlSegment[], fps: number, crossfadeFrames: number): number {
  if (segments.length === 0) return 1;
  const placed = placeEdl(segments, fps, crossfadeFrames);
  const last = placed[placed.length - 1]!;
  return last.from + last.durationInFrames;
}

// ── per-clip effects (VE.5 / D27) — render math + stack ops ─────────────────────────────────────

/**
 * The combined CSS + playback rate a clip's ordered effects stack produces (VE.5.2). Pure +
 * deterministic, so it renders IDENTICALLY in `@remotion/player` (cockpit preview) and the headless
 * Chromium render — the launch set (`transform`/`opacity`/`speed`/`colorCorrect`) carries no parity
 * gamble. `transform` composes translate(px)+scale; `opacity` multiplies; `colorCorrect` is a CSS
 * `filter`; `speed` becomes the OffthreadVideo `playbackRate` (the clip's output slot length is
 * unchanged — constant per-clip speed, D33; the source plays faster/slower within the slot). `lut`
 * is SCHEMA-RESERVED (VE.5.6, post-launch) → a no-op here. This function is mirrored VERBATIM in
 * `template/src/components/edl.ts` (the EdlTimeline render comp); change BOTH or `preview == render`
 * breaks.
 */
export interface EffectsPresentation {
  /** CSS for the per-clip effect wrapper (absent keys ⇒ the property is left unset). */
  style: { transform?: string; opacity?: number; filter?: string };
  /** OffthreadVideo playbackRate (1 = normal). */
  playbackRate: number;
}

export function effectsPresentation(effects: Effect[] | undefined): EffectsPresentation {
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let opacity = 1;
  let rate = 1;
  let brightness = 1;
  let contrast = 1;
  let saturation = 1;
  let hasTransform = false;
  let hasOpacity = false;
  let hasColor = false;
  for (const e of effects ?? []) {
    switch (e.type) {
      case 'transform':
        if (e.scale !== undefined) scale *= e.scale;
        if (e.x !== undefined) tx += e.x;
        if (e.y !== undefined) ty += e.y;
        hasTransform = true;
        break;
      case 'opacity':
        opacity *= e.value;
        hasOpacity = true;
        break;
      case 'speed':
        rate *= e.rate;
        break;
      case 'colorCorrect':
        if (e.brightness !== undefined) brightness *= e.brightness;
        if (e.contrast !== undefined) contrast *= e.contrast;
        if (e.saturation !== undefined) saturation *= e.saturation;
        hasColor = true;
        break;
      case 'lut':
        // schema-reserved (VE.5.6, post-launch): no-op until the WebGL LUT pass ships.
        break;
    }
  }
  const style: { transform?: string; opacity?: number; filter?: string } = {};
  if (hasTransform) {
    const parts: string[] = [];
    if (tx !== 0 || ty !== 0) parts.push(`translate(${tx}px, ${ty}px)`);
    if (scale !== 1) parts.push(`scale(${scale})`);
    if (parts.length > 0) style.transform = parts.join(' ');
  }
  if (hasOpacity) style.opacity = opacity;
  if (hasColor) style.filter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`;
  return { style, playbackRate: rate > 0 ? rate : 1 };
}

/** A fresh effect of `type` with neutral (no-op) defaults — what the inspector's add-buttons drop in. */
export function defaultEffect(type: Effect['type']): Effect {
  switch (type) {
    case 'transform':
      return { type: 'transform', scale: 1, x: 0, y: 0 };
    case 'opacity':
      return { type: 'opacity', value: 1 };
    case 'speed':
      return { type: 'speed', rate: 1 };
    case 'colorCorrect':
      return { type: 'colorCorrect', brightness: 1, contrast: 1, saturation: 1 };
    case 'lut':
      return { type: 'lut', src: '' };
  }
}

/** Append an effect to the stack (VE.5.4). Returns a new array. */
export function addEffect(effects: Effect[] | undefined, effect: Effect): Effect[] {
  return [...(effects ?? []), effect];
}

/** Remove the effect at `index` (VE.5.4). Out-of-range ⇒ unchanged. */
export function removeEffect(effects: Effect[] | undefined, index: number): Effect[] {
  const arr = effects ?? [];
  if (index < 0 || index >= arr.length) return arr;
  return arr.filter((_, i) => i !== index);
}

/** Reorder the stack: move `from` → `to` (VE.5.4). No-op (===-stable) when nothing moves. */
export function moveEffect(effects: Effect[] | undefined, from: number, to: number): Effect[] {
  const arr = effects ?? [];
  if (from === to || from < 0 || from >= arr.length || to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  if (!moved) return arr;
  next.splice(to, 0, moved);
  return next;
}

/** Patch fields on the effect at `index` (VE.5.4) — `type` is never overwritten by the inspector. */
export function updateEffect(
  effects: Effect[] | undefined,
  index: number,
  patch: Record<string, number | string>,
): Effect[] {
  const arr = effects ?? [];
  if (index < 0 || index >= arr.length) return arr;
  return arr.map((e, i) => (i === index ? ({ ...e, ...patch } as Effect) : e));
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

// ── structural verbs (VE.2) — pure segments[] mutations; ripple is automatic via placeEdl ──────

/**
 * Split a segment at a SOURCE-time second (VE.2.1). Produces two contiguous clips `<id>-a`/`<id>-b`
 * sharing the original `src`/`cap`/`effects`; the first half keeps the incoming `transition`, the
 * second half becomes a hard `cut` so the split is seamless (no dissolve at the new internal edge).
 * Refuses a split that would leave < MIN_SEGMENT_SEC on either side (returns the array unchanged).
 */
export function splitSegment(segments: EdlSegment[], index: number, atSrcSec: number): EdlSegment[] {
  const s = segments[index];
  if (!s) return segments;
  if (atSrcSec <= s.srcStart + MIN_SEGMENT_SEC || atSrcSec >= s.srcEnd - MIN_SEGMENT_SEC) return segments;
  const cut = round2(atSrcSec);
  const a: EdlSegment = { ...s, id: `${s.id}-a`, srcEnd: cut };
  const b: EdlSegment = { ...s, id: `${s.id}-b`, srcStart: cut, transition: { kind: 'cut', durationFrames: 0 } };
  const next = [...segments];
  next.splice(index, 1, a, b);
  return next;
}

/** Delete one segment (VE.2.3). placeEdl re-places the tail; never empties the cut (schema min 1). */
export function deleteSegment(segments: EdlSegment[], index: number): EdlSegment[] {
  if (segments.length <= 1 || index < 0 || index >= segments.length) return segments;
  const next = [...segments];
  next.splice(index, 1);
  return next;
}

/** Delete every segment in `indexes` (VE.2.3 range delete). Never empties the cut; no-op stays ===. */
export function deleteSegments(segments: EdlSegment[], indexes: number[]): EdlSegment[] {
  const drop = new Set(indexes);
  const next = segments.filter((_, i) => !drop.has(i));
  if (next.length === 0 || next.length === segments.length) return segments;
  return next;
}

/** Reorder: move the segment at `from` to index `to` (VE.2.4). Ripple is automatic. */
export function moveSegment(segments: EdlSegment[], from: number, to: number): EdlSegment[] {
  if (from === to || from < 0 || from >= segments.length) return segments;
  const clampedTo = clamp(to, 0, segments.length - 1);
  const next = [...segments];
  const [moved] = next.splice(from, 1);
  if (!moved) return segments;
  next.splice(clampedTo, 0, moved);
  return next;
}

/**
 * Insert a b-roll cutaway on the single video lane (VE.3.3 / D31) AFTER `afterIndex` (use -1 to
 * prepend). The new clip carries its own `src` (public-rooted) so the comp mounts it without a comp
 * change; ripple is automatic. `afterIndex` past the end appends.
 */
export function insertSegment(
  segments: EdlSegment[],
  afterIndex: number,
  seg: { id: string; src: string; srcStart: number; srcEnd: number; cap?: string },
): EdlSegment[] {
  const at = clamp(afterIndex + 1, 0, segments.length);
  const next = [...segments];
  const clip: EdlSegment = { id: seg.id, src: seg.src, srcStart: Math.max(0, round2(seg.srcStart)), srcEnd: round2(seg.srcEnd) };
  if (seg.cap !== undefined) clip.cap = seg.cap;
  next.splice(at, 0, clip);
  return next;
}

/**
 * Inverse of placeEdl for the razor (VE.2.2): which segment is under an OUTPUT-timeline frame, and
 * the SOURCE second at that point. In a crossfade overlap the earlier segment wins; past the end
 * (half-open) → null.
 */
export function playheadToSource(
  placed: PlacedEdlSegment[],
  fps: number,
  frame: number,
): { segIndex: number; atSrcSec: number } | null {
  for (const seg of placed) {
    if (frame >= seg.from && frame < seg.from + seg.durationInFrames) {
      return { segIndex: seg.index, atSrcSec: seg.srcStart + (frame - seg.from) / fps };
    }
  }
  return null;
}

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

// ── range selection (VE.1 — the keystone: a {startMs,endMs} OUTPUT-time window) ──────────────

/** A caption word identified by its source array + index (stable across remaps). */
export interface WordId {
  capKey: string;
  srcIndex: number;
}

/** What a timeline range window touches — the noun the manual verbs + Ask-Editor-Agent act on. */
export interface RangeSpan {
  /** normalized window (lo ≤ hi), in OUTPUT-timeline ms. */
  startMs: number;
  endMs: number;
  durationMs: number;
  /** indexes into the placed/segments array whose OUTPUT window overlaps the range. */
  segIndexes: number[];
  /** caption words whose on-screen span overlaps the range. */
  wordIds: WordId[];
  /** distinct caption-set keys among the spanned words. */
  capKeys: string[];
  /** audio tracks whose playback overlaps the range (see the duration caveat below). */
  audioTrackIds: string[];
  /** the on-disk docs the window spans, ordered segments → captions → audio (for the agent). */
  affectedDocs: string[];
}

export interface RangeSpanInput {
  placed: PlacedEdlSegment[];
  fps: number;
  /** remapped (output-time) caption words; omit for a captions-less cut. */
  words?: RemappedWord[];
  /** audio-mix tracks; omit for a silent cut. */
  audio?: AudioTrack[];
  /** the segments doc filename (multi-doc projects); default 'segments.json'. */
  segDocName?: string;
  /** capKey → caption filename, e.g. { '': 'captions.json', 'subs': 'captions-subs.json' }. */
  capDocNames?: Record<string, string>;
}

/** Half-open overlap of [aLo,aHi) with [bLo,bHi). A zero-width window overlaps nothing. */
const overlaps = (aLo: number, aHi: number, bLo: number, bHi: number): boolean =>
  aHi > aLo && bHi > bLo && aLo < bHi && bLo < aHi;

/**
 * Compute what an OUTPUT-time window touches. Pure + deterministic (VE.1.1): segments by their
 * placed output window, words by their on-screen span, audio tracks by their playback start.
 *
 * Audio caveat: `audio-mix.json` tracks carry no duration, so a track is counted as spanned when
 * it STARTS at/before the window end (`offsetMs < endMs`) — i.e. it is assumed to play to the end
 * of the timeline. This is intentionally inclusive (range-scoped audio, VE.7, wants every track
 * that could be audible in the window).
 */
export function rangeSpan(input: RangeSpanInput, aMs: number, bMs: number): RangeSpan {
  const startMs = Math.min(aMs, bMs);
  const endMs = Math.max(aMs, bMs);
  const segDoc = input.segDocName ?? 'segments.json';
  const capDocNames = input.capDocNames ?? { '': 'captions.json' };

  const segIndexes: number[] = [];
  for (const seg of input.placed) {
    const outStart = (seg.from / input.fps) * 1000;
    const outEnd = ((seg.from + seg.durationInFrames) / input.fps) * 1000;
    if (overlaps(outStart, outEnd, startMs, endMs)) segIndexes.push(seg.index);
  }

  const wordIds: WordId[] = [];
  const capKeySet = new Set<string>();
  for (const w of input.words ?? []) {
    if (overlaps(w.startMs, w.endMs, startMs, endMs)) {
      wordIds.push({ capKey: w.capKey, srcIndex: w.srcIndex });
      capKeySet.add(w.capKey);
    }
  }

  const audioTrackIds: string[] = [];
  for (const t of input.audio ?? []) {
    const offsetMs = t.offsetSec * 1000;
    if (endMs > startMs && offsetMs < endMs) audioTrackIds.push(t.id);
  }

  const affectedDocs: string[] = [];
  if (segIndexes.length) affectedDocs.push(segDoc);
  for (const k of capKeySet) {
    const doc = capDocNames[k] ?? (k ? `captions-${k}.json` : 'captions.json');
    if (!affectedDocs.includes(doc)) affectedDocs.push(doc);
  }
  if (audioTrackIds.length) affectedDocs.push('audio-mix.json');

  return {
    startMs,
    endMs,
    durationMs: endMs - startMs,
    segIndexes,
    wordIds,
    capKeys: [...capKeySet],
    audioTrackIds,
    affectedDocs,
  };
}

// ── audio math (UIP4.2) ─────────────────────────────────────────────────────────

export const DEFAULT_DUCK_DEPTH = 0.12;

export function gainDbToAmplitude(gainDb: number): number {
  return Math.pow(10, gainDb / 20);
}

/**
 * A clip's FOOTAGE (own) audio multiplier (D34) — applied on top of the OffthreadVideo fade
 * envelope in BOTH comps. `audioMute` ⇒ 0 (silent, video plays on); else `audioGainDb` in dB
 * (absent ⇒ ×1, so a legacy segment is byte-identical and renders unchanged). Pure → a VERBATIM
 * MIRROR of the same fn in `template/src/components/edl.ts`. Change BOTH or `preview == render` breaks.
 */
export function footageGain(seg: { audioGainDb?: number; audioMute?: boolean }): number {
  if (seg.audioMute) return 0;
  return seg.audioGainDb == null ? 1 : gainDbToAmplitude(seg.audioGainDb);
}

/**
 * Pick the default render-preview background (Julian 2026-06-07: fine-tune is an editor over the
 * RENDERED VERSIONS). When the editable data can reconstruct video itself (EDL segments or a
 * props.videoSrc), the data preview stays the default; otherwise the NEWEST render wins over a
 * placeholder. Returns the render url, or null to stay in data-preview mode.
 */
export function pickDefaultRender(
  hasVideoFromData: boolean,
  renders: { url: string; mtime: string }[],
): string | null {
  if (hasVideoFromData || renders.length === 0) return null;
  return [...renders].sort((a, b) => (a.mtime < b.mtime ? 1 : -1))[0].url;
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

/** Unique track id from `base`, de-duplicated against the existing ids (`base`, `base-2`, …). */
function dedupeTrackId(tracks: AudioTrack[], base: string): string {
  let id = base;
  let n = 2;
  while (tracks.some((t) => t.id === id)) id = `${base}-${n++}`;
  return id;
}

/**
 * Add a track from a project audio asset; id de-duplicates against existing track ids. `offsetSec`
 * places it on the output timeline (VE.7.2 — insert at a range start; default 0 = the head).
 */
export function addTrack(
  tracks: AudioTrack[],
  role: AudioTrack['role'],
  src: string,
  offsetSec = 0,
): AudioTrack[] {
  const base = role + '-' + (src.split('/').pop() ?? 'track').replace(/\.[a-z0-9]+$/i, '');
  const id = dedupeTrackId(tracks, base);
  const duck = role === 'bgm' ? { depth: DEFAULT_DUCK_DEPTH } : undefined;
  return [
    ...tracks,
    { id, role, src, offsetSec: round2(Math.max(0, offsetSec)), gainDb: role === 'bgm' ? -12 : 0, ...(duck ? { duck } : {}) },
  ];
}

// ── range-scoped audio: split a continuous track into clips (D34, VE.7.1) ─────────
//
// The chosen model (Julian, AskUserQuestion): a range edit SPLITS the track into clips, each its
// own level — not a keyframe envelope. A clip gains `srcInSec` (where in the file it starts) +
// `durationSec` (its output length); absent ⇒ legacy "plays from the head to the end". From this
// the three range verbs fall out of ops we already have: dip = split×2 + setTrackGain on the inner
// clip; mute = split×2 + drop the inner clip (the gap is silence, audio resumes IN SYNC because the
// trailing clip keeps its srcInSec); duck = split×2 + setTrackDuck. The −14 LUFS master is a render
// post-pass over the whole mix, so it is untouched by any per-clip level here.

/** Output end of a clip in sec (offset + duration), or +∞ when it plays to the timeline end. */
const clipEndSec = (t: AudioTrack): number => (t.durationSec == null ? Infinity : t.offsetSec + t.durationSec);

/** Minimum clip length (sec) a split may leave on either side — keeps durationSec safely positive. */
export const MIN_CLIP_SEC = 0.05;

/** The id of the clip on its lane that STARTS at `sec` (within 10 ms), or null. */
function clipStartingAt(tracks: AudioTrack[], sec: number): string | null {
  const hit = tracks.find((t) => Math.abs(t.offsetSec - sec) < 0.01);
  return hit ? hit.id : null;
}

/**
 * Split the clip `id` at OUTPUT-time second `atOutputSec` into two contiguous, gapless clips.
 * The first keeps the id + duration up to the cut; the second (`<id>-b`, de-duped) advances its
 * `srcInSec` by the first half's length so the source plays continuously. No-op (returns the same
 * array) if the cut is outside the clip or would leave < MIN_CLIP_SEC on either side.
 */
export function splitTrack(tracks: AudioTrack[], id: string, atOutputSec: number): AudioTrack[] {
  const i = tracks.findIndex((t) => t.id === id);
  if (i < 0) return tracks;
  const t = tracks[i];
  const start = t.offsetSec;
  const end = clipEndSec(t);
  if (atOutputSec <= start + MIN_CLIP_SEC || atOutputSec >= end - MIN_CLIP_SEC) return tracks;
  const cut = round2(atOutputSec);
  const firstDur = round2(cut - start);
  const a: AudioTrack = { ...t, durationSec: firstDur };
  const b: AudioTrack = {
    ...t,
    id: dedupeTrackId(tracks, `${t.id}-b`),
    offsetSec: cut,
    srcInSec: round2((t.srcInSec ?? 0) + firstDur),
  };
  if (t.durationSec == null) delete b.durationSec;
  else b.durationSec = round2(end - cut);
  const next = [...tracks];
  next.splice(i, 1, a, b);
  return next;
}

/**
 * Carve the intersection of [startSec,endSec) with clip `id` into its own clip (splitting at both
 * edges as needed) and run `mutate` on that inner clip. The shared engine behind the range verbs.
 */
function withRangeClip(
  tracks: AudioTrack[],
  id: string,
  startSec: number,
  endSec: number,
  mutate: (tracks: AudioTrack[], innerId: string) => AudioTrack[],
): AudioTrack[] {
  const orig = tracks.find((t) => t.id === id);
  if (!orig) return tracks;
  const lo = round2(Math.max(startSec, orig.offsetSec));
  const hi = round2(Math.min(endSec, clipEndSec(orig)));
  if (!(hi - lo >= MIN_CLIP_SEC)) return tracks;
  let next = splitTrack(tracks, id, lo);
  const midId = clipStartingAt(next, lo) ?? id;
  next = splitTrack(next, midId, hi);
  const innerId = clipStartingAt(next, lo);
  if (!innerId) return next;
  return mutate(next, innerId);
}

/** Range verb — set the level (dB) of track `id` ONLY within [startSec,endSec) (split + setGain). */
export function applyRangeGain(tracks: AudioTrack[], id: string, startSec: number, endSec: number, gainDb: number): AudioTrack[] {
  return withRangeClip(tracks, id, startSec, endSec, (t, inner) => setTrackGain(t, inner, gainDb));
}

/** Range verb — duck track `id` ONLY within [startSec,endSec) (`null` clears duck on the window). */
export function applyRangeDuck(tracks: AudioTrack[], id: string, startSec: number, endSec: number, depth: number | null): AudioTrack[] {
  return withRangeClip(tracks, id, startSec, endSec, (t, inner) => setTrackDuck(t, inner, depth));
}

/** Range verb — mute track `id` within [startSec,endSec): split it out, then drop the inner clip. */
export function applyRangeMute(tracks: AudioTrack[], id: string, startSec: number, endSec: number): AudioTrack[] {
  return withRangeClip(tracks, id, startSec, endSec, (t, inner) => t.filter((x) => x.id !== inner));
}

// ── footage (per-segment) audio (D34, VE.7.1) ────────────────────────────────────

/** Set/clear a segment's own footage-audio gain (dB). `null` removes the field (back to 0 dB). */
export function setSegmentAudioGain(segments: EdlSegment[], index: number, gainDb: number | null): EdlSegment[] {
  const s = segments[index];
  if (!s) return segments;
  const next = [...segments];
  if (gainDb == null) {
    const r = { ...s };
    delete r.audioGainDb;
    next[index] = r;
  } else {
    next[index] = { ...s, audioGainDb: clamp(Math.round(gainDb * 10) / 10, -36, 12) };
  }
  return next;
}

/** Mute/unmute a segment's footage audio (video keeps playing). `false` removes the field. */
export function setSegmentAudioMute(segments: EdlSegment[], index: number, mute: boolean): EdlSegment[] {
  const s = segments[index];
  if (!s) return segments;
  const next = [...segments];
  if (!mute) {
    const r = { ...s };
    delete r.audioMute;
    next[index] = r;
  } else {
    next[index] = { ...s, audioMute: true };
  }
  return next;
}

/** Apply a footage-audio gain (or `null` to clear) to every segment the range spans (VE.7.1). */
export function applyRangeFootageGain(segments: EdlSegment[], indexes: number[], gainDb: number | null): EdlSegment[] {
  return indexes.reduce((segs, i) => setSegmentAudioGain(segs, i, gainDb), segments);
}

/** Mute/unmute footage audio for every segment the range spans (VE.7.1). */
export function applyRangeFootageMute(segments: EdlSegment[], indexes: number[], mute: boolean): EdlSegment[] {
  return indexes.reduce((segs, i) => setSegmentAudioMute(segs, i, mute), segments);
}

// ── timeline geometry + undo ────────────────────────────────────────────────────

/** ms → px at a zoom of `pxPerSec`. */
export const msToX = (ms: number, pxPerSec: number) => (ms / 1000) * pxPerSec;
export const xToMs = (x: number, pxPerSec: number) => (x / pxPerSec) * 1000;

/** The SEG/TXT/VO label column offset that every track lane is pushed right by (FineTune.tsx). */
export const TIMELINE_LABEL_GUTTER = 52;
/** zoom-slider bounds (the manual override range; auto-fit clamps to the same window). */
export const PX_PER_SEC_MIN = 20;
export const PX_PER_SEC_MAX = 300;
/** the fallback zoom before the timeline dock has been measured (VE.7.5 §4.2). */
export const PX_PER_SEC_DEFAULT = 60;

/**
 * VE.7.5 §4 — fit the whole clip to the timeline dock width on load (the headline un-cramping win).
 * Pure arithmetic so it unit-tests without a DOM: subtract the label gutter, divide the usable
 * width by the clip length, clamp to the zoom-slider window. `dockWidth===0` (first paint, before
 * the ResizeObserver fires) falls back to the default — never a divide-by-zero or a 0-width flash.
 */
export function fitPxPerSec(dockWidth: number, durationSec: number): number {
  if (!Number.isFinite(dockWidth) || dockWidth <= 0) return PX_PER_SEC_DEFAULT;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return PX_PER_SEC_DEFAULT;
  const usable = Math.max(0, dockWidth - TIMELINE_LABEL_GUTTER);
  const fit = usable / durationSec;
  return Math.max(PX_PER_SEC_MIN, Math.min(PX_PER_SEC_MAX, Math.round(fit)));
}

/**
 * VE.7.5 §3.2 — how the preview box sizes inside the centered stage. Portrait (9:16, the common
 * case) is HEIGHT-driven so it grows to the stage and reads as deliberate; landscape keeps the
 * legacy width-driven branch (it already filled reasonably — don't regress it). Pure so the
 * branch choice is unit-tested without rendering a Player. `w`/`h` are the live comp/render dims.
 */
export interface PreviewLayout {
  portrait: boolean;
  /** style for the bordered preview box (the @remotion/player's parent). */
  box: { width?: string; height?: string; maxHeight?: string; aspectRatio?: string; margin: string };
  /** style spread onto the <Player>. */
  player: { width?: string; height?: string };
}
export function previewLayout(width: number, height: number): PreviewLayout {
  const w = Number.isFinite(width) && width > 0 ? width : 1080;
  const h = Number.isFinite(height) && height > 0 ? height : 1920;
  if (h >= w) {
    return {
      portrait: true,
      box: { height: '100%', maxHeight: 'min(100%, 78vh)', aspectRatio: `${w} / ${h}`, margin: '0 auto' },
      player: { height: '100%' },
    };
  }
  return { portrait: false, box: { width: 'min(640px, 100%)', margin: '0 auto' }, player: { width: '100%' } };
}

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
