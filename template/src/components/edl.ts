import { z } from 'zod';

/**
 * Canonical EDL (Edit Decision List) schema — the contract owner for `segments.json`.
 *
 * The cut is data-driven: `segments.json` is the single source of truth (D25/D32). The
 * server validator (`src/server/p4-routes.ts`) and the cockpit client
 * (`ui-app/src/lib/finetune.ts`) each keep a 1:1 MIRROR of the shapes below — those packages
 * cannot import template code, so when this file changes, change all three in lockstep
 * (the on-disk JSON is the contract). The headless EDL render comp (`EdlTimeline`) imports
 * this directly, so this file is authoritative.
 *
 * Backward-compatibility contract (VE.0): every field added after the original
 * `{ id, srcStart, srcEnd, src?, cap? }` shape is `.optional()`. An older `segments.json`
 * with no `transition`/`effects` must still parse, validate, and render byte-identically
 * (absent `transition` ⇒ the global `crossfadeFrames` dissolve; absent `effects` ⇒ no-op).
 */

/**
 * Per-edge transition kind (D26). Lives on a segment's INCOMING edge. `cut` = a hard cut
 * (no overlap); the other four are `@remotion/transitions` presets rendered identically in
 * `FineTunePreview` (cockpit) and `EdlTimeline` (headless render) to hold `preview == render`.
 */
export const transitionKindSchema = z.enum(['cut', 'dissolve', 'fade', 'slide', 'wipe']);
/** Named `EdlTransitionKind` (not `TransitionKind`) to avoid clashing with the motion lib's
 *  scene-transition kind in the `components` barrel — these are distinct concepts. */
export type EdlTransitionKind = z.infer<typeof transitionKindSchema>;

export const transitionSchema = z.object({
  kind: transitionKindSchema,
  /** Overlap/wipe length in frames. 0 = treat as a hard cut regardless of kind. */
  durationFrames: z.number().int().min(0),
  /** slide/wipe only: direction the incoming clip travels FROM. Ignored by cut/dissolve/fade. */
  direction: z.enum(['l', 'r', 'u', 'd']).optional(),
});
export type Transition = z.infer<typeof transitionSchema>;

/**
 * Per-clip effects stack (D27). Ordered (top of the array applies first). Absent ⇒ no-op.
 * `transform`/`opacity`/`speed`/`colorCorrect` render live in BOTH comps at launch;
 * `colorCorrect` is a CSS `filter`, identical in @remotion/player and headless Chromium.
 * `lut` is SCHEMA-RESERVED at launch — the field validates so projects are forward-compatible,
 * but its WebGL renderer ships post-launch (VE.5.6). Until then a `lut` effect is a no-op.
 */
export const effectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('transform'),
    /** uniform scale multiplier (1 = no change). */
    scale: z.number().positive().optional(),
    /** translate in px (output-resolution space). */
    x: z.number().optional(),
    y: z.number().optional(),
  }),
  z.object({ type: z.literal('opacity'), value: z.number().min(0).max(1) }),
  z.object({ type: z.literal('speed'), rate: z.number().positive() }),
  z.object({
    type: z.literal('colorCorrect'),
    /** CSS filter multipliers (1 = no change). */
    brightness: z.number().min(0).optional(),
    contrast: z.number().min(0).optional(),
    saturation: z.number().min(0).optional(),
  }),
  /** Reserved (VE.5.6, post-launch): public-rooted path to a `.cube` LUT. */
  z.object({ type: z.literal('lut'), src: z.string().min(1) }),
]);
export type Effect = z.infer<typeof effectSchema>;

/** One clip in the cut. `transition` is on the incoming edge; `effects` apply to this clip. */
export const edlSegmentSchema = z.object({
  id: z.string().min(1),
  srcStart: z.number().min(0),
  srcEnd: z.number().positive(),
  src: z.string().optional(),
  cap: z.string().optional(),
  transition: transitionSchema.optional(),
  effects: z.array(effectSchema).optional(),
  /** D34: this clip's OWN (footage) audio level in dB over the auto fade. Absent ⇒ 0 dB (×1). */
  audioGainDb: z.number().min(-36).max(12).optional(),
  /** D34: silence this clip's footage audio (video keeps playing). Absent/false ⇒ audible. */
  audioMute: z.boolean().optional(),
});
export type EdlSegment = z.infer<typeof edlSegmentSchema>;

export const segmentsDocSchema = z.object({
  fps: z.number().positive(),
  /** Default per-edge dissolve length when a segment has no `transition`. */
  crossfadeFrames: z.number().int().min(0),
  src: z.string().optional(),
  segments: z.array(edlSegmentSchema).min(1),
  /** Emphasis words — honored by the EDL timelines (fallback = their built-in list). */
  emphasisWords: z.array(z.string()).optional(),
});
export type SegmentsDoc = z.infer<typeof segmentsDocSchema>;

/**
 * Validate an imported `segments.json` at composition load. Throws a readable error
 * (rather than rendering garbage) when the data is malformed — fail fast, like `parseCaptions`.
 */
