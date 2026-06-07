# Asset Conventions

`public/` folder layout, naming rules, asset preparation discipline.

## Folder layout

```
public/
├── raw/                       # source footage (user drops here)
│   └── <project>/
│       └── *.mp4
├── proxy/                     # 720p proxies generated from raw/
│   └── <project>/
│       └── *.mp4
├── broll/                     # B-roll footage
│   └── <project>/
│       └── *.mp4
├── voiceovers/                # VO mp3/wav
│   ├── *.mp3
│   ├── *.wav                   # 16-bit 16kHz mono
│   ├── *.captions.json         # Whisper output (Caption[])
│   ├── *.srt                   # SRT for YouTube
│   └── *.vad.json              # Silero VAD output
├── music/                     # background tracks
│   ├── *.mp3
│   └── *.beats.json            # precomputed beat positions
├── sfx/                       # sound effects library
│   ├── whoosh-*.mp3
│   ├── pop-*.mp3
│   ├── tick-*.mp3
│   ├── riser-*.mp3
│   ├── boom-*.mp3
│   └── ...
├── logos/
│   ├── logo-light.svg
│   ├── logo-dark.svg
│   └── client-*/
├── fonts/                     # local font files (use @remotion/google-fonts when possible)
├── images/                    # static images, screenshots
│   └── <project>/
├── icons/                     # Lottie JSON, SVG icons
│   └── *.json
├── stills/                    # exported still frames for design reference
│   └── <project>/
└── testimonials/
    └── *.jpg / *.png           # avatar images for testimonial cards
```

## Naming rules

- **lowercase-kebab-case**: `vo-en-30s-v2.mp3` not `Final V2.mp3`
- **Descriptive**: include language, duration, version (`vo-en-15s-launch-v3.mp3`)
- **Project-scoped subfolders**: `public/raw/launch/take-01.mp4` not `public/take-01.mp4`
- **No spaces** in filenames (URL encoding issues)
- **No special chars** other than hyphens

## Pre-import discipline

### Always probe before importing

```bash
tsx capabilities/ingest/probe.ts public/raw/footage.mp4
```

Output:
- Duration (seconds + frames @ 30fps)
- Width × Height
- Codec (video + audio)
- Audio sample rate
- Frame rate (source)

Use the probed duration to set `durationInFrames` correctly. Never guess.

### Re-encode broken sources

If `ffprobe` shows "moov atom not found" or weird codec issues:

```bash
ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4
```

### Generate proxy for any 4K source

```bash
tsx capabilities/deliver/make-proxy.ts public/raw/4k-take.mp4 public/proxy/4k-take-720p.mp4
```

APIs (Whisper, Gemini, etc.) read the proxy. Final Remotion render reads the original.

### Audio prep for transcription

Standard 16-bit 16kHz mono WAV:

```bash
ffmpeg -i public/voiceovers/vo.mp3 -ar 16000 -ac 1 -sample_fmt s16 public/voiceovers/vo.wav
```

## Importing in compositions

```tsx
import { staticFile, OffthreadVideo, Audio, Img } from 'remotion';

// Video
<OffthreadVideo src={staticFile('raw/launch/take-01.mp4')} />

// Audio
<Audio src={staticFile('voiceovers/vo-en-30s-v1.mp3')} />

// Image
<Img src={staticFile('images/launch/hero-screenshot.png')} />

// Logo
<Img src={staticFile('logos/logo-light.svg')} />
```

## Asset versioning

When iterating, use version suffix not overwrite:

- `vo-en-30s-v1.mp3` → first take
- `vo-en-30s-v2.mp3` → re-recorded
- `vo-en-30s-final.mp3` → approved

Never overwrite `v1` once a render references it. Bump version. Cleanup happens at project close.

## Reuse CODE, never CONTENT

Reuse **patterns**, not assets. B-roll and motion-graphic content is 100% context-specific per
video — never reuse a graphic or a B-roll clip across two different videos. The reusable thing is
the **component / code pattern** (the `<BarChart>` implementation, the lower-third recipe), which
you re-skin with this video's data and brand. Carrying actual rendered content forward makes videos
feel templated and breaks the per-video narrative.

## .gitignore considerations

Add to repo `.gitignore`:

```
out/
public/raw/                # large source files — keep local only
public/proxy/              # regenerable from raw
public/voiceovers/*.wav    # 16kHz mono WAV regenerable from .mp3
.cache/
node_modules/
```

Keep in repo:
- `public/logos/` (brand assets)
- `public/sfx/` (small files, reusable)
- `public/voiceovers/*.captions.json` (transcript intermediates — don't re-transcribe)
- Composition source files

## Quick checklist before composition write

- [ ] Asset is in `public/`
- [ ] `ffprobe` confirms duration / dimensions
- [ ] Filename is lowercase-kebab-case
- [ ] Project-scoped subfolder if part of a campaign
- [ ] Proxy generated if source is 4K
- [ ] Captions JSON exists if VO is being captioned
- [ ] Beats JSON exists if music-driven cuts planned
