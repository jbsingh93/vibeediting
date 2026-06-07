# Remotion API Cheatsheet (v4.0.409)

Imports, hard rules, and recipe one-liners. The page to keep open while writing.

## Imports map

```ts
// Core
import {
  Composition, Sequence, Series, Loop, Freeze, AbsoluteFill,
  Img, Video, OffthreadVideo, Audio, IFrame,
  staticFile, useCurrentFrame, useVideoConfig,
  interpolate, spring, Easing,
  delayRender, continueRender, cancelRender,
  registerRoot,
} from 'remotion';

// Transitions
import { TransitionSeries, linearTiming, springTiming, useTransitionProgress } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { flip } from '@remotion/transitions/flip';
import { clockWipe } from '@remotion/transitions/clock-wipe';
import { iris } from '@remotion/transitions/iris';
import { none } from '@remotion/transitions/none';

// Audio analysis
import { useAudioData, visualizeAudio, getAudioDurationInSeconds, getVideoMetadata } from '@remotion/media-utils';

// Captions
import { Caption, parseSrt, serializeSrt, createTikTokStyleCaptions } from '@remotion/captions';

// Whisper (OpenAI API — the engine STT path)
import { openAiWhisperApiToCaptions } from '@remotion/openai-whisper';

// Zod-types
import { zColor, zTextarea } from '@remotion/zod-types';

// Shapes
import { Triangle, Rect, Circle, Star, Pie, Heart, Ellipse } from '@remotion/shapes';

// Paths
import { getLength, getPointAtLength, evolvePath, reversePath } from '@remotion/paths';

// Lottie
import { Lottie, getLottieMetadata } from '@remotion/lottie';

// Fonts
import { loadFont } from '@remotion/google-fonts/Inter';

// Tailwind v4
import { enableTailwind } from '@remotion/tailwind-v4';   // for remotion.config.ts

// Renderer (Node)
import { selectComposition, renderMedia, renderStill } from '@remotion/renderer';
import { bundle } from '@remotion/bundler';
```

## Hard rules

1. Animate via `useCurrentFrame()`. Never CSS transitions, `animate-*`, `requestAnimationFrame`.
2. `<OffthreadVideo>` for any non-WebM source.
3. Audio via `<Audio>`. Fades wrap in `interpolate` with `extrapolateLeft/Right: 'clamp'`.
4. Each scene in `<Sequence from={frame} durationInFrames={n}>`.
5. Multi-scene cuts use `<TransitionSeries>` with `springTiming({ durationRestThreshold: 0.001 })`.
6. Dynamic durations from media: set `calculateMetadata` + `getVideoMetadata`/`getAudioDurationInSeconds`.
7. 9:16 safe zone: never put critical content in bottom 480 px or right 250 px.
8. Default render preset for social: `--codec=h264 --crf=18 --pixel-format=yuv420p`.
9. Lambda: AV1 not supported; max 15-min render per chunk.
10. Frame math: derive from `useVideoConfig().fps`, never hardcode 30.
11. Assets in `public/`, referenced via `staticFile('name.ext')`.
12. One file per scene under `src/compositions/<name>/`. Register in `src/Root.tsx`.
13. Probe assets with `ffprobe` before importing; set `durationInFrames` from actual duration × fps.
14. Never start full render until scene plan approved + at least one `npx remotion still` looks correct.
15. `continueRender(handle)` after every `delayRender()` — even on error.

## Frame math

```ts
const seconds = (frame: number, fps: number) => frame / fps;
const frames = (s: number, fps: number) => Math.round(s * fps);
const ms = (frame: number, fps: number) => (frame / fps) * 1000;
```

## Render presets (one-liners)

```bash
# Vertical ad (Reels/TikTok/Shorts)
--codec=h264 --crf=18 --pixel-format=yuv420p --concurrency=4

# Square feed (IG)
--codec=h264 --crf=18 --pixel-format=yuv420p --concurrency=4

# YouTube 1080p
--codec=h264 --crf=18 --pixel-format=yuv420p --concurrency=8 --audio-bitrate=192k

# YouTube 4K
--scale=2 --codec=h264 --crf=16 --concurrency=8 --audio-bitrate=192k

# Transparent overlay
--codec=prores --proresProfile=4444 --pixel-format=yuva444p10le

# GIF
--codec=gif --number-of-gif-loops=0 --every-nth-frame=2
```

## FFmpeg one-liners

```bash
# Concat scenes from separate renders
ffmpeg -f concat -safe 0 -i list.txt -c copy out.mp4

# Loudnorm to -14 LUFS / -1 dBTP
ffmpeg -i in.mp4 -af "loudnorm=I=-14:TP=-1:LRA=11" -c:v copy -c:a aac out.mp4

# MP4 → GIF
ffmpeg -i in.mp4 -vf "fps=15,scale=720:-1:flags=lanczos" out.gif

# Extract audio
ffmpeg -i in.mp4 -vn -acodec copy out.aac

# Replace audio
ffmpeg -i video.mp4 -i audio.mp3 -c:v copy -c:a aac -map 0:v -map 1:a out.mp4

# Trim without re-encoding
ffmpeg -ss 00:00:05 -i in.mp4 -t 00:00:30 -c copy out.mp4

# Generate proxy
ffmpeg -i in.mp4 -vf scale=720:-1 -c:v libx264 -crf 28 -preset veryfast proxy.mp4

# Probe
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration,r_frame_rate -of csv=p=0 in.mp4

# Audio for transcription (16-bit 16kHz mono WAV)
ffmpeg -i in.mp3 -ar 16000 -ac 1 -sample_fmt s16 out.wav
```

## Common props recipes

```tsx
// 9:16 short ad — 15 seconds
<Composition id="ShortAd9x16" component={ShortAd}
  width={1080} height={1920} fps={30} durationInFrames={15 * 30} />

// 1:1 feed
<Composition id="Square" component={Square}
  width={1080} height={1080} fps={30} durationInFrames={30 * 30} />

// 16:9 tutorial
<Composition id="Tutorial" component={Tutorial}
  width={1920} height={1080} fps={30} durationInFrames={300 * 30} />
```

## Preview & quick checks

Preview happens in the cockpit Player (`vibe ui`). For a fast frame check without the UI, render a
single still:

```bash
npx remotion still <CompositionId> out/check.png --frame=<n> --scale=0.25
```

Do not use Remotion Studio — the cockpit Player is the preview surface.
