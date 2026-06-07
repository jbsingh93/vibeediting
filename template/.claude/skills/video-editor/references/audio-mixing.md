# Audio Mixing & Loudness

How to do audio inside Remotion (for short ads) and when to defer to an external editor (for long-form).

## Decision: Remotion vs external editor

| Mode | When |
|---|---|
| **Audio inside Remotion** | Quick ad with deterministic VO + music + SFX layering; A/B variants where each variant has identical mix structure; <5min total |
| **Audio in external editor/DAW** | Long-form tutorial where human reviews + polishes audio; flagship hero ad; anything with bespoke voice direction; >5min total |

For this pipeline:
- Short paid ads (15-60s) → Remotion audio
- Long-form tutorials (5-30min) → render video-only from Remotion, audio in an external editor

## Loudness targets (LUFS Integrated)

| Destination | Target | True Peak |
|---|---|---|
| **Universal master (default)** | -14 LUFS | -1 dBTP |
| Spotify, YouTube, Tidal, Amazon | -14 LUFS | -1 dBTP |
| Apple Music, Apple Podcasts | -16 LUFS | -1 dBTP |
| Broadcast (EBU R128) | -23 LUFS | -1 dBTP |

The Skill renders at -14 LUFS by default. Hard-block any export above -1 dBTP.

## Loudnorm via FFmpeg (the post-render step)

```bash
ffmpeg -i out/raw.mp4 \
  -af "loudnorm=I=-14:TP=-1:LRA=11" \
  -c:v copy -c:a aac -b:a 192k \
  out/final.mp4
```

The capability `tsx capabilities/deliver/loudnorm.ts` wraps this.

### Two-pass loudnorm for AAC true-peak overshoot

A single-pass `loudnorm` measures and applies in one go, but the AAC encoder can push the true peak
back above your ceiling after the fact. For deliverables that must not clip, do a **measure pass**
then an **apply pass** with the measured values, and add a final limiter:

```bash
# Pass 1 — measure (print_format=json)
ffmpeg -i in.mp4 -af "loudnorm=I=-14:TP=-1:LRA=11:print_format=json" -f null -

# Pass 2 — apply measured values + alimiter as a hard ceiling
ffmpeg -i in.mp4 -af \
  "loudnorm=I=-14:TP=-1:LRA=11:measured_I=<MI>:measured_TP=<MTP>:measured_LRA=<MLRA>:measured_thresh=<MT>:offset=<O>:linear=true,\
   alimiter=limit=0.813" \
  -c:v copy -c:a aac -b:a 192k out.mp4
```

`alimiter=limit=0.813` (~0.813 linear ≈ −1.0 dBTP after AAC) catches the overshoot the AAC encoder
re-introduces. Measure → apply with measured values is the only reliable way to land exactly on the
target.

## Audio in Remotion — patterns

### Voiceover

```tsx
import { Audio, staticFile } from 'remotion';

<Audio src={staticFile('voiceovers/vo.mp3')} volume={1.0} />
```

### Background music with fade in/out

```tsx
<Audio
  src={staticFile('music/bgm.mp3')}
  volume={(f) => interpolate(
    f,
    [0, 30, durationInFrames - 30, durationInFrames],
    [0, 0.25, 0.25, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  )}
/>
```

Music at 0.25 = ~-12dB. Start at 0, fade in over 30 frames, hold, fade out over 30 frames.

### Asymmetric audio fades vs the video dissolve

When a scene transition uses an 8-frame video dissolve, the **audio** fades should be
asymmetric and shorter than the video so the cut sounds tight, not mushy:
**fade-in 2 frames / fade-out 3 frames** on the audio layers, against the 8-frame video dissolve.
A symmetric long audio fade smears the transient and makes the edit feel slow.

### Sidechain ducking (programmatic)

Music drops while voiceover speaks. Requires precomputed VAD mask:

```tsx
// vadSegments: precomputed from Silero VAD
// Format: [{ from: frame, to: frame }, ...]

const isSpeaking = (f: number) =>
  vadSegments.some(s => f >= s.from && f <= s.to);

const duck = (f: number) => (isSpeaking(f) ? 0.15 : 0.6);
//                            ~-16dB ducked    ~-4dB normal

<Audio src={staticFile('music/bgm.mp3')} volume={duck} />
<Audio src={staticFile('voiceovers/vo.mp3')} volume={1.0} />
```

### SFX layering

