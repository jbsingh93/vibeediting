# Known Bugs & Footguns (Claude + Remotion)

When code Claude writes breaks, this is the lookup table. Bundle into every session by cross-checking against this file before declaring "done."

## React / Remotion runtime errors

### `useCurrentFrame()` throws "called outside a Remotion Composition"
**Cause**: component mounted outside the composition tree (e.g., in `Root.tsx` directly).
**Fix**: Move the component under `<Composition>` / `<Sequence>`. Never call the hook in `Root.tsx`.

### Mismatched `durationInFrames` between Composition and Sequences
**Cause**: Sequences with `from + durationInFrames > composition.durationInFrames` get clipped silently.
**Fix**:
```tsx
const totalFrames = scenes.reduce((acc, s) => acc + s.durationInFrames, 0);
console.assert(totalFrames === COMP_DURATION, 'Scene total mismatch');
```

### Composition not in the registry / dropdown
**Cause**: Not registered in `Root.tsx`, or `id` collision.
**Fix**: Verify import path and that `id` is unique.

## Video / asset errors

### `<Video>` shows black in MP4 export
**Cause**: `<Video>` is browser-rendered; some codecs don't survive the render pipeline.
**Fix**: Use `<OffthreadVideo>` from `remotion` for any non-WebM source.

### HLG/HDR phone footage reads gray / washed-out in Remotion
**Cause**: HEVC 10-bit HLG (the format modern phones shoot in) is interpreted as plain Rec.709 by
the browser-based render pipeline, so the picture looks flat, gray, and washed out.
**Fix**: **Tonemap to an SDR editmaster FIRST**, then edit/render against that — never feed raw HLG
HEVC into the composition:
```bash
ffmpeg -i in-hlg.mov \
  -vf "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable,zscale=t=bt709:m=bt709:r=tv,format=yuv420p" \
  -c:v libx264 -crf 18 -preset slow -c:a copy editmaster-sdr.mp4
```

### Audio missing in render
**Causes**: file not in `public/`; forgot `--enforce-audio-track`; source has no audio.
**Fix**: Move file to `public/`, use `staticFile()`, verify with `ffprobe`.

### `staticFile()` returns wrong URL
**Cause**: imported from wrong package.
**Fix**: Always `import { staticFile } from 'remotion'`.

### FFmpeg "moov atom not found"
**Fix**: `ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4`

## Cut / transition errors

### Dissolve-overlap fault: a word drowned by an 8-frame dissolve
**Cause**: if a segment's last word runs right up to its `srcEnd` and the next segment starts with
speech, the 8-frame dissolve plays BOTH layers at once — the outgoing word and the incoming word
overlap and the outgoing word is drowned/unintelligible.
**Fix**: end every segment **≥0.15 s into genuine silence** (so the dissolve overlaps silence, not
speech), or **merge** the two segments and cut elsewhere. Never dissolve across two simultaneous
spoken words.

### NVENC parallel-session limit + timebase mismatch breaks xfade
**Cause (1)**: NVENC allows only ~3 concurrent encode sessions on consumer GPUs — launching more
parallel hardware encodes fails or silently falls back.
**Cause (2)**: `xfade` requires both inputs on the **same timebase**; mismatched timebases make the
transition land at the wrong time or glitch.
**Fix**: cap parallel NVENC jobs at ~3, and **normalize the timebase before xfade**:
```bash
# Normalize each input to a common timebase/fps first
ffmpeg -i a.mp4 -vf "settb=AVTB,fps=30" -c:v libx264 a-norm.mp4
ffmpeg -i b.mp4 -vf "settb=AVTB,fps=30" -c:v libx264 b-norm.mp4
# then xfade the normalized clips
```

## Animation errors

### Spring overshoots into negatives
**Fix**: `Math.max(0, spring(...))` or `overshootClamping: true` in config.

### `interpolate()` returns `NaN`
**Causes**: output range has `null`/`undefined`; non-monotonic input range; mismatched lengths.
**Fix**:
```tsx
console.assert(inputRange.length === outputRange.length);
console.assert(inputRange.every((v, i) => i === 0 || v > inputRange[i - 1]));
```

### Animation runs off-screen / overshoots clip
**Cause**: Forgot `extrapolateRight: 'clamp'`.
**Fix**: Always clamp when value should hold final state:
```tsx
const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
```

### Motion looks linear/cheap
**Cause**: Forgot `easing`.
**Fix**: Add easing: `{ easing: Easing.out(Easing.cubic) }`.

## Audio / loudness errors

