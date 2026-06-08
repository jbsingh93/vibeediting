import { describe, expect, it } from 'vitest';
import {
  segmentSchema,
  segmentsDocSchema,
  transitionSchema,
  effectSchema,
  audioMixSchema,
  audioTrackSchema,
  validateFinetuneFile,
  classifyFinetuneDoc,
} from '../../src/server/p4-routes.js';

// The server mirror of the EDL schema (template/src/components/edl.ts). These tests prove the
// mirror accepts the same VE shapes the template owner does, stays strict on bad data, and keeps
// a pre-VE segments.json fully backward-compatible (loads, validates, classifies as 'segments').

const LEGACY_DOC = {
  fps: 30,
  crossfadeFrames: 8,
  src: 'raw/main.mp4',
  segments: [
    { id: 's1', srcStart: 0, srcEnd: 2.5, cap: '' },
    { id: 's2', srcStart: 5, srcEnd: 8.2, cap: '' },
  ],
};

describe('p4 EDL schema mirror — transition/effects', () => {
  it('accepts a legacy (pre-VE) segments.json and classifies it as segments', () => {
    expect(segmentsDocSchema.safeParse(LEGACY_DOC).success).toBe(true);
    expect(validateFinetuneFile('segments.json', LEGACY_DOC)).toBeNull();
    expect(classifyFinetuneDoc('segments.json', LEGACY_DOC)).toBe('segments');
  });

  it('accepts the full VE shape (transition + ordered effects stack)', () => {
    const doc = {
      fps: 30,
      crossfadeFrames: 8,
      segments: [
        {
          id: 's1',
          srcStart: 0,
          srcEnd: 2,
          src: 'raw/a.mp4',
          transition: { kind: 'slide', durationFrames: 12, direction: 'l' },
          effects: [
            { type: 'transform', scale: 1.1, x: 0, y: -20 },
            { type: 'opacity', value: 0.9 },
            { type: 'speed', rate: 1.5 },
            { type: 'colorCorrect', brightness: 1.05, contrast: 1.1, saturation: 1.2 },
          ],
        },
      ],
    };
    expect(segmentsDocSchema.safeParse(doc).success).toBe(true);
    expect(validateFinetuneFile('segments.json', doc)).toBeNull();
  });

  it('reserves the lut effect (valid) but stays strict on bad effects/transitions', () => {
    expect(effectSchema.safeParse({ type: 'lut', src: 'luts/teal.cube' }).success).toBe(true);
    expect(effectSchema.safeParse({ type: 'lut' }).success).toBe(false);
    expect(effectSchema.safeParse({ type: 'opacity', value: 1.5 }).success).toBe(false);
    expect(effectSchema.safeParse({ type: 'speed', rate: 0 }).success).toBe(false);
    expect(effectSchema.safeParse({ type: 'wat' }).success).toBe(false);
    expect(transitionSchema.safeParse({ kind: 'zoom', durationFrames: 8 }).success).toBe(false);
    expect(transitionSchema.safeParse({ kind: 'cut', durationFrames: -1 }).success).toBe(false);
    expect(transitionSchema.safeParse({ kind: 'cut', durationFrames: 0 }).success).toBe(true);
  });

  it('rejects a segments doc carrying a bad transition/effect', () => {
    const bad = {
      fps: 30,
      crossfadeFrames: 8,
      segments: [{ id: 's1', srcStart: 0, srcEnd: 2, transition: { kind: 'glitch', durationFrames: 8 } }],
    };
    expect(segmentsDocSchema.safeParse(bad).success).toBe(false);
    expect(validateFinetuneFile('segments.json', bad)).not.toBeNull();
  });

  it('segmentSchema accepts a standalone segment with VE fields', () => {
    expect(
      segmentSchema.safeParse({ id: 's1', srcStart: 0, srcEnd: 1, transition: { kind: 'fade', durationFrames: 6 } }).success,
    ).toBe(true);
    expect(segmentSchema.safeParse({ id: 's1', srcStart: 0, srcEnd: 1, effects: [{ type: 'opacity', value: 0.5 }] }).success).toBe(
      true,
    );
  });
});

// ── VE.7 / D34 — footage audio + split audio clips ───────────────────────────────

describe('p4 schema mirror — D34 footage audio + audio-mix clips', () => {
  it('segment accepts footage audioGainDb/audioMute; clamps gain; rejects bad types', () => {
    expect(segmentSchema.safeParse({ id: 's1', srcStart: 0, srcEnd: 2, audioGainDb: -9, audioMute: true }).success).toBe(true);
    expect(segmentSchema.safeParse({ id: 's1', srcStart: 0, srcEnd: 2, audioGainDb: 99 }).success).toBe(false); // >12
    expect(segmentSchema.safeParse({ id: 's1', srcStart: 0, srcEnd: 2, audioMute: 'yes' }).success).toBe(false);
  });

  it('a pre-VE segments.json stays valid (footage fields absent ⇒ no-op)', () => {
    const parsed = segmentsDocSchema.safeParse(LEGACY_DOC);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.segments[0]).not.toHaveProperty('audioGainDb');
  });

  it('audio-mix track accepts srcInSec/durationSec (split clip); legacy track still valid', () => {
    const legacy = { id: 'bgm-1', role: 'bgm', src: 'p/bgm.mp3', offsetSec: 0, gainDb: -12 };
    expect(audioTrackSchema.safeParse(legacy).success).toBe(true);
    const clip = { ...legacy, id: 'bgm-1-b', offsetSec: 5, srcInSec: 5, durationSec: 5 };
    expect(audioTrackSchema.safeParse(clip).success).toBe(true);
    expect(audioTrackSchema.safeParse({ ...clip, durationSec: 0 }).success).toBe(false); // must be positive
    expect(audioTrackSchema.safeParse({ ...clip, srcInSec: -1 }).success).toBe(false); // ≥ 0
  });

  it('a full split-clip audio-mix doc validates + classifies as audio-mix; master stays −14', () => {
    const doc = {
      masterLufs: -14,
      tracks: [
        { id: 'bgm-1', role: 'bgm', src: 'p/bgm.mp3', offsetSec: 0, gainDb: -12, durationSec: 5 },
        { id: 'bgm-1-b', role: 'bgm', src: 'p/bgm.mp3', offsetSec: 5, srcInSec: 5, gainDb: -30, durationSec: 5 },
        { id: 'bgm-1-c', role: 'bgm', src: 'p/bgm.mp3', offsetSec: 10, srcInSec: 10, gainDb: -12 },
      ],
    };
    expect(audioMixSchema.safeParse(doc).success).toBe(true);
    expect(validateFinetuneFile('audio-mix.json', doc)).toBeNull();
    expect(classifyFinetuneDoc('audio-mix.json', doc)).toBe('audio-mix');
    expect(audioMixSchema.safeParse({ ...doc, masterLufs: -16 }).success).toBe(false); // locked literal
  });
});
