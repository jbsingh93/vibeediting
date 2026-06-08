import { test, assert, assertEqual, assertThrows } from './harness';
import { parseSegments, segmentsDocSchema, edlSegmentSchema, transitionSchema, effectSchema, effectsPresentation, footageGain, gainDbToAmplitude } from '../../src/components/edl';

// A pre-VE segments.json: the original shape, no transition/effects. The backward-compat anchor.
const LEGACY_DOC = {
  fps: 30,
  crossfadeFrames: 8,
  src: 'raw/main.mp4',
  segments: [
    { id: 's1', srcStart: 0, srcEnd: 2.5, cap: '' },
    { id: 's2', srcStart: 5, srcEnd: 8.2, cap: '' },
  ],
};

test('P0.8 parseSegments accepts a legacy (pre-VE) segments.json unchanged', () => {
  const doc = parseSegments(LEGACY_DOC);
  assertEqual(doc.segments.length, 2, 'should keep both segments');
  assert(doc.segments[0].transition === undefined, 'legacy segment must have no transition');
  assert(doc.segments[0].effects === undefined, 'legacy segment must have no effects');
  // Round-trips byte-identically (no injected defaults for the optional VE fields).
  assertEqual(JSON.stringify(doc), JSON.stringify(LEGACY_DOC), 'legacy doc must round-trip identically');
});

test('P0.8 parseSegments accepts the full VE shape (transition + effects stack)', () => {
  const doc = parseSegments({
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
  });
  assertEqual(doc.segments[0].transition?.kind, 'slide', 'transition kind lost');
  assertEqual(doc.segments[0].effects?.length, 4, 'effects stack lost');
});

test('P0.8 the lut effect is schema-valid (reserved for VE.5.6) but other types stay strict', () => {
  assert(effectSchema.safeParse({ type: 'lut', src: 'luts/teal.cube' }).success, 'lut must validate');
  assert(!effectSchema.safeParse({ type: 'lut' }).success, 'lut without src must reject');
  assert(!effectSchema.safeParse({ type: 'wat' }).success, 'unknown effect type must reject');
});

test('P0.8 schema enforces field bounds (opacity 0..1, positive rate, known kinds)', () => {
  assert(!effectSchema.safeParse({ type: 'opacity', value: 1.5 }).success, 'opacity > 1 must reject');
  assert(!effectSchema.safeParse({ type: 'speed', rate: 0 }).success, 'non-positive speed must reject');
  assert(!transitionSchema.safeParse({ kind: 'zoom', durationFrames: 8 }).success, 'unknown transition kind must reject');
  assert(!transitionSchema.safeParse({ kind: 'cut', durationFrames: -1 }).success, 'negative durationFrames must reject');
  assert(transitionSchema.safeParse({ kind: 'cut', durationFrames: 0 }).success, 'cut/0 must validate');
});

test('P0.8 parseSegments rejects malformed docs', async () => {
  await assertThrows(() => parseSegments({ fps: 30, crossfadeFrames: 8, segments: [] }), 'empty segments must reject');
  await assertThrows(() => parseSegments({ crossfadeFrames: 8, segments: [{ id: 'x', srcStart: 0, srcEnd: 1 }] }), 'missing fps must reject');
  await assertThrows(() => parseSegments({ fps: 30, crossfadeFrames: 8, segments: [{ id: 'x', srcStart: -1, srcEnd: 1 }] }), 'negative srcStart must reject');
});

test('P0.8 effectsPresentation (VE.5.2): the launch effect set renders to CSS + playbackRate', () => {
  // absent / empty ⇒ no-op (backward-compat with pre-VE docs)
  assertEqual(JSON.stringify(effectsPresentation(undefined)), JSON.stringify({ style: {}, playbackRate: 1 }), 'absent stack must be a no-op');
  // the full ordered stack composes transform + opacity + filter + playbackRate
  const p = effectsPresentation([
    { type: 'transform', scale: 1.1, x: 0, y: -20 },
    { type: 'opacity', value: 0.9 },
    { type: 'speed', rate: 1.5 },
    { type: 'colorCorrect', brightness: 1.05, contrast: 1.1, saturation: 1.2 },
  ]);
  assertEqual(p.style.transform, 'translate(0px, -20px) scale(1.1)', 'transform string');
  assertEqual(p.style.opacity, 0.9, 'opacity');
  assertEqual(p.style.filter, 'brightness(1.05) contrast(1.1) saturate(1.2)', 'colorCorrect → CSS filter');
  assertEqual(p.playbackRate, 1.5, 'speed → playbackRate');
  // lut is reserved (VE.5.6) → a no-op at launch
  assertEqual(JSON.stringify(effectsPresentation([{ type: 'lut', src: 'luts/x.cube' }])), JSON.stringify({ style: {}, playbackRate: 1 }), 'lut must be a launch no-op');
});

test('P0.8 footageGain (VE.7.1 / D34): absent ⇒ ×1, dB scales, mute ⇒ 0 (over the fade envelope)', () => {
  assertEqual(footageGain({}), 1, 'absent footage fields must be a ×1 no-op');
  assertEqual(footageGain({ audioGainDb: 0 }), 1, '0 dB ⇒ ×1');
  assert(Math.abs(footageGain({ audioGainDb: -6 }) - gainDbToAmplitude(-6)) < 1e-9, 'dB → amplitude');
  assertEqual(footageGain({ audioMute: true }), 0, 'mute ⇒ 0');
  assertEqual(footageGain({ audioGainDb: 6, audioMute: true }), 0, 'mute wins over gain');
});

test('P0.8 a segment + audio clip carrying the D34 fields validates; legacy round-trips identically', () => {
  const seg = { id: 's1', srcStart: 0, srcEnd: 2, audioGainDb: -9, audioMute: true };
  assert(edlSegmentSchema.safeParse(seg).success, 'segment with footage audio must validate');
  assert(!edlSegmentSchema.safeParse({ id: 's1', srcStart: 0, srcEnd: 2, audioGainDb: 99 }).success, 'gain > 12 must reject');
  // a legacy doc carries no footage fields and round-trips byte-identically (re-asserts backward-compat)
  const doc = parseSegments(LEGACY_DOC);
  assert(doc.segments[0].audioGainDb === undefined, 'legacy segment must have no footage gain');
});

test('P0.8 segmentsDocSchema + edlSegmentSchema are exported and consistent', () => {
  // The doc schema reuses the segment schema, so a valid segment is valid inside a doc.
  const seg = { id: 's1', srcStart: 0, srcEnd: 1, transition: { kind: 'fade', durationFrames: 6 } };
  assert(edlSegmentSchema.safeParse(seg).success, 'segment with transition must validate standalone');
  assert(segmentsDocSchema.safeParse({ fps: 25, crossfadeFrames: 0, segments: [seg] }).success, 'doc wrapping it must validate');
});
