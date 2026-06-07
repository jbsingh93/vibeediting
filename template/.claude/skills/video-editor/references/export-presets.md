# Export Presets

Per-platform render specs. The capability `tsx capabilities/deliver/render-preset.ts` wraps these.

## Presets

| Preset | Resolution | Aspect | FPS | Codec | CRF | Pixel format | Use |
|---|---|---|---|---|---|---|---|
| `vertical-ad` | 1080×1920 | 9:16 | 30 | h264 | 18 | yuv420p | Reels/TikTok/Shorts paid |
| `square-ad` | 1080×1080 | 1:1 | 30 | h264 | 18 | yuv420p | IG feed square |
| `portrait-feed` | 1080×1350 | 4:5 | 30 | h264 | 18 | yuv420p | IG feed portrait |
| `youtube-1080` | 1920×1080 | 16:9 | 30 | h264 | 18 | yuv420p | YouTube long-form |
| `youtube-4k` | 3840×2160 | 16:9 | 60 | h264 | 16 | yuv420p | YouTube 4K (scale=2 from 1080p comp) |
| `reel-60fps` | 1080×1920 | 9:16 | 60 | h264 | 18 | yuv420p | Premium reel with smooth motion |
| `transparent-overlay` | varies | varies | 30 | prores | n/a | yuva444p10le | Alpha video for compositing |

## Per-platform delivery specs

| Destination | Resolution | AR | FPS | Audio | Bitrate | Max file | Duration |
|---|---|---|---|---|---|---|---|
| Meta Reels / IG Stories | 1080×1920 | 9:16 | 30 | AAC 128k stereo | 5–8 Mbps | 4 GB | 90s organic; 60s preferred |
| IG Feed (square) | 1080×1080 | 1:1 | 30 | AAC 128k | 3.5–5 Mbps | 4 GB | 60s |
| IG Feed (portrait) | 1080×1350 | 4:5 | 30 | AAC 128k | 3.5–5 Mbps | 4 GB | 60s |
| TikTok | 1080×1920 | 9:16 | 30 | AAC | 5–10 Mbps | 500 MB | 5–60s recommended |
| YouTube Shorts | 1080×1920 | 9:16 | 30 or 60 | AAC 192k | 12 Mbps | — | ≤60s |
| YouTube 1080p | 1920×1080 | 16:9 | 30 or 60 | AAC 192–384k | 8 Mbps (12 @60) | 256 GB | unlimited |
| YouTube 4K | 3840×2160 | 16:9 | 30 or 60 | AAC 384k | 35–45 Mbps | 256 GB | unlimited |
| LinkedIn organic | 1080×1080 best | 1:1 / 16:9 / 9:16 | 30 | AAC | 5–10 Mbps | 5 GB | 3s–10min mobile |
| X video | 1280×720 min | various | 30/60 | AAC | 5 Mbps | 512 MB | 2:20 organic |

## YouTube pro tip

Even mastered at 1080p, **export at 4K** (use `--scale=2` from 1080p comp). YouTube allocates higher bitrate to 4K uploads, so the 1080p playback (downscaled from 4K source) looks sharper than a native 1080p upload.

## Frame rate selection

- **24 fps** — cinematic narrative. Premium brand films only.
- **25 fps** — European broadcast (PAL) deliverables.
- **30 fps** — social default, YouTube long-form, talking head, tutorials.
- **60 fps** — sports, gaming, fast UI motion, slow-motion source.

For this pipeline:
- **30 fps** = default
- **60 fps** for screen recordings of fast UI demos
- **24 fps** rare — only for hero brand films

## Encoder defaults (FFmpeg / Remotion)

```
-c:v libx264 -preset slow -crf 18 -profile:v high -level 4.2 \
-pix_fmt yuv420p -movflags +faststart \
-c:a aac -b:a 192k -ar 48000
```

`+faststart` puts moov atom at file head → instant streaming on social.

## CLI render flags reference

| Flag | Purpose |
|---|---|
| `--props='{"k":"v"}'` | Override defaultProps |
| `--codec=h264` | h264, h265, av1, vp8, vp9, prores, gif, png |
| `--crf=18` | Quality (lower = better; 18 = visually lossless) |
| `--pixel-format=yuv420p` | yuv420p (default), yuva444p10le (alpha) |
| `--concurrency=4` | Parallel rendering |
| `--scale=2` | Output multiplier (1080p comp → 4K) |
| `--frames=0-119` | Render subset |
| `--muted` | Disable audio |
| `--enforce-audio-track` | Add silent audio if none |
| `--gl=angle` | Chromium WebGL backend (for Skia/Three GPU) |
| `--hardware-acceleration=if-possible` | Platform GPU encoding |
| `--proresProfile=hq` | proxy/lt/standard/hq/4444/4444-xq |
| `--x264-preset=slow` | ultrafast..placebo |

## Pre-publish QC checklist

For every video before posting:

1. **Visual** — scrub through; no overflow, no off-frame text, no broken graphics
2. **Audio** — peaks below -1 dBTP, integrated -14 LUFS, no clipping
3. **Captions** — matches spoken word, no typos, in safe zone
4. **Duration** — matches platform max
5. **First frame** — scroll-stopping (face/text/contrast)
6. **First 3s** — hook lands, captions readable, audio sting fires
7. **CTA** — visible, in safe zone, action-clear
8. **Brand** — logo/colors consistent
9. **Compression test** — upload to platform, view on phone
10. **Playback test** — watch start-to-end on actual mobile device

The Skill automates 1-4 (frame analysis, loudness check, caption sync, duration check). Human reviews 5-10.

## File naming convention

```
out/{video-type}_{platform}_{aspect}_{duration}_{variant}.mp4

Examples:
out/ad_meta-reels_9x16_30s_v1-accent-cta.mp4
out/ad_meta-reels_9x16_30s_v2-green-cta.mp4
out/tutorial_youtube_16x9_8m_chapter-1.mp4
out/sting_brand_1x1_3s_final.mp4
```

Allows easy sorting, version tracking, A/B variant grouping.
