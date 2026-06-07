# Brief — Talking-Head with Kinetic Captions

For talking-head videos with burned-in word-by-word captions (Hormozi style).

---

SOURCE: public/<talking-head-file>.mp4

ASPECT: <9:16 | 1:1 | 16:9>
DURATION: matches source (or trimmed via trimBefore/trimAfter)
FPS: 30

LANGUAGE: <language code, e.g. en>

---

## CAPTIONS PIPELINE

1. EXTRACT AUDIO: ffmpeg -i <source> -vn -ar 16000 -ac 1 -sample_fmt s16 /tmp/audio.wav
2. TRANSCRIBE (engine rule: OpenAI `whisper-1` via the API):
   tsx capabilities/ingest/transcribe.ts /tmp/audio.wav public/voiceovers/<basename>
3. Output: public/voiceovers/<basename>.captions.json (Caption[] with word-level timestamps)
4. Import in composition

---

## LAYOUT

- Talking head full-frame
- Slight zoom-in over duration: 1.0 → 1.05 across full duration
- Kinetic captions occupying middle-third (NOT bottom — UI overlap on 9:16)
- Brand bug top-right (logo from brand/brand.json logoPath, 80% opacity)

---

## CAPTION STYLE

Component: <KineticCaptions> (import from '../../components')

Style: "Hormozi" preset
  - Word-by-word reveal, scale-pop animation
  - Brand accent color on emphasis words
  - Font: brand heading (900 weight)
  - Size: 84pt at 1080×1920 (66pt at 1920×1080)
  - Stroke: 3px black
  - Drop shadow: 0 4px 16px rgba(0,0,0,0.5)

EMPHASIS WORDS: <list>
  Defaults: ["stop", "now", "today", "free", "secret", "AI"]
  (Localize this list to your audience's language as needed.)

---

## SYNC PRECISION

- Use createTikTokStyleCaptions() to group within 1200ms windows for page-flip style
- OR per-word pop for full Hormozi style
- Round consistently: framesFromSeconds = Math.round(s * fps)
- Pad caption start by 100ms (eye reads ahead of speech)

---

## AUDIO

Keep source audio (talking head VO).

Optional: add background music at -18dB under VO.

Optional SFX: subtle "tick" on each emphasized word at 0.15 volume.

---

## EXPORT

Preset: vertical-ad (9:16) | square-ad (1:1) | youtube-1080 (16:9)
Render with: `tsx capabilities/deliver/render-preset.ts`
Output: out/talking-head_<aspect>_<duration>s_<topic>.mp4
Loudnorm: -14 LUFS / -1 dBTP

Preview in the cockpit Player via `vibe ui`. Frame checks: `npx remotion still`.
