# Generative Audio — ElevenLabs (music, SFX, TTS)

ElevenLabs gives the skill three **additive** audio capabilities. They don't replace
recorded VO, licensed music, or the offline WAV-synth fallback — they're another tool in
the box, wired into the Remotion pipeline so output lands where compositions import it.

| Need | Capability CLI | API | When |
|---|---|---|---|
| **Voiceover** | `tsx capabilities/generate/elevenlabs-tts.ts` | `/v1/text-to-speech/{voice_id}` | scratch/temp VO, fully-synthetic ads, quick variant lines, localizations |
| **Background music** | `tsx capabilities/generate/elevenlabs-music.ts` | `/v1/music` | instrumental BGM beds, jingles, stings |
| **Sound effects** | `tsx capabilities/generate/elevenlabs-sfx.ts` | `/v1/sound-generation` | believable whoosh/impact/riser/tick/ambience (beats synthesized sines) |

All three:
- run via `tsx <capability> …` (like the other capability CLIs),
- auto-load `.env` for **`ELEVENLABS_API_KEY`**,
- use the official Node SDK `@elevenlabs/elevenlabs-js`,
- write a normal audio file you then import with `staticFile()` + `<Audio>`.

**They spend ElevenLabs credits.** Listing voices is free; generation is billed. Don't
regenerate idly — version filenames and reuse (`-v1`, `-v2`).

---

## Hard rules for generated audio (don't skip)

1. **Generated audio is still audio.** It goes through the same gate as any asset:
   loudnorm the **final mix** to **-14 LUFS / -1 dBTP** at delivery, keep music ducked
   under VO, keep SFX subtle (≤0.4). See [audio-mixing.md](audio-mixing.md).
2. **The brand voice still applies to TTS copy.** Generated VO is still your brand voice —
   respect the tone rules in `brand/brand.json` (`tone.sellStyle: soft|neutral|direct`) and
   `brand/brand-voice.md` before synthesizing.
