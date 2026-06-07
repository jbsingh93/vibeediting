# Captions Pipeline (OpenAI Whisper)

Transcription is **OpenAI `whisper-1` via the OpenAI API** — STT is OpenAI cloud only (binding
engine rule). Run it through `tsx capabilities/ingest/transcribe.ts`, which uses `whisper-1` with
word-level timestamps.

## API path (OpenAI Whisper API)

```ts
import OpenAI from 'openai';
import fs from 'node:fs';
import { openAiWhisperApiToCaptions } from '@remotion/openai-whisper';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const transcription = await openai.audio.transcriptions.create({
  file: fs.createReadStream('public/voiceovers/vo.mp3'),
  model: 'whisper-1',
  response_format: 'verbose_json',
  timestamp_granularities: ['word'],   // CRITICAL — needed for kinetic captions
  language: 'en',                       // or another ISO code, or omit for auto-detect
});

const { captions } = openAiWhisperApiToCaptions({ transcription });

// Save to public/voiceovers/vo.captions.json for the composition to import
fs.writeFileSync(
  'public/voiceovers/vo.captions.json',
  JSON.stringify(captions, null, 2)
);
```

The capability CLI does this for you and writes both `.captions.json` and `.srt`:

```bash
tsx capabilities/ingest/transcribe.ts public/voiceovers/vo.mp3 public/voiceovers/vo
```

## Caption Type

```ts
type Caption = {
  text: string;            // whitespace-sensitive — preserve leading space
  startMs: number;
  endMs: number;
  timestampMs: number | null;
  confidence: number | null;  // 0..1
};
```

## Audio prep (ffmpeg)

`whisper-1` accepts mp3/m4a/wav directly. If you need a normalized WAV for other tools:

```bash
ffmpeg -i public/voiceovers/vo.mp3 -ar 16000 -ac 1 -sample_fmt s16 vo.wav
```

## Window-Whisper verification (verify EVERY cut)

A single full-pass Whisper transcription misplaces words around pauses — boundaries drift exactly
where you want to cut. So **verify every proposed cut with a short 5–9 s Whisper window** taken from
the **loudnormed DELIVERY file** (not the proxy, not the raw): run `whisper-1` on just that window,
confirm the word boundary, and splice the window-verified segment into the timeline. The full pass
is for orientation; the windowed pass is the source of truth at each cut point.

## The eyes-and-ears method (when silence detection fails)

Sometimes silence/VAD can't find a clean cut point (the speaker runs words together, or the payoff
is visual). Fuse the two signals:

- **Ears** = Whisper word timing (exact words + ms).
- **Eyes** = Gemini visual cues (what's on screen, gestures, on-screen text).

Run `tsx capabilities/perception/cut-doctor.ts`, which combines Whisper word timing with the Gemini
visual layer and outputs a frame-accurate recommended cut point **with the evidence** (transcript
line + MM:SS). Present that evidence to the human before cutting — never cut blind on a fused verdict.

## Rendering captions in Remotion

### Hormozi style (word-by-word)

See `templates/components/KineticCaptions.tsx`.

### TikTok style (page-flip karaoke)

```tsx
import { createTikTokStyleCaptions } from '@remotion/captions';
import { useCurrentFrame, useVideoConfig, AbsoluteFill } from 'remotion';

export const TikTokCaptions: React.FC<{ captions: Caption[] }> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentMs = (frame / fps) * 1000;

  const { pages } = createTikTokStyleCaptions({
    captions,
    combineTokensWithinMilliseconds: 1200,
  });
  const activePage = pages.find(p =>
    currentMs >= p.startMs && currentMs < p.startMs + p.durationMs
  );
  if (!activePage) return null;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ fontSize: 72, fontWeight: 900, color: 'white', textAlign: 'center' }}>
        {activePage.tokens.map((t, i) => {
          const tokenActive = currentMs >= t.fromMs;
          return (
            <span key={i} style={{
              color: tokenActive ? '#FFE600' : 'rgba(255,255,255,0.4)',  // accent = your brand.json
            }}>{t.text}</span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
```

### Line-by-line (for tutorials)

```tsx
const activeLine = captions.find(c =>
  currentMs >= c.startMs && currentMs <= c.endMs + 200
);
return activeLine ? (
  <div style={{ fontSize: 36, color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
    {activeLine.text}
  </div>
) : null;
```

## Sync precision rule

Always round consistently when converting time → frames:

```ts
const framesFromMs = (ms: number, fps: number) => Math.round((ms / 1000) * fps);
```

If you `Math.floor` in one place and `Math.round` in another, captions drift by up to a frame.

## Whisper word boundary jitter

Whisper word timestamps have inherent ~50-200ms jitter. Apply a 100ms pad before each word's
`startMs` so captions appear slightly early (eye reads ahead of speech anyway):

```ts
const adjustedStart = Math.max(0, caption.startMs - 100);
```

For exact cut points, window-verify (above) rather than trusting the full-pass timing.

## Filler-word detection (per-language filler maps)

For the tutorial cut workflow, flag filler words for removal. The engine ships **per-language filler
maps (en default, da available)**; add maps for other languages as needed:

```ts
const fillerMaps: Record<string, string[]> = {
  en: ["um", "uh", "you know", "like", "I mean"],
  da: ["altså", "jo", "ikke også", "øhm", "nå", "sådan", "ligesom"],
};

const isFiller = (token: string, lang = 'en') => {
  const t = token.trim().toLowerCase();
  return (fillerMaps[lang] ?? fillerMaps.en).includes(t);
};
```

## SRT export (for YouTube upload)

```ts
import { serializeSrt } from '@remotion/captions';

const lines = captions.map(c => [c]);   // 2D array (line → tokens)
const srt = serializeSrt({ lines });
fs.writeFileSync('public/voiceovers/vo.srt', srt);
```

Upload to YouTube alongside the video for SEO + accessibility.