### AAC true-peak overshoots -1 dBTP after a single-pass loudnorm
**Cause**: single-pass `loudnorm` measures and applies at once, but the AAC encoder pushes the true
peak back above the ceiling afterward.
**Fix**: **two-pass loudnorm + a hard limiter** — measure pass (`print_format=json`), then apply
with the measured values plus `alimiter=limit=0.813` (~0.813 linear ≈ −1.0 dBTP after AAC). See
[audio-mixing.md](audio-mixing.md) "Two-pass loudnorm".

## Tailwind / styling errors

### Tailwind classes do nothing
**Causes**: Forgot `enableTailwind()` in `remotion.config.ts`; used `animate-*` classes.
**Fix**:
```ts
import { enableTailwind } from '@remotion/tailwind-v4';
Config.overrideWebpackConfig((cfg) => enableTailwind(cfg));
```

### `animate-*` classes are FORBIDDEN
Tailwind's `animate-spin`, `animate-pulse`, `animate-bounce` don't render frame-by-frame.
**Fix**: Use `useCurrentFrame()`:
```tsx
const rotation = (frame % 60) * 6;   // 360° per 60 frames
<div style={{ transform: `rotate(${rotation}deg)` }} />
```

### CSS `transition: all 0.3s` does nothing
Same reason. Strip CSS transitions entirely. Drive everything off `useCurrentFrame()`.

## Font / text errors

### Fonts swap on render
**Cause**: System font unavailable in headless browser.
**Fix**: Use `@remotion/google-fonts`:
```tsx
import { loadFont } from '@remotion/google-fonts/Inter';
const { fontFamily } = loadFont('normal', { weights: ['400', '700', '900'] });
```

For local fonts:
```tsx
const handle = delayRender('Loading font');
const fontFace = new FontFace('Brand Font', `url(${staticFile('fonts/brand-font.woff2')})`);
fontFace.load().then(() => { document.fonts.add(fontFace); continueRender(handle); });
```

## Render errors

### Render hangs forever
**Cause**: Unmatched `delayRender()`.
**Fix**: Every `delayRender()` needs `continueRender()` or `cancelRender()`. Add timeout:
```tsx
delayRender('...', { timeoutInMilliseconds: 7000, retries: 1 });
```

### Choppy preview but smooth render
The preview Player uses canvas/DOM (slow). Render is fine. Normal.

### Render eats all RAM
**Cause**: OffthreadVideo cache = ½ system RAM by default.
**Fix**:
```ts
import { Internals } from 'remotion';
Internals.setOffthreadVideoCacheSizeInBytes(2 * 1024 * 1024 * 1024);
```

## TypeScript errors

### Error on `defaultProps`
**Cause**: Values must be JSON-serializable.
**Fix**: Supported: `Date`, `Map`, `Set`, `staticFile()` returns. NOT supported: functions, class instances.

### Schema doesn't match props
**Fix**: Always derive types from schema:
```tsx
type Props = z.infer<typeof mySchema>;
const MyComp: React.FC<Props> = (props) => { ... };
```

## Caption sync errors

### Captions out of sync
**Cause**: Inconsistent rounding when ms → frames.
**Fix**: Use single helper:
```tsx
const framesFromSeconds = (s: number) => Math.round(s * fps);
```

### Whisper word timestamps off 50-200ms
**Fix**: Pad start times by 100ms so captions appear slightly early:
```tsx
const wordStartMs = caption.startMs - 100;
```
For exact cut points, window-verify each cut against the delivery file (see captions.md).

## Patterns to look for when Claude writes Remotion

### Claude uses CSS `transition`
```tsx
// BAD
<div style={{ transition: 'opacity 0.3s', opacity: visible ? 1 : 0 }} />
// GOOD
const opacity = interpolate(frame, [0, 9], [0, 1], { extrapolateRight: 'clamp' });
<div style={{ opacity }} />
```

### Claude hardcodes 30 instead of `fps`
```tsx
// BAD
const frames = seconds * 30;
// GOOD
const { fps } = useVideoConfig();
const frames = seconds * fps;
```

### Claude uses `<Video>` for MP4
```tsx
// BAD (in renders)
<Video src={staticFile('clip.mp4')} />
// GOOD
<OffthreadVideo src={staticFile('clip.mp4')} />
```

### Claude forgets `extrapolate*`
Always clamp on entries:
```tsx
{ extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
```

### Claude generates one massive file
Encourage decomposition. One file per scene, one file per reusable component.

## Quick fix prompt for debugging

> "Read references/known-bugs-and-fixes.md. Cross-check the code you just wrote against every entry. Report which footguns might apply and either fix them or confirm they're handled."