3. **Caption generated VO with Whisper, don't trust the input text for timing.**
   Run `tsx capabilities/ingest/transcribe.ts` on the produced mp3 to get real word-level
   timestamps (TTS timing ≠ your script's line breaks). Then `<KineticCaptions>` as usual.
4. **Instrumental by default for BGM.** Vocals fight the voiceover. `elevenlabs-music` forces
   instrumental unless you pass `--vocals`.
5. **No copyrighted references in music/SFX prompts.** Never name artists, bands, or
   songs. On a `bad_prompt` error the API returns a generic `promptSuggestion` — use it.
6. **Probe before importing**, set `durationInFrames` from the real duration
   (`npx remotion ffprobe <file>` — system ffprobe isn't on PATH).
7. **Determinism where it matters.** Pass `--seed` so a re-render reproduces the same
   take (best-effort; not bit-identical).

---

## Output location & naming (project-first)

Per the repo convention (overrides asset-conventions' type-first layout): everything
for a project lives under a folder named after the project.

```
public/<project>/voiceovers/vo-en-30s-v1.mp3      ← TTS
public/<project>/music/bgm-lofi-90bpm-v1.mp3      ← music
public/<project>/sfx/whoosh-01.mp3                ← SFX (project-specific)
public/sfx/whoosh-01.mp3                          ← SFX worth keeping as a shared, git-tracked library
```

Names: lowercase-kebab-case, descriptive (lang/duration/version), no spaces. Never
overwrite a version a render already references — bump the suffix.

---

## 1. Voiceover — `elevenlabs-tts`

Use the **voice ID from `brand/brand.json` (`voice.elevenlabsVoiceId`); it ships empty until the
user sets one** (UI API-Keys/Brand pages, or elevenlabs.io/voices). `--voice` accepts a voice
*name* (resolved via search) or a raw `voice_id`; default is the brand voice. Reuse it for
consistency rather than re-picking.

```bash
# VO in the brand voice (default voice + default model multilingual_v2)
tsx capabilities/generate/elevenlabs-tts.ts \
  "Welcome. Let's get started." \
  public/launch/voiceovers/vo-en-intro-v1.mp3 --seed 42

# From a script file, then caption it
tsx capabilities/generate/elevenlabs-tts.ts @public/launch/script.txt public/launch/voiceovers/vo-en-30s-v1.mp3
tsx capabilities/ingest/transcribe.ts public/launch/voiceovers/vo-en-30s-v1.mp3 public/launch/voiceovers/vo-en-30s-v1

# Discover voices (free)
tsx capabilities/generate/elevenlabs-tts.ts --list-voices
```

> **Plan gotcha:** Instant Voice Clones (IVC) require **Starter tier or above** for API use.
> On a pay-as-you-go (`payg`) plan, TTS with a cloned voice returns **401 `ivc_not_permitted`**
> ("Instantly cloned voices are not available on your current plan"), even though SFX, music, and
> premade-voice TTS still work. Premade voices are the PAYG fallback.

**Models** (both multilingual):
- `eleven_multilingual_v2` (default) — stable, consistent, deterministic-friendly. Best
  for renders you'll iterate on. `language_code` is inferred from the text.
- `eleven_v3` (`--v3`) — most expressive/emotional, 70+ langs. Newer; less predictable
  take-to-take. Accepts an explicit `--lang`.

**Voice settings** (`--stability` 0.5, `--similarity` 0.75, `--style` 0, `--speed` 1.0,
`--no-speaker-boost`). Higher stability = calmer/flatter; higher style = more dramatic.

**Audio tags & human-like direction (v3 only):** to direct a *performance* — `[excited]`,
`[whispers]`, `[laughs]`, `[pause]`, accents, pacing — pass `--v3` and follow the full
[ElevenLabs v3 TTS guide](elevenlabs-tts-v3-guide.md) (§5 audio tags onward). Tags are written
in English even in non-English scripts; `multilingual_v2` ignores them. For tag responsiveness keep
`--stability` 0.4–0.5 (Natural).

---

## 2. Background music — `elevenlabs-music`

```bash
tsx capabilities/generate/elevenlabs-music.ts \
  "warm uplifting corporate lo-fi, soft piano + mellow beat, ~90 bpm, non-intrusive, leaves room for a voiceover, seamless bed" \
  public/launch/music/bgm-lofi-90bpm-v1.mp3 --seconds 45 --seed 7

# Longer / structured (intro-build-outro) via a review-able composition plan
tsx capabilities/generate/elevenlabs-music.ts @public/launch/music-brief.txt public/launch/music/bgm-v1.mp3 --seconds 60 --plan
```

- `music_length_ms` range is **3000–600000** (`--seconds` or `--ms`).
- **Match bpm to your cut ASL** (audio-mixing.md "Music BPM matching cut rhythm").
- Prompt with tempo + instrumentation + mood + dynamics; ask for "non-intrusive,
  consistent, room for VO". `--plan` builds a sectioned arrangement first.
- Import as a faded, ducked bed (~0.25, ducking to ~0.15 under VO, 30-frame fades).

**Prompting & full reference:** [ElevenLabs Music guide](elevenlabs-music-guide.md) — the
6-layer prompt framework, genre templates, BPM/key/time-signature control, composition plans
(`--plan`), positive+negative style tags, and the seed/determinism rule (`--seed` needs `--plan`).
Our default is **instrumental, non-intrusive, under a voiceover** — set BPM to match the cut.

---

## 3. Sound effects — `elevenlabs-sfx`

The quality path vs. synthesizing sines in Node (the offline fallback the bundled
stripped ffmpeg forces). Use this for believable transitions/impacts/ambience.

```bash
tsx capabilities/generate/elevenlabs-sfx.ts "short punchy whoosh transition, mid frequency" public/launch/sfx/whoosh-01.mp3 --seconds 0.6
tsx capabilities/generate/elevenlabs-sfx.ts "deep cinematic boom impact with sub tail"       public/launch/sfx/impact-01.mp3 --seconds 1.5 --influence 0.6
tsx capabilities/generate/elevenlabs-sfx.ts "soft warm room ambience, subtle hum"            public/launch/sfx/amb-room.mp3   --seconds 20 --loop
```

- `--seconds` 0.5–30 (omit = model auto-length). `--influence` 0–1 (0.3 default; higher =
  more literal, lower = more atmospheric variation). `--loop` for seamless ambience beds
  (v2 model only).
- Layer subtly inside a `<Sequence>` at ≤0.4 volume; 2–3 simultaneous max; spread across
  frequency bands. Drive per-word ticks off caption timestamps.

**Prompting & full reference:** [ElevenLabs SFX guide](elevenlabs-sfx-guide.md) — the
7-dimension prompt formula, exclusion terms (`no music`/`no voices`), power words (`cinematic`,
`foley`, `one-shot`, `subsonic`), and influence-by-category. Our `--influence` **default 0.3 is
atmospheric** — raise to **0.6–0.9 for precise/punchy SFX** (whoosh, impact, UI, sparkle).

---

## Output formats & tiers

`--format` defaults to `mp3_44100_128` (safe on all tiers). `mp3_44100_192` needs
Creator+ ; `pcm_44100` (good for VO before a final loudnorm) needs Pro+. For a VO you'll
loudnorm anyway, 128k mp3 is fine; use PCM/WAV only if you're worried about double-mp3
artifacts in a heavy mix.

## Relationship to the existing pipeline

- **Captions:** `tsx capabilities/ingest/transcribe.ts` (unchanged) — always caption generated VO
  from the produced file, not the script text.
- **Mixing/loudnorm:** [audio-mixing.md](audio-mixing.md) + `tsx capabilities/deliver/loudnorm.ts`
  (via `npx remotion ffmpeg`) — unchanged; runs on the final mix.
- **Offline SFX fallback:** still valid when you don't want to spend credits or need a
  perfectly deterministic sine — synthesize WAV in Node.
- **Official `elevenlabs/skills`:** ElevenLabs publishes generic Agent Skills
  (`npx skills add elevenlabs/skills --skill music|sound-effects|text-to-speech`). These
  capability CLIs are the pipeline-aware equivalent (project-first output, pipeline defaults,
  loudnorm/brand-voice discipline). Consult the official skills for deeper API options.