export function parseSegments(data: unknown): SegmentsDoc {
  const result = segmentsDocSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues;
    const preview = issues
      .slice(0, 5)
      .map((i) => `[${i.path.join('.') || 'root'}] ${i.message}`)
      .join('; ');
    throw new Error(`Invalid segments JSON (${issues.length} issue(s)): ${preview}`);
  }
  return result.data;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// EDL placement + transition + remap math — a VERBATIM MIRROR of `ui-app/src/lib/finetune.ts`.
// The cockpit (ui-app) and this render comp are separate build graphs, so the cut math is mirrored
// here so the headless `EdlTimeline` render places clips, animates transitions, projects captions,
// and mixes audio IDENTICALLY to the cockpit's `FineTunePreview` (the `preview == render` invariant).
// If either side changes, change BOTH.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface CaptionWord {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs?: number | null;
  confidence?: number | null;
}

export interface RemappedWord extends CaptionWord {
  srcIndex: number;
  capKey: string;
  segIndex: number;
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

export interface PlacedEdlSegment extends EdlSegment {
  from: number;
  durationInFrames: number;
  index: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Frames the INCOMING edge of `seg` overlaps the previous clip (mirror of finetune.ts). */
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
    const next = segments[index + 1];
    const overlap = Math.min(next ? transitionFrames(next, crossfadeFrames) : 0, durationInFrames);
    cursor += durationInFrames - overlap;
  });
  return placed;
}

export function edlTotalFrames(segments: EdlSegment[], fps: number, crossfadeFrames: number): number {
  if (segments.length === 0) return 1;
  const placed = placeEdl(segments, fps, crossfadeFrames);
  const last = placed[placed.length - 1]!;
  return last.from + last.durationInFrames;
}

export interface TransitionFrameStyle {
  clip: { opacity?: number; transform?: string; clipPath?: string };
  backdrop: number;
}

/** The CSS a typed transition applies to the incoming clip (mirror of finetune.ts). */
export function transitionPresentation(
  kind: EdlTransitionKind,
  direction: 'l' | 'r' | 'u' | 'd' | undefined,
  progress: number,
): TransitionFrameStyle {
  const p = Math.max(0, Math.min(1, progress));
  const dist = (1 - p) * 100;
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
              : `translateX(${-dist}%)`;
      return { clip: { transform: t }, backdrop: 0 };
    }
    case 'wipe': {
      const rem = 100 - p * 100;
      const inset =
        direction === 'r'
          ? `inset(0 0 0 ${rem}%)`
          : direction === 'u'
            ? `inset(0 0 ${rem}% 0)`
            : direction === 'd'
              ? `inset(${rem}% 0 0 0)`
              : `inset(0 ${rem}% 0 0)`;
      return { clip: { clipPath: inset }, backdrop: 0 };
    }
    default:
      return { clip: { opacity: p }, backdrop: 0 };
  }
}

/**
 * The combined CSS + playback rate a clip's ordered effects stack produces (VE.5.2 / D27) — a
 * VERBATIM MIRROR of `effectsPresentation` in `ui-app/src/lib/finetune.ts`. The launch set
 * (`transform`/`opacity`/`speed`/`colorCorrect`) renders identically in `@remotion/player` and the
 * headless render; `speed` becomes the OffthreadVideo `playbackRate` (constant per-clip, D33); `lut`
 * is schema-reserved (VE.5.6) → a no-op here. Change BOTH sides together or `preview == render` breaks.
 */
export interface EffectsPresentation {
  style: { transform?: string; opacity?: number; filter?: string };
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

export function gainDbToAmplitude(gainDb: number): number {
  return Math.pow(10, gainDb / 20);
}

/**
 * A clip's FOOTAGE (own) audio multiplier (D34) — applied on top of the OffthreadVideo fade
 * envelope. `audioMute` ⇒ 0 (silent, video plays on); else `audioGainDb` in dB (absent ⇒ ×1, so a
 * legacy segment renders unchanged). A VERBATIM MIRROR of `footageGain` in `ui-app/src/lib/finetune.ts`.
 */
export function footageGain(seg: { audioGainDb?: number; audioMute?: boolean }): number {
  if (seg.audioMute) return 0;
  return seg.audioGainDb == null ? 1 : gainDbToAmplitude(seg.audioGainDb);
}

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

export function trackVolumeAt(track: AudioTrack, windows: [number, number][], sec: number): number {
  const base = gainDbToAmplitude(track.gainDb);
  if (!track.duck) return base;
  const depth = track.duck.depth;
  const EASE = 0.25;
  let env = 0;
  for (const [s, e] of windows) {
    if (sec >= s - EASE && sec <= e + EASE) {
      const inEase = clamp((sec - (s - EASE)) / EASE, 0, 1);
      const outEase = clamp((e + EASE - sec) / EASE, 0, 1);
      env = Math.max(env, Math.min(inEase, outEase));
    }
  }
  return base * (1 - env) + base * depth * env;
}