```tsx
// Whoosh at frame 0 (scene transition)
<Sequence from={0} durationInFrames={15}>
  <Audio src={staticFile('sfx/whoosh-01.mp3')} volume={0.5} />
</Sequence>

// Pop at each word entry (drive from caption timestamps)
{captions.map((c, i) => {
  const frame = Math.round((c.startMs / 1000) * fps);
  return (
    <Sequence key={i} from={frame} durationInFrames={6}>
      <Audio src={staticFile('sfx/pop-01.mp3')} volume={0.15} />
    </Sequence>
  );
})}
```

Rule: 2-3 simultaneous SFX max. Spread across frequency bands (sub, mid, high).

## SFX library structure

```
public/sfx/
├── whoosh-short-01.mp3      # 200-400ms, mid frequency
├── whoosh-short-02.mp3
├── whoosh-long-01.mp3       # 600-900ms, low frequency
├── pop-01.mp3               # micro-UI, high
├── pop-02.mp3
├── tick-01.mp3              # per-word, very subtle
├── riser-01.mp3             # 1-3s tension build
├── sub-drop-01.mp3          # impact at end of riser
├── boom-01.mp3              # hard impact
├── ding-01.mp3              # notification
├── chime-01.mp3             # success/warm
├── impact-01.mp3            # logo sting
├── glitch-01.mp3            # pattern interrupt
└── camera-shutter-01.mp3
```

Source: Epidemic Sound, Artlist, Splice, freesound.org (CC-licensed), or generate believable ones
via `tsx capabilities/generate/elevenlabs-sfx.ts`.

## Voice processing (pre-Remotion)

Standard polish chain (apply in DAW or via FFmpeg before importing):

1. **High-pass filter** at 80Hz (remove rumble)
2. **De-noise** — RNNoise / iZotope RX / Adobe Speech Enhance (gentle, 6-10dB max)
3. **EQ**:
   - Cut 200-400 Hz (-3 dB) — reduces muddiness
   - Boost 3-5 kHz (+2 dB) — presence
   - Air shelf 10 kHz+ (+1-2 dB)
4. **De-esser** at 5-8 kHz, 4-6 dB reduction
5. **Compressor** — 3:1 ratio, 10ms attack, 100ms release, 4-6 dB GR
6. **Normalize** to -16 LUFS before adding to Remotion

### FFmpeg one-liner (rough VO polish)

```bash
ffmpeg -i public/voiceovers/raw-vo.mp3 \
  -af "highpass=f=80, \
       afftdn=nf=-25, \
       equalizer=f=300:t=q:w=1:g=-3, \
       equalizer=f=4000:t=q:w=1:g=2, \
       acompressor=threshold=-20dB:ratio=3:attack=10:release=100, \
       loudnorm=I=-16:TP=-1.5:LRA=11" \
  public/voiceovers/vo-polished.mp3
```

For production-grade polish: use a DAW with iZotope RX. For Skill automation: FFmpeg is sufficient for first-pass.

## Music BPM matching cut rhythm

| Cut ASL | BPM | Genre |
|---|---|---|
| 0.4–1.0s | 130–160 | EDM, hip-hop, drill, trap |
| 1.0–2.0s | 100–130 | pop, indie, modern hip-hop |
| 2.0–4.0s | 80–110 | lofi, ambient electronic, soft pop |
| 4s+ | 60–90 | cinematic, ambient, classical |

For beat-matched cuts, precompute beat positions via the project venv:

```bash
# beat-detect.py runs via the project venv (see capabilities/ingest/README.md)
python capabilities/ingest/beat-detect.py public/music/track.mp3 public/music/track.beats.json
```

Then in Remotion:

```tsx
import beats from '../../public/music/track.beats.json';
const beatFrames = beats.map(t => Math.round(t * fps));
// Use beatFrames as Sequence from= values
```

## Common audio mistakes

- **Music too loud under VO**: -16dB minimum duck. If you hear yourself thinking on phone speakers, too loud.
- **No fade-in/out** on music: always 30+ frame fades.
- **Audio peaks above -1 dBTP**: clipping after platform encode. Always loudnorm with `-1` TP ceiling (two-pass for AAC).
- **VO not de-essed**: sibilance painful at -14 LUFS playback.
- **Music starts at frame 0**: feels abrupt. Music in at 0.3-0.5s after the visual hook.
- **Forgot `--enforce-audio-track`** on render: if any scene lacks audio, the whole render may drop audio.
