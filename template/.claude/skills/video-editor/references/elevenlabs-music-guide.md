<!-- ════════════════════════════════════════════════════════════════════════
     PIPELINE HEADER (how to use this guide in video-editor)
     Everything below the next "# The World's Most Comprehensive Guide…" line is
     copied verbatim as the authoritative ElevenLabs Music (Eleven Music) reference.
     ════════════════════════════════════════════════════════════════════════ -->

# Using this guide with the ElevenLabs Music capability

**Read this header first, then use §3 (parameters), §4 (prompt architecture), §6 (BPM/key),
§9–10 (structure / composition plans) as the reference.** This governs how this pipeline
generates background music. Companion: [elevenlabs-audio.md](elevenlabs-audio.md)
(music/SFX/TTS overview, output paths, mixing, loudnorm, cost). Capability CLI:
`tsx capabilities/generate/elevenlabs-music.ts` (model `music_v1`, **instrumental by default**).

> **In one line:** for this pipeline, music is almost always a **non-intrusive instrumental bed
> under a voiceover**, not a hero song. Default to `--seconds` ≤ your scene length, keep vocals
> off, match BPM to the cut, and import it **ducked + faded** (~0.25 bed → ~0.15 under VO).
> Loudnorm the **final mix**, never the bare music track.

### Script-flag → guide mapping (`elevenlabs-music`)
| Flag | Guide § | Maps to API | Pipeline default |
|---|---|---|---|
| `<prompt \| @file>` | §4 (6-layer framework), §5 (genre templates) | `prompt` (≤2048 chars) | build with the 6 layers; one focused idea beats a contradictory paragraph |
| `--seconds` / `--ms` | §9.1 | `music_length_ms` (3000–600000) | match the scene; default 30s |
| *(default)* / `--vocals` | §3.1, §7 | `force_instrumental` (default **true**) | **instrumental** — vocals fight the VO; only `--vocals` for a hero/jingle |
| `--plan` | §10 (composition plans), §10.2 | builds `composition_plan`, then composes | use for longer/arranged tracks (intro→build→outro), 30s+ |
| `--seed` | §11.8 | `seed` — **only honored on the `--plan` path** | the CLI **warns + ignores `--seed` with a plain prompt** (API 422); pair `--seed` with `--plan` for repeatable structure |
| `--format` | §3.2 | `output_format` | `mp3_44100_128` (fine for a bed you'll loudnorm) |
| `--model` | §2 | `model_id` | `music_v1` |

### The prompt formula (§4.1 — the 6 layers, in order)
```
[GENRE+SUBGENRE] · [MOOD/EMOTION] · [TEMPO bpm + KEY] · [INSTRUMENTATION] ·
[DYNAMICS/ARC] · [PRODUCTION/MIX intent + EXCLUSIONS]
```
`background music` is weak; *"warm uplifting corporate lo-fi, calm and optimistic, 90 bpm in C major,
soft Rhodes + mellow boom-bap drums + light vinyl texture, steady and non-intrusive, leaves headroom
for a voiceover, no vocals, no risers"* is the bar. Always tell it the bed is **under a voiceover**
and give **negative styles** (`no vocals`, `no big drops`, `no sudden dynamic swings`) so it stays out
of the way (§11.3 positive+negative strategy).

### Music presets (starting points)
| Need | Prompt sketch | `--seconds` | flags |
|---|---|---|---|
| Explainer / tutorial bed | `warm corporate lo-fi, soft piano + mellow beat, 85–95 bpm, non-intrusive, room for VO, no vocals` | scene length | — |
| Reel energy bed | `clean modern pop bed, confident upbeat, 110–120 bpm, light percussion, no vocals, no drops` | 15–45 | — |
| Cinematic build (hook→reveal) | `cinematic build, soft intro → rising tension → triumphant resolve, orchestral + subtle synth` | 30–60 | `--plan` |
| Jingle / sting (hero, vocals OK) | short branded motif | 5–12 | `--vocals` |

### Pipeline rules (in addition to the guide — these win on conflict)
1. **Instrumental by default.** A bed under VO must not have lyrics competing with the voiceover.
   Only `--vocals` for a deliberate jingle/hero track with no VO over it.
2. **Match BPM to the cut's rhythm** (§6.1) — see [audio-mixing.md](audio-mixing.md) "Music BPM
   matching cut rhythm". Pick BPM, don't let the model guess.
3. **Mix it as a bed, not the master:** import `<Audio>` at ~0.25, duck to ~0.15 under VO, 30-frame
   fades in/out. **Loudnorm the final mix** to -14 LUFS / -1 dBTP — never the bare music file.
4. **No copyrighted references** (§20.3). Never name artists/bands/songs. On a `bad_prompt` error the
   API returns a `promptSuggestion` — use it. Describe the *sound*, not "like <artist>".
5. **Determinism needs `--plan`.** `--seed` with a plain prompt is a 422 and the CLI drops it with a
   warning. For a reproducible track across re-renders, generate via `--plan` (+ `--seed`).
6. **Probe before importing**, set `durationInFrames` from the real duration (`npx remotion ffprobe`).
   Version filenames (`bgm-lofi-90bpm-v1.mp3`); never overwrite a take a render already references.
7. **Cost:** music is **~$0.30/min** generated (§16.6). Generate the length you need, reuse versions —
   don't regenerate idly. Respect the tone rules in `brand/brand.json` and `brand/brand-voice.md`
   for any lyrics you do generate.

Output → `public/<project>/music/`. Most-used sections below: **§3** (all parameters),
**§4** (prompt architecture), **§5** (genre templates), **§6** (BPM/key/feel), **§9–10**
(structure + composition plans), **§11** (advanced hacks), **§16** (API/SDK + costs),
**§22** (limitations), **§23** (master templates).

---

# The World's Most Comprehensive Guide to ElevenLabs Music Model: AAA Production Mastery

> **For AI Agents & Human Creators** — This guide is the definitive reference for generating world-class, studio-grade music using ElevenLabs' Eleven Music model. Every setting, parameter, audio tag, prompt technique, hack, and workflow is documented here so that any AI agent can ingest this document and produce 100% AAA-quality output from a single text prompt.

***

## 1. Overview of Eleven Music

Eleven Music is a Text-to-Music (T2M) model from ElevenLabs that generates studio-grade music from natural language prompts in any style. It is designed to understand intent and generate complete, context-aware audio based on a creator's goals. The model understands both natural language and formal musical terminology, providing state-of-the-art features including complete control over genre, style, and structure; vocal or instrumental output; multilingual lyric generation (English, Spanish, German, Japanese, and many more); and section-level editing.[^1][^2]

The model was launched on August 5, 2025, and trained on licensed data through deals with Merlin Network and Kobalt Music Group, making all outputs cleared for broad commercial use across film, television, podcasts, social media, video games, and advertising (plan-dependent). Audio is rendered at 44.1kHz and exported in MP3 (128–192kbps), WAV, PCM, or Opus formats depending on subscription tier.[^2][^3][^4][^5]

***

## 2. Model Variants

There are two core model variants accessible through ElevenCreative (the UI) and the API:[^6]

| Model | ID | Input | Best For |
|---|---|---|---|
| **ElevenLabs Music (Standard)** | `music_v1` / `model_elevenlabs-music` | Text prompt, duration, vocal toggle | Quick tracks, background music, rapid iteration[^6] |
| **ElevenLabs Music Advanced** | `model_elevenlabs-music-advanced` | Global styles + up to 20 per-section plans | Full songs, cinematic scores, precise structural control[^6] |

Use the Standard model when overall feel matters and speed is a priority. Use the Advanced model when the song must tell a story, shift mood at a specific moment, or require deliberate transitions.[^6]

***

## 3. All Settings & Parameters (Complete Reference)

### 3.1 Standard Model Parameters

| Parameter | Type | Range / Options | Default | Description |
|---|---|---|---|---|
| `prompt` | string (required) | Up to 2048 characters | — | Natural language description of the music[^6] |
| `music_length_ms` | integer | 3,000 – 600,000 ms (5 min via API; 3 min via UI) | ~10,000 ms | Target duration in milliseconds[^7] |
| `force_instrumental` | boolean | true / false | false | If true, removes all vocal elements[^7] |
| `output_format` | string | See format table below | `mp3_44100_128` | Audio codec, sample rate, and bitrate[^8] |
| `seed` | integer | Any integer | Random | Locks random seed for reproducibility[^6] |
| `model_id` | string | `music_v1` | `music_v1` | Model version selection[^9] |

### 3.2 Output Format Options (Complete)

Formats are expressed as `codec_samplerate_bitrate`:[^8]

| Format Code | Quality | Requirement |
|---|---|---|
| `mp3_22050_32` | Minimum quality | All plans |
| `mp3_44100_64` | Low quality | All plans |
| `mp3_44100_96` | Standard | All plans |
| `mp3_44100_128` | Default, balanced | All plans |
| `mp3_44100_192` | High quality MP3 | Creator tier+ |
| `wav_16000` | 16kHz WAV (voice-oriented) | All plans |
| `wav_22050` | 22kHz WAV | All plans |
| `wav_24000` | 24kHz WAV | All plans |
| `wav_44100` | CD-quality WAV | All plans |
| `pcm_44100` | Uncompressed PCM | Pro tier+ |
| `opus_48000_192` | Highest compressed quality | Creator tier+ |

**For final professional deliverables, always use `opus_48000_192` or `wav_44100`**. The default MP3 128kbps is fine for drafts and iteration.[^6]

### 3.3 Advanced / Composition Plan Parameters

| Parameter | Type | Range | Description |
|---|---|---|---|
| `positive_global_styles` | string array | Max 10 tags | Genres, instruments, mood, tempo, key applied to entire song[^10] |
| `negative_global_styles` | string array | No limit | Elements to avoid across the whole song[^10] |
| `sections` | array of objects | Up to 30 sections | Ordered list of song phases[^10] |
| `respect_sections_durations` | boolean | true / false | Default true = strict timing; false = natural transitions[^10] |

**Per-Section Fields:**

| Field | Type | Range | Description |
|---|---|---|---|
| `section_name` | string (required) | Any string | Label: "intro", "verse", "chorus", "bridge", "outro"[^6] |
| `duration_ms` | integer (required) | 3,000 – 120,000 ms per section | Target length for this section[^10] |
| `positive_local_styles` | string array | Optional | Style tags for this section only[^10] |
| `negative_local_styles` | string array | Optional | Suppressed elements for this section only[^6] |
| `lines` | string array | Optional | One string per line of singable lyrics[^10] |
| `source_from` | object | Enterprise only | Reference stored section for inpainting[^11] |

**Total duration:** 3 seconds to 10 minutes; each section: 3–120 seconds.[^10]

***

## 4. The Architecture of an AAA Prompt

The distinction between generic AI music and a track with genuine professional presence comes down to prompt construction. ElevenLabs processes two distinct prompt styles with equal proficiency: abstract emotional descriptors like "melancholic" or "triumphant" that guide harmonic progressions and timbre, and detailed technical specifications such as "dissonant violin screeches over a pulsing sub-bass in 6/8 time".[^12]

**The golden rule: Prompts that combine structural clarity with interpretive flexibility produce the most compelling results.**[^12]

A focused phrase like "rainy day jazz cafe" frequently yields more cohesive output than a paragraph of conflicting instructions, because the model interprets intent and supplies contextually appropriate details.[^12]

### 4.1 The 6-Layer Prompt Framework (AAA Level)

Build every world-class prompt from these six layers, applied in order:

**Layer 1 — Genre + Subgenre:**
Establish the fundamental sonic framework before anything else.
- Weak: `rock music`
- AAA: `energetic 1980s synth-pop` / `cinematic orchestral soundtrack` / `lo-fi chillhop beat`[^13][^14]

**Layer 2 — Mood + Emotion:**
Pair genre with emotional direction.
- `haunting and eerie` / `uplifting and triumphant` / `peaceful and reflective`[^14]
- Example: `Upbeat synthwave track with nostalgic 80s energy`[^12]

**Layer 3 — Specific Instrumentation:**
Name exact instruments for texture definition.
- `prominent slap bass line, funky rhythm guitar, and a horn section`[^13]
- `nylon string guitar, upright bass, brushed snare`[^6]

**Layer 4 — Tempo + Key + Time Signature:**
The model accurately follows BPM and often captures the intended musical key.[^1]
- `130 BPM, in A minor, 4/4 time`[^15]
- `laid-back shuffle, medium swing, 95 BPM`[^14]

**Layer 5 — Production Quality / Texture Descriptors:**
Define the sonic character and recording style.
- `vinyl crackle, analog warmth, reverb-heavy`[^16]
- `live performance, room ambience, raw and unpolished`[^1]
- **Cheat code: Add "great production quality" to tell the model you want polished output**[^17]

**Layer 6 — Negative / Exclusion Instructions:**
Tell the model what to avoid.
- `no harsh synths, no aggressive drops`[^12]
- `no four-on-the-floor kick, no repetitive structure, no autotune`[^16]
- `no vocals, no fade in/out, no reverb tails`[^14]

### 4.2 Use-Case Intent Prompting (Maximum Creativity)

The model allows you to move beyond song descriptors and into **intent** for maximum creativity. High-level contextual prompts are often as effective as technical ones:[^1]

- `ad for a sneaker brand` — guides the model toward tone, structure, and content that match the use case[^1]
- `peaceful meditation with voiceover` — signals pacing, absence of rhythm, and calm textures[^1]
- `background music for a suspense thriller trailer` — implies dark harmony, sparse rhythm, building tension[^18]
- `music for a coffee shop commercial, friendly and inviting` — guides energy levels and emotional tone more effectively than a list of attributes[^12]

***

## 5. Genre-Specific Prompt Templates (Professional Grade)

### 5.1 Electronic / Dance Music

**Progressive House (AAA):**
> `Progressive house track, euphoric and uplifting, featuring filtered chord stabs, rolling bassline, and crisp sidechain-compressed percussion, 128 BPM in F minor, building energy toward a satisfying drop, no harsh leads, no screeching synths`[^12]

**Synthwave:**
> `Retro 80s synthwave with pulsing arpeggios, gated reverb drums, neon-soaked atmosphere, dark and melancholic, analog warmth, 110 BPM, instrumental only, great production quality`[^6]

**Dark Electronic / Trailer:**
> `Extremely dark, tense and powerful, cinematic sound design, electronic hybrid, trailer music, evil, braam horns, impacts, boom, rising tension, completely instrumental`[^18]

### 5.2 Cinematic / Orchestral

**Epic Cinematic (AAA):**
> `Dramatic film score, tense and suspenseful, sparse piano melody over sustained string tremolo, gradually building with brass accents and timpani hits, 90 BPM, D minor, full orchestra erupts at 1:00, triumphant resolution at 2:30, instrumental only, great production quality`[^12]

**Wild West Cinematic:**
> `An epic track for a cowboy show, wild west, cinematic sound design, guitar twanging with awesome orchestral elements crescendoing to a powerful finale, soundtrack`[^18]

**Battle / Action Score:**
> `Explosive orchestral battle music, full orchestra, relentless percussion, mounting strings, powerful brass hits, 145 BPM in E minor, no electronics, no synthesizers, awe-inspiring and majestic`[^19]

### 5.3 Indie / Singer-Songwriter

**Dreamy Indie Rock:**
> `Dreamy, psychedelic, slow Indie Rock, reverb-soaked vocals, retro keys, catchy chorus, analog, phased guitars, liminal, nostalgic feeling, anthem`[^18]

**Acoustic Ballad:**
> `Intimate acoustic ballad, bittersweet and reflective, fingerpicked guitar in DADGAD tuning, gentle vocal melody with subtle harmonies, warm and close-mic'd recording, 70 BPM`[^12]

### 5.4 Hip-Hop / Urban

**Boom Bap:**
> `Boom bap hip-hop beat, gritty and raw, dusty drum break, deep sub-bass, vinyl crackle atmosphere, minor key piano stabs, 87 BPM, instrumental only`[^12]

**Modern Trap:**
> `Dark trap beat, menacing and atmospheric, 808 sub-bass with slide, hi-hat rolls at 170 BPM trap tempo, minor piano melody, sparse vocal ad-libs, no full lyrics`[^14]

### 5.5 Ambient / Lo-Fi

**Study Lo-Fi:**
> `Lo-fi hip hop, chill and relaxing, warm Rhodes piano, soft lazy drums at 85 BPM, gentle vinyl crackle, mellow bass, suitable for studying, instrumental only, no vocals, no risers`[^14]

**Ethereal Ambient:**
> `Ethereal ambient soundscape, peaceful and meditative, slowly evolving pad textures, distant bell tones, no rhythm or percussion, reverb-heavy, 4-minute duration`[^12]

### 5.6 Jazz / Vintage

**1950s Crooner Jazz:**
> `A very retro track from the 1950s with an old crooner male vocalist, charming, vintage, classic, nostalgic, golden oldies, vinyl crackle, catchy vocal hooks`[^18]

**Live Jazz Trio:**
> `Upbeat jazz trio, live recording, acoustic upright bass walking lines, brushed snare swing, bebop piano, 165 BPM, E-flat major, intimate club atmosphere`[^12]

### 5.7 Pop / Commercial

**Radio-Ready Pop:**
> `Upbeat modern pop, catchy and radio-ready, four-on-the-floor kick, driving synth bass, soaring female vocals starting at 0:30, 120 BPM in G major, bright production, great production quality, no distortion`[^14]

### 5.8 Rock

**Live Indie Rock Performance:**
> `Energetic live indie rock, raw and authentic, driving electric guitar riffs, pounding drum kit, gravelly male vocals, stadium reverb on snare, 140 BPM, D major, bridge at 2:00`[^1]

***

## 6. Musical Control: The Technical Mastery Layer

### 6.1 Tempo (BPM) Control

The model accurately follows BPM when specified. Include tempo as a number: `130 BPM`, `90 BPM`, `180 BPM`. You may also use qualitative tempo descriptions:[^15][^1]

| Descriptor | Approximate BPM Range |
|---|---|
| Very slow / largo | 40–60 BPM |
| Slow / adagio | 60–75 BPM |
| Moderate / andante | 75–110 BPM |
| Upbeat / allegro | 120–160 BPM |
| Fast / presto | 160–200 BPM |
| Very fast | 200+ BPM |

### 6.2 Key Signature Control

The model often captures the intended musical key when specified. Use standard notation:[^1]
- Major keys: `A major`, `C major`, `G major`, `D major`, `Bb major`, `F# major`
- Minor keys: `A minor`, `C minor`, `F minor`, `B minor`, `D minor`, `E minor`
- Modes: `Dorian mode`, `Lydian mode`, `Phrygian mode`
- Scales: `blues scale`, `pentatonic`, `harmonic minor`

Including musical keys substantially improves harmonic consistency, particularly when planning to combine multiple generated sections.[^12]

### 6.3 Time Signature Control

Include time signatures for unusual feels:
- Standard: `4/4 time` (assumed default)
- Waltz: `3/4 time`, `3/8 time`
- Compound: `6/8 time`, `12/8 time`
- Complex: `5/4 time`, `7/8 time`
- Example: `"dissonant violin screeches over a pulsing sub-bass in 6/8 time"`[^1]

### 6.4 Groove and Feel

Layer rhythmic feel descriptors for genre authenticity:[^14]
- `medium swing`, `laid-back shuffle`, `straight 8ths`, `dotted groove`
- `syncopated`, `staccato`, `legato`, `fluid and flowing`
- `two-step`, `four-on-the-floor`, `half-time feel`, `polyrhythmic`

***

## 7. Vocal Control: Complete Reference

### 7.1 Vocal Types and Styles

The model supports vocals, instrumental-only, multilingual lyrics, and multi-vocalist arrangements.[^2]

**To include vocals (default for most genres):** Simply describe vocal style in the prompt.
**To exclude vocals:** Add `instrumental only` to your prompt or set `force_instrumental: true` via API. This is the only reliable method to guarantee no vocals.[^7][^6][^1]

**Vocal delivery descriptors:**
- Energy: `raw`, `aggressive`, `powerful`, `breathy`, `airy`
- Style: `live`, `glitching`, `auto-tuned`, `operatic`, `raspy`
- Gender: `female vocals`, `male vocals`, `androgynous`
- Age character: `mature`, `young`, `elderly crooner`
- Example: `soulful female vocals, powerful and raw, no autotune`[^1]

### 7.2 Multi-Vocalist Arrangements

The model can render multiple vocalists:[^1]
- `two singers harmonizing in C major`
- `male and female duet, intimate call-and-response`
- `four-part vocal harmony, choir-style`
- For advanced control: use separate sections in composition plans with different `positive_local_styles` for each vocalist[^10]

### 7.3 Vocal Isolation (A Cappella / Stems)

To generate pure vocal stems:[^1]
- `a cappella female vocals, soulful and powerful, A major, 90 BPM`
- `a cappella male chorus, harmonized and reverent`
- Include key, tempo, and tone for best stem quality[^1]

### 7.4 Timing Cues for Vocals

Control when vocals enter and exit:[^15][^1]
- `lyrics begin at 15 seconds`
- `instrumental only after 1:45`
- `no vocals until the chorus at 0:52`
- `vocals fade out at 2:30, instrumental outro`

### 7.5 Multilingual Lyrics

The model supports multilingual lyric generation. Supported languages include English, Spanish, German, Japanese, French, Chinese (Mandarin), Korean, and many more.[^20][^21][^2]
- Specify language in the prompt: `song in Spanish`, `lyrics in Japanese`
- In the UI: use conversational follow-ups like `"make it Japanese"` or `"translate to Spanish"`[^1]
- Styles and tags must be in English; only lyrics can be in other languages[^10]

***

## 8. Instrument Isolation: The "Solo" Technique

The Standard model does not generate separate stems directly from a full track. To create isolated stems, use targeted prompts:[^1]

**For instruments:** Prefix with `solo`:
- `solo electric guitar with bluesy bends and warm overdrive`
- `solo piano in C minor, contemplative and sparse`
- `solo synthesizer lead, bright and cutting through the mix`
- `solo drum kit, jazz brush pattern, medium swing`
- `solo upright bass, walking jazz bassline, A minor, 120 BPM`

**Then:** Align and combine generated solo stems in your DAW for mixing.[^12]

***

## 9. Structural Timing & Lyrics Control

### 9.1 Song Duration

- Minimum: 3 seconds; Maximum: 5 minutes via API / 3 minutes via UI[^2][^6]
- Use `Auto` to let the model determine the most musical length[^22]
- Specify with: `"60 seconds"`, `"3 minutes"`, `"2:30"` in your prompt[^1]
- **For building full songs:** Start with a short 30-second intro, then iteratively add sections[^22]

### 9.2 Song Structure Cues

Guide the model toward standard song architecture:[^14]
- `starts with a soft intro, builds to a big chorus`
- `verse–chorus–verse with a bridge`
- `8-bar intro, 16-bar verse, double chorus at 1:00`
- `crescendo from 1:30 to 2:00, resolves at 2:15`
- Use words like `tension`, `finale`, `crescendo`, `build`, `swell` to add structural depth[^19]

### 9.3 Lyrics: Your Own vs. Generated

**Model-generated lyrics:** Simply describe theme, mood, and language. The model creates structured lyrics matching the detected song length.[^1]

**Custom lyrics:** Paste lyrics directly into the prompt. The model uses them to determine vocal structure and placement.[^1]

**Lyrics formatting best practices:**
- Label sections with `[Verse]`, `[Chorus]`, `[Bridge]`
- Keep lines short (8–12 syllables for natural flow)
- Phonetic sounds are acceptable: `(hmmm hmmm)`, `(ooh)`, `(yeah)`[^10]
- The `lines` field must contain only singable/speakable content — performance directions go in `positive_local_styles`[^10]

***

## 10. Composition Plans: The Maximum Control Method

Composition plans are JSON objects for precise, section-by-section music generation via API. Use them when you need specific section structure, precise lyrics timing, or complex arrangements. **Composition plans and text prompts are mutually exclusive — use one or the other, not both**.[^10]

### 10.1 Full Composition Plan Structure (AAA Example)

```json
{
  "positive_global_styles": ["cinematic", "orchestral", "epic", "120 BPM", "D minor"],
  "negative_global_styles": ["electronic", "synthesizer", "lo-fi"],
  "respect_sections_durations": true,
  "sections": [
    {
      "section_name": "intro",
      "duration_ms": 15000,
      "positive_local_styles": ["quiet", "suspenseful", "low strings only", "building dread"],
      "negative_local_styles": ["full orchestra", "drums", "loud"],
      "lines": []
    },
    {
      "section_name": "verse_1",
      "duration_ms": 25000,
      "positive_local_styles": ["intimate", "warm strings", "soft piano", "male vocals"],
      "negative_local_styles": ["aggressive", "loud percussion"],
      "lines": [
        "In the silence of the dawn",
        "Where the shadows come undone",
        "I have waited for so long",
        "For this moment to belong"
      ]
    },
    {
      "section_name": "chorus",
      "duration_ms": 20000,
      "positive_local_styles": ["full orchestra", "powerful", "soaring strings", "epic brass"],
      "negative_local_styles": ["quiet", "sparse"],
      "lines": [
        "Rise above the storm tonight",
        "Let the fire be your light",
        "We will stand until the end",
        "Rise and rise again"
      ]
    },
    {
      "section_name": "bridge",
      "duration_ms": 15000,
      "positive_local_styles": ["stripped back", "piano only", "intimate", "emotional"],
      "negative_local_styles": ["full orchestra", "percussion"],
      "lines": [
        "When all seems lost",
        "Remember why we fought"
      ]
    },
    {
      "section_name": "final_chorus",
      "duration_ms": 25000,
      "positive_local_styles": ["full orchestra", "triumphant", "relentless", "massive", "choir"],
      "negative_local_styles": ["quiet", "sparse"],
      "lines": [
        "Rise above the storm tonight",
        "Let the fire be your light",
        "We will stand until the end",
        "Rise and rise again and again"
      ]
    },
    {
      "section_name": "outro",
      "duration_ms": 10000,
      "positive_local_styles": ["resolving", "warm", "final chord", "peaceful"],
      "negative_local_styles": ["intense", "loud"],
      "lines": []
    }
  ]
}
```

### 10.2 Generating a Composition Plan from a Text Prompt

You can generate a composition plan from a prompt using the API, then modify it before generation:[^23]

```
POST https://api.elevenlabs.io/v1/music/plan
Body: { "prompt": "Epic orchestral battle music, D minor, 120 BPM" }
```

This returns a full JSON composition plan you can inspect, edit, and then pass to `/v1/music` to generate.[^24][^23]

### 10.3 Section Duration Behavior

- Default (`respect_sections_durations: true`): Model strictly follows `duration_ms` values[^10]
- Set to `false` for better audio quality at the cost of less precise timing[^10]
- For video sync or hard time requirements, keep default `true`
- Hard time sync against external video always requires post-production trim[^6]
- Aim for at least 8–10 seconds per section for audible, distinct transitions[^6]

***

## 11. Advanced Techniques and Hacks

### 11.1 The Production Quality Cheat Code

Add **`great production quality`** to any prompt. This single phrase signals to the model that you want polished, studio-grade output — acting as a direct quality instruction the model consistently responds to.[^25][^17]

### 11.2 Musician Language for Precision

The model's training dataset was labeled by professional musicians. Using musician-specific terminology unlocks deeper technical control:[^17]

- Specify beat patterns: `snare on beats 2 and 4`, `kick on downbeats`
- Reference playing techniques: `fingerpicked`, `palm-muted`, `tremolo picked`, `arco strings`
- Reference production techniques: `sidechained compression`, `tape saturation`, `plate reverb`, `room mic`
- Rhythm notation: `dotted 8th note delay`, `triplet feel`, `swing quantize`

### 11.3 Positive + Negative Tag Strategy

Always pair positive style descriptors with explicit negative exclusions:[^25][^17]
- Positive: `warm, acoustic, organic, intimate`
- Negative: `no electronic beats, no autotune, no synthesizers`

Use negative styles liberally to prevent unwanted sounds — the model benefits from clear exclusion guidance.[^10]

### 11.4 The Iterative Section-Build Method

The most reliable workflow for AAA results:[^13][^16]
1. Generate a **30-second intro** and refine until satisfied
2. Click `+ Add Section` and specify the style for the next section (verse, chorus, etc.)
3. Use the `Continue the conversation...` prompt box to build piece by piece
4. Adjust section lengths, drag sections to reorder, delete weak sections
5. Regenerate only the sections you're unhappy with — preserve what works

### 11.5 Abstract Emotional Descriptors vs. Technical Language

Both approaches work equally well:[^12][^1]
- **Abstract:** `melancholic`, `triumphant`, `unsettling`, `ethereal`, `raw`, `explosive`
- **Technical:** `dissonant diminished chords`, `sub-bass swell into a 2-bar fill`, `ostinato cello line`
- **Best practice:** Combine them: `melancholic, sparse piano ostinato in F# minor, 60 BPM`

### 11.6 The 2000-Character Deep Dive

The prompt field accepts up to 2,000 characters. For AAA cinematic or complex productions, use the full character budget:[^22][^19]
- Include all 6 prompt layers (genre, mood, instruments, tempo/key, production quality, exclusions)
- Add full lyrics
- Add structural timing cues
- Add multilingual instructions if needed
- Add contextual use-case intent

However, note: for some genres, just 5–8 evocative words will outperform a 2,000-character prompt. Know when to use brevity.[^19]

### 11.7 Conversational Editing (Post-Generation)

After first generation, use natural language instructions to refine:[^12]
- `"Make the drums more prominent and punchy"`
- `"Add a subtle string pad underneath the chorus"`
- `"Reduce the reverb on vocals for a more intimate feel"`
- `"Introduce a guitar solo in the bridge section"`
- `"Give me more outro"` / `"Give me more of a climax"`[^19]
- `"Extend the intro by 10 seconds"`
- Literally: `"Give me more"` works as a valid directional instruction[^19]

### 11.8 The Seed for Reproducibility

Set an integer seed to lock random initialization. The same prompt + seed = the same output every time. Use this to:[^6]
- Iterate with only duration or format changes
- Share a specific generation configuration with collaborators
- Maintain consistency across a series of tracks

### 11.9 Contradictory Instruction Avoidance

Prompts requesting opposing qualities force the model to reconcile conflicting directions, producing muddled output. Always use compatible modifiers:[^12]
- ❌ `energetic but calm`, `aggressive yet peaceful`
- ✅ `energetic but controlled`, `calm with subtle forward momentum`

### 11.10 Reference Context Over Attribute Lists

Describing use-case context often outperforms listing musical attributes:[^12]
- ❌ `happy upbeat music with guitars`
- ✅ `background music for a coffee shop commercial, friendly and inviting`
- ✅ `soundtrack for a high-adrenaline video game boss battle`

***

## 12. Stem Separation

ElevenLabs introduced AI-powered stem separation, enabling post-generation isolation of individual elements.[^26][^27]

### 12.1 Stem Options

| Tier | Stems Available | Cost |
|---|---|---|
| 2-stem | Vocals + Instrumental | 0.5× generation cost[^26] |
| 4-stem | Vocals, Drums, Bass, Other | 1× generation cost[^26] |
| 6-stem | Vocals, Drums, Bass, Melody, Harmony, Other | 1× generation cost[^27] |

### 12.2 Using Stems

1. Generate a track in ElevenCreative (UI) or via API
2. Click the download button → select `Generate Stems`[^28]
3. Wait 10–20 seconds for processing[^28]
4. Download as a ZIP archive containing individual WAV/MP3 files[^28]
5. Import into your DAW (Ableton, Logic, FL Studio, Pro Tools) for mixing and mastering

### 12.3 API Access for Stem Separation

```
POST https://api.elevenlabs.io/v1/music/separate-stems
```

Documentation: `https://elevenlabs.io/docs/api-reference/music/separate-stems`[^26]

***

## 13. Music Inpainting (Enterprise Feature)

Music inpainting allows modification of specific sections of a song while keeping the rest unchanged. This is an **enterprise-only feature** — contact ElevenLabs sales for access.[^11]

### 13.1 Core Inpainting Workflow

1. Generate a song with `store_for_inpainting: true` (or upload existing audio)
2. Reference stored sections with `source_from` to keep them unchanged
3. Omit `source_from` on the sections you want to regenerate[^11]

### 13.2 Negative Ranges

Edit only a sub-portion of a section using `negative_ranges`:[^11]
- Example: `negative_ranges: [{start_s: 8.0, end_s: 12.0}]` keeps seconds 0–8 and 12–15.5, regenerating only seconds 8–12[^11]

### 13.3 Inpainting Use Cases

- **Edit a single section:** Generate a movie trailer, then regenerate just the outro with different lyrics[^11]
- **Extend a song:** Add a new intro and outro to an existing song[^11]
- **Create seamless loops:** Generate a musical phrase, then add a "glue" section to create a perfect loop[^11]
- **Combine sections from multiple songs:** Mix-and-match the best sections from different generations[^11]

### 13.4 Upload Existing Audio for Inpainting

Enterprise users can upload external audio files for inpainting:[^29]
```
POST https://api.elevenlabs.io/v1/music/upload
Body (multipart): file=<audio_file>, extract_composition_plan=true
```
Setting `extract_composition_plan=true` reverse-engineers the uploaded audio into a full composition plan JSON.[^29]

***

## 14. Music Finetunes: Building a Custom Sound Model

Music Finetunes lets you train a custom version of the ElevenLabs Music model on your own audio, creating a personalized model that consistently generates outputs in your unique sonic identity.[^30][^2]

### 14.1 How Finetunes Work

1. Upload non-copyrighted tracks you own to ElevenCreative (automated copyright screening)[^2]
2. The Finetune is ready for use in approximately 5–10 minutes[^2]
3. Select your Finetune in the generation interface instead of the base model[^22]
4. Every generation — vocals, instrumentals, full tracks — reflects the trained tone and identity[^31]

### 14.2 Curated Finetunes

ElevenLabs ships 11 curated Finetunes covering a range of styles for users who don't have their own catalog. Available to Creator+ subscribers.[^31]

### 14.3 Finetune Best Practices

- Upload 5–15 high-quality tracks representative of your target style[^32]
- For genre-blending: train on your primary genre, then prompt with a secondary genre modifier[^32]
- Example: Train on Brazilian Funk → prompt with `jazz` modifier → get Brazilian Funk with jazzy tonality[^32]
- Use tags (e.g., `Afro House, groovy, upbeat`) to describe uploaded tracks[^33]
- Finetune prompts can match your reference files closely (exact genre) or diverge (layered hybrid)[^32]

### 14.4 Enterprise Finetunes

Enterprise customers may fine-tune on proprietary intellectual property they fully own. Custom terms negotiated directly.[^2]

***

## 15. Video-to-Music

ElevenLabs Studio includes a Video-to-Music flow that analyzes uploaded video content and generates a matching soundtrack.[^34][^35]

### 15.1 How It Works

1. Navigate to ElevenLabs Studio → click `Video to Music`[^34]
2. Upload any video
3. AI analyzes motion, color, pacing, and scene structure to compose a unique soundtrack[^34]
4. You receive an auto-generated prompt describing the detected context — editable before generation[^36]
5. Each upload returns multiple musical options[^34]
6. Refine prompt or video description in authenticated Studio for full style control[^34]

***

## 16. API Integration for AI Agents

### 16.1 Core API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/v1/music` | POST | Compose music from prompt or composition plan[^9] |
| `/v1/music/plan` | POST | Generate a composition plan from a text description[^24] |
| `/v1/music/stream` | POST | Stream music generation in real time[^37][^8] |
| `/v1/music/compose-detailed` | POST | Generate music + composition plan + full metadata[^38] |
| `/v1/music/upload` | POST | Upload audio for inpainting (Enterprise)[^39] |
| `/v1/music/separate-stems` | POST | Separate generated track into stems[^26] |

### 16.2 Authentication

All API calls require the `xi-api-key` header:[^40]
```bash
curl -X POST "https://api.elevenlabs.io/v1/music" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A fast-paced electronic track for a video game", "music_length_ms": 30000}' \
  --output output.mp3
```

### 16.3 Python SDK (Minimal AAA Example)

```python
from elevenlabs import ElevenLabs

client = ElevenLabs(api_key="YOUR_API_KEY")

audio = client.music.compose(
    prompt="Epic orchestral battle music, full orchestra, 120 BPM, D minor, timpani and brass, triumphant and relentless, great production quality, instrumental only",
    music_length_ms=180000,  # 3 minutes
    force_instrumental=True,
    output_format="wav_44100"  # CD quality
)

with open("battle_theme.wav", "wb") as f:
    f.write(audio)
```

### 16.4 Composition Plan via Python SDK

```python
from elevenlabs import ElevenLabs

client = ElevenLabs(api_key="YOUR_API_KEY")

composition_plan = {
    "positive_global_styles": ["cinematic", "orchestral", "epic", "120 BPM", "D minor"],
    "negative_global_styles": ["electronic", "lo-fi"],
    "sections": [
        {
            "section_name": "intro",
            "duration_ms": 15000,
            "positive_local_styles": ["quiet", "suspenseful", "low strings"],
            "lines": []
        },
        {
            "section_name": "main_theme",
            "duration_ms": 45000,
            "positive_local_styles": ["full orchestra", "powerful", "epic brass"],
            "lines": []
        },
        {
            "section_name": "outro",
            "duration_ms": 10000,
            "positive_local_styles": ["resolving", "warm"],
            "lines": []
        }
    ]
}

audio = client.music.compose(
    composition_plan=composition_plan,
    output_format="wav_44100"
)
```

### 16.5 JavaScript/TypeScript SDK

```typescript
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const elevenlabs = new ElevenLabsClient();

const track = await elevenlabs.music.compose({
  prompt: "A fast-paced electronic track for a high-adrenaline video game",
  musicLengthMs: 30_000,
  modelId: "music_v1",
});
```

### 16.6 Rate Limiting & Credit Costs

- Music is priced at **$0.30 per minute** of generated audio[^41]
- Stem separation: 0.5× generation cost for 2 stems; 1× for 4 stems[^26]
- Finetune creation: $1.50 per finetune[^41]
- Free plan: 11 minutes/month generation, no downloads[^42]
- Starter+: Commercial use licensing included[^42]
- All plans include API access; Pro tier unlocks 44.1kHz PCM output and 192kbps audio[^43]

### 16.7 Automated N8N Workflow (AI Agent Pattern)

For batch AI agent music generation:[^40]
1. Read track parameters (title, prompt, duration) from Google Sheets
2. Send to `/v1/music` API for each track
3. Upload generated MP3 to Google Drive
4. Update spreadsheet with download URL
5. Apply 1-minute wait between generations to avoid rate limiting
6. Name files with timestamp prefix: `song_yyyyMMdd`[^40]

***

## 17. Platform Features: ElevenCreative UI Guide

### 17.1 Generation Interface

1. **Number of Variants:** Select 1–4 simultaneous generation variants per prompt[^44]
2. **Duration:** Choose fixed lengths (30s, 1m, 2m) or `Auto` for dynamic length[^22]
3. **Genre and Mood tags:** Apply pre-defined style tags alongside your text prompt[^44]
4. **Prompt field:** Up to 2,000 characters of natural language[^19]
5. **Vocal/Instrumental toggle:** Toggle on for instrumental; add `instrumental only` in prompt for extra certainty[^44]

### 17.2 Timeline Editor

After generation, the timeline editor provides:[^26][^22]
- Visual composition structure with labeled sections
- Drag sections to reorder
- Delete underperforming sections
- Adjust section durations with handles
- Add `+` new sections and specify individual section styles
- Real-time word-level lyrics highlighting during playback[^26]
- Regenerate specific sections without re-rendering the full track[^26]
- History visibility for version comparison and iteration[^26]

### 17.3 Style Include/Exclude Feature

In the editor's left panel:[^16]
- **Include styles:** Add granular tags like `acoustic`, `four-on-the-floor kick`, `reverb-heavy vocals`, `analog warmth`
- **Exclude styles:** Add `repetitive structure`, `electronic elements`, `death metal`, `growling`
- These tags supplement (not replace) the main prompt

### 17.4 Enhance (Alpha) Button

The `Enhance` button automatically adds audio tags and style suggestions to your prompt. Use it as a starting point to discover effective tag combinations, then customize manually.[^45]

***

## 18. The Music Marketplace

Launched in March 2026, the Music Marketplace inside ElevenCreative allows creators to publish AI-generated tracks and earn revenue when they are downloaded or remixed by others.[^46][^47][^48]

- Browse catalog by **genre, mood, or tempo**[^46]
- Earn every time a paid subscriber downloads or remixes your track[^47]
- Available on all paid plans
- Only music generated with ElevenLabs' native model is eligible for the marketplace[^48]
- ElevenLabs' Voice Marketplace has paid creators over **$11 million** — the Music Marketplace uses the same economic model[^49]

***

## 19. ElevenLabs Flows: AI Agent Creative Pipeline

ElevenLabs Flows is a node-based visual workspace inside ElevenCreative for building full end-to-end creative pipelines:[^50][^51]
- Connects music generation, image/video models (Veo, Sora, Kling, Wan, FLUX, Seedance), Text-to-Speech (v3), voice cloning, lip-sync, and sound effects into one pipeline[^50]
- Define once, run unlimited variations automatically (swap product, avatar, hook, language)[^51]
- Supports A/B testing of different music styles against the same video asset

For AI agents building automated content production systems, Flows enables a single trigger to produce a complete audio-visual deliverable.[^50]

***

## 20. Commercial Use, Licensing & Copyright Policy

### 20.1 Licensing Background

Eleven Music was built on a licensed training dataset secured through partnerships with Merlin Network and Kobalt Music Group. These are opt-in arrangements where rights holders receive royalties proportional to how much their music is included in training.[^3][^4][^52]

### 20.2 Commercial Use by Plan

| Plan | Commercial Use Allowed |
|---|---|
| Free | No commercial use; no downloads; no streaming platforms[^42] |
| Starter+ | Yes — film, TV, ads, games, podcasts, social media[^5] |
| Enterprise | Custom terms; expanded rights for large-scale deployment[^42] |

### 20.3 Copyright Policy for Prompts

- **Artist names and band references are prohibited** in prompts — use genre/era descriptors instead[^5][^12]
- Copyrighted lyrics cannot be included in `lines` fields or prompts[^10]
- If copyrighted content is detected in styles, the API returns a `bad_composition_plan` error with a suggested alternative[^10]
- Generated content is not based on unlicensed or scraped musical works[^5]

***

## 21. Complete Audio Tags Reference (V3 / Voice + Music Context)

While Audio Tags are primarily a feature of ElevenLabs' Text-to-Speech (v3) model, they represent the tag-based control philosophy used across the platform. For music prompts, similar bracketed descriptors can be embedded in lyrics fields and style tags.[^53][^54][^55]

### 21.1 Emotional Tone Tags

```
[excited], [happy], [joyful], [optimistic], [cheerful], [blissful], [grateful]
[sad], [sorrowful], [melancholic], [longing], [nostalgic], [wistful], [regretful]
[angry], [furious], [frustrated], [bitter], [resentful], [jealous]
[nervous], [anxious], [apprehensive], [tense], [fearful], [terrified]
[calm], [serene], [peaceful], [zen], [relaxed]
[confident], [resolute], [brave], [courageous], [proud]
[curious], [inquisitive], [thoughtful], [contemplative]
[shocked], [surprised], [startled], [confused], [puzzled]
[tired], [sluggish], [lethargic]
[embarrassed], [ashamed], [guilty], [remorseful]
```


### 21.2 Non-Verbal Reaction Tags

```
[sighs], [gasps], [laughs], [laughs softly], [chuckles], [giggles], [snorts]
[cries], [sobs], [wails], [whimpers]
[gulps], [clears throat], [coughs], [yawns]
[groans], [grunts], [exhales], [inhales sharply]
[hmm], [uh-oh], [ahh], [ooh], [eek]
[panting], [breathless], [catches breath]
```


### 21.3 Volume & Energy Tags

```
[whispers], [whispered], [soft tone], [quiet], [low volume], [mellow]
[subdued], [medium volume], [projected], [resonant]
[loud], [loudly], [shouting], [booming], [roaring], [clarion]
[aggressive], [intense], [forceful], [emphatic]
[on mic], [off mic], [distant], [far away], [intimate], [near], [close]
[fading], [fading out], [swelling], [fading in]
[headphone level], [street level]
```


### 21.4 Delivery Direction Tags

```
[dramatically], [sarcastically], [matter-of-fact], [deadpan], [playfully]
[whiny], [childlike tone], [evil scientist voice], [pirate voice]
[fantasy narrator], [sci-fi AI voice], [classic film noir]
[flat], [cheerfully], [tenderly], [gently]
[hesitates], [stammers], [pauses], [resigned tone]
```


### 21.5 Accent and Dialect Tags

```
[British accent], [Australian accent], [Southern US accent]
[American accent], [French accent], [German accent]
[Scottish accent], [Irish accent], [Spanish accent]
[New York accent], [Boston accent], [Midwest accent]
[x accent] — replace x with any region/country
```


### 21.6 Pacing and Rhythm Tags

```
[rushed], [hurried], [fast pace], [lightning pace]
[slow], [dragging], [leisurely], [measured], [calculated]
[paused], [long pause], [hesitant pause], [dramatic pause]
[stammer], [stutter], [trailing off], [fading voice]
[syncopated], [jazzy rhythm], [legato], [staccato]
[accelerando], [ritardando]
```


### 21.7 Tag Best Practices

- **Limit to 1–2 words per tag** — longer tags cause instability and misinterpretation[^45]
- Tags can be placed anywhere in the script to shape real-time delivery[^53]
- Combine multiple tags in sequence: `[hesitant] I... [regretful] It just came out`[^55]
- **Break time control:** `<break t="1.5s" />` for timed pauses (up to 3 seconds)[^45]
- The `Enhance (Alpha)` button can automatically add tags to your script[^45]

***

## 22. Known Limitations and Workarounds

| Limitation | Impact | Workaround |
|---|---|---|
| No direct stem export from standard generation | Can't isolate instruments mid-session | Use Stem Separation API; or generate isolated "solo [instrument]" prompts[^1][^26] |
| Inpainting is enterprise-only | Can't edit sub-sections on standard plans | Build section-by-section in the timeline editor; use composition plans[^11] |
| Copyrighted artist references blocked | Cannot imitate specific artists | Use genre + era + production style descriptors[^12][^5] |
| Styles must be in English | Limits multilingual style direction | Lyrics can be any language; styles stay English[^10] |
| Duration is approximate in Advanced model | Hard video-sync requires post edit | Use `respect_sections_durations: true`; budget for post-production trim[^10][^6] |
| Very short sections (<5s) may not render distinctly | Loss of transition clarity | Keep sections ≥ 8–10 seconds minimum[^6] |
| No PCM output via Scenario (third-party) | Lower max quality in some integrations | Use direct ElevenLabs API; PCM requires Pro tier[^6][^8] |
| Vocal artifacts in `force_instrumental` mode | Rare bleed-through in vocal-heavy genres | Add `no vocals`, `fully instrumental` as additional style tags alongside flag[^6] |
| Maximum 30 sections per composition plan | Limits very complex arrangements | Use multiple generation passes and stitch in DAW[^10] |

***

## 23. Master Prompt Templates for AI Agent Deployment

These templates are designed for direct AI agent use. Substitute the bracketed placeholders to generate any genre on demand.

### 23.1 Universal AAA Template (Text Prompt)

```
[GENRE + SUBGENRE], [PRIMARY MOOD] and [SECONDARY MOOD], featuring [INSTRUMENT 1], [INSTRUMENT 2], and [INSTRUMENT 3], [BPM] BPM in [KEY] [SCALE], [STRUCTURE CUE], [PRODUCTION STYLE], [VOCAL INSTRUCTION], great production quality, no [EXCLUSION 1], no [EXCLUSION 2]
```

**Populated Example:**
```
Epic cinematic orchestral, triumphant and powerful, featuring soaring brass fanfares, driving percussion, and sweeping string movements, 120 BPM in D minor, builds from quiet intro to full orchestral climax at 1:00, studio recording, instrumental only, great production quality, no electronic elements, no synthesizers
```

### 23.2 Universal Composition Plan Template (API)

```json
{
  "positive_global_styles": ["[GENRE]", "[TEMPO] BPM", "[KEY]", "[MOOD]", "[PRODUCTION_STYLE]"],
  "negative_global_styles": ["[ANTI_GENRE]", "[UNWANTED_ELEMENTS]"],
  "sections": [
    {
      "section_name": "intro",
      "duration_ms": 15000,
      "positive_local_styles": ["quiet", "building", "[INTRO_INSTRUMENT]"],
      "lines": []
    },
    {
      "section_name": "verse",
      "duration_ms": 25000,
      "positive_local_styles": ["[VERSE_ENERGY]", "[VERSE_VOCALS]"],
      "lines": ["[VERSE_LINE_1]", "[VERSE_LINE_2]", "[VERSE_LINE_3]", "[VERSE_LINE_4]"]
    },
    {
      "section_name": "chorus",
      "duration_ms": 20000,
      "positive_local_styles": ["[CHORUS_ENERGY]", "[FULL_ARRANGEMENT]"],
      "lines": ["[CHORUS_LINE_1]", "[CHORUS_LINE_2]"]
    },
    {
      "section_name": "outro",
      "duration_ms": 10000,
      "positive_local_styles": ["resolving", "warm", "[FADE_TYPE]"],
      "lines": []
    }
  ]
}
```

### 23.3 Predefined Genre Parameter Table

| Genre | Tempo | Key | Instruments | Exclusions |
|---|---|---|---|---|
| Epic Cinematic | 110–130 BPM | D/E minor | Full orchestra, brass, timpani | Electronic, lo-fi |
| Synthwave | 95–115 BPM | F/A minor | Analog synth, arpeggios, gated reverb drums | Acoustic, live drums |
| Progressive House | 126–132 BPM | F/G minor | Chord stabs, rolling bass, sidechain | Organic, acoustic |
| Boom Bap Hip-Hop | 84–96 BPM | A/D minor | Dusty breaks, sub-bass, piano stabs | Electronic leads, trap hi-hats |
| Trap | 130–170 BPM | G#/B minor | 808 bass, hi-hat rolls, minimal melody | Live drums, acoustic |
| Lo-Fi Chillhop | 80–90 BPM | C/G major | Rhodes, brush drums, vinyl crackle | Heavy percussion, aggressive |
| Jazz | 120–200 BPM | Bb/Eb major | Upright bass, brushed snare, bebop piano | Electronic, synthesized |
| Acoustic Folk | 70–100 BPM | G/D major | Fingerpicked guitar, fiddle, mandolin | Drums, electric guitar |
| Dark Ambient | 60–80 BPM | Any minor | Pads, low drones, distant textures | Melody, percussion |
| Orchestral Rock | 100–140 BPM | E/A major | Distorted guitars, orchestra, epic drums | Electronic, synthetic |

***

## 24. Quality Assurance Workflow for AI Agents

For an AI agent to consistently produce AAA output, implement this verification checklist:

### 24.1 Pre-Generation Checklist

- [ ] Prompt includes genre AND subgenre (not just a broad label)
- [ ] Mood/emotional direction specified
- [ ] At least 2–3 specific instruments named
- [ ] BPM included
- [ ] Key signature included (for harmonic consistency)
- [ ] Vocal instruction explicit (`instrumental only` or vocal style)
- [ ] `great production quality` phrase included
- [ ] At least 2–3 explicit exclusion instructions
- [ ] Duration specified or `Auto` selected intentionally
- [ ] No artist names or copyrighted references in prompt

### 24.2 Post-Generation Evaluation Criteria

- [ ] Genre is clearly identifiable and consistent throughout
- [ ] BPM matches specification
- [ ] Unexpected vocal artifacts absent (if instrumental)
- [ ] Production quality feels studio-grade (no AI artifacts, glitching, or muddy frequencies)
- [ ] Song structure has appropriate beginning, middle, and end
- [ ] Emotional arc follows the intended mood progression
- [ ] Instrumentation matches specification

### 24.3 Iteration Protocol

If output fails the evaluation:
1. **Same prompt, new generation first** — randomness alone may solve it[^14]
2. **Add one targeted negative style** to remove the offending element
3. **Increase specificity** on the failing dimension (more BPM precision, different key)
4. **Use composition plans** if text prompts are not achieving structural control
5. **Try shorter generation first** (30s), validate quality, then extend[^22]

***

## 25. Use Case Playbooks

### 25.1 AAA Video Game Soundtrack

**Setup:** Composition plan with 5–7 sections; different energy levels per section; adaptive-music-ready stems
```
Positive global styles: ["orchestral RPG", "atmospheric", "A minor", "90 BPM"]
Negative global styles: ["vocals", "pop", "electronic"]
Sections: [exploration_ambient → dungeon_tension → combat_action → victory → overworld_loop]
```

### 25.2 Film Trailer Music

```
Extremely dark, tense and powerful, cinematic sound design, electronic hybrid, trailer music, evil, braam horns, impacts, boom, rising tension, completely instrumental, great production quality, 140 BPM, D minor
```


### 25.3 Podcast/YouTube Intro (Under 30 Seconds)

```
Upbeat and energetic corporate pop, modern and clean, 120 BPM in C major, punchy drums, bright synths, 20 seconds, instrumental only, button ending (no fade), great production quality
```

### 25.4 Meditation / Wellness App Background

```
Ethereal ambient soundscape, peaceful and meditative, slowly evolving pad textures, Tibetan bowl overtones, gentle nature undertones, no rhythm or percussion, no melody, 8-minute loop, instrumental only, no vocals, no fade in/out
```

### 25.5 Advertising Jingle (30 Seconds)

```
Cheerful and inviting commercial jingle, upbeat pop, female vocalist, catchy hook, bright acoustic guitar, light percussion, 120 BPM in G major, 30 seconds, suitable for family brand advertising, great production quality
```

### 25.6 Atmospheric Horror Score

```
Atmospheric horror score, deeply unsettling and eerie, dissonant string textures, distant piano stabs, sub-bass drones, irregular percussion, 60 BPM in B minor, no resolution, no melody, growing dread, instrumental only, great production quality
```

***

*This guide is based on official ElevenLabs documentation, API references, developer guides, community research, and expert practitioner insights compiled as of May 2026. All parameters and features reflect the current Eleven Music v1 model capabilities. Check ElevenLabs documentation at elevenlabs.io/docs for the latest updates.*

---

## References

1. [Musical Control](https://elevenlabs.io/docs/overview/capabilities/music/best-practices) - Master prompting for Eleven Music to achieve maximum musicality and control.

2. [Eleven Music | ElevenLabs Documentation](https://elevenlabs.io/docs/overview/capabilities/music) - Learn how to create studio-grade music with natural language prompts in any style with ElevenLabs.

3. [ElevenLabs Launches AI Music Model, Signs Licenses With ...](https://ground.news/article/elevenlabs-launches-an-ai-music-generator-which-it-claims-is-cleared-for-commercial-use) - On Tuesday (Aug. 5), AI audio company ElevenLabs announced the launch of Eleven Music, an AI model t...

4. [ElevenLabs launches an AI music generator, which it claims is ...](https://techcrunch.com/2025/08/05/elevenlabs-launches-an-ai-music-generator-which-it-claims-is-cleared-for-commercial-use/) - The AI audio-generation unicorn ElevenLabs announced the launch of a new model that allows users to ...

5. [ElevenLabs debuts AI music tool with commercial use rights](https://yourstory.com/ai-story/elevenlabs-eleven-music-ai-generator-launch)

6. [ElevenLabs Music: The Essentials - Scenario Knowledge Base](https://help.scenario.com/articles/6780010880-elevenlabs-music-the-essentials)

7. [View as Markdown - Replicate](https://replicate.com/elevenlabs/music/llms.txt)

8. [Stream music | ElevenLabs Documentation](https://elevenlabs.io/docs/api-reference/music/stream) - Stream a composed song from a prompt or a composition plan.

9. [Eleven Music API - Studio-Grade AI Music Generation - ElevenLabs](https://elevenlabs.io/music-api) - This integration allows businesses and developers to create conversational AI voice interactions tha...

10. [Composition plans | ElevenLabs Documentation](https://elevenlabs.io/docs/eleven-api/guides/how-to/music/composition-plans) - Precise control over music generation with structured JSON

11. [Music inpainting | ElevenLabs Documentation](https://elevenlabs.io/docs/eleven-api/guides/how-to/music/inpainting) - Music inpainting allows you to modify specific sections of a song while keeping the rest unchanged. ...

12. [ElevenLabs Music Prompt Guide - Fal.ai](https://fal.ai/learn/biz/eleven-music-prompt-guide) - Construct ElevenLabs Music prompts by establishing genre and mood first, then layering instrumentati...

13. [Are there any best practices for prompting Eleven Music?](https://help.elevenlabs.io/hc/en-us/articles/37781425844369-Are-there-any-best-practices-for-prompting-Eleven-Music) - The key to great results is a descriptive and detailed prompt. The model understands nuance, so the ...

14. [Why Your Suno Songs Sound Generic — Prompt Fixes + 20 Examples](https://musicsmith.ai/blog/ai-music-generation-prompts-best-practices) - Getting generic AI music? The prompt is why. This guide shows you how to write effective prompts for...

15. [Musical Control](https://elevenlabs.io/docs/best-practices/prompting/eleven-music) - Master prompting for Eleven Music to achieve maximum musicality and control.

16. [ElevenLabs - rules - AI Prompts & Code Snippets](https://www.getsnippets.ai/share/tags/sat-1b1b7752-80a5-49a5-8140-3627fcf8b782) - A shared tag with AI prompts and code snippets

17. [Master AI Music Prompting with Eleven Music — Ep 2: Music Prompting Tips from ElevenLabs Team](https://www.youtube.com/watch?v=Nvz4b3WWNWs) - Learn how to refine your AI music prompts and gain full creative control with Eleven Music.

Create ...

18. [ElevenLabs Music API - Studio-Grade AI Music Generation](https://musicapi.ai/eleven-music-api) - Create polished, fully-produced songs by describing genre, mood, and style in natural language. From...

19. [Making a Cinematic Masterpiece with Eleven Music — Ep 3 - YouTube](https://www.youtube.com/watch?v=fLjTN7PWL2w) - Making a Cinematic Masterpiece with Eleven Music — Ep 3: Music Prompting Tips from ElevenLabs Team ·...

20. [ElevenLabs Music | Create Custom-Length Songs & Instrumentals](https://aimusicgen.ai/elevenlabs-music) - Supports multilingual lyrics and ... ElevenLabs model supports a variety of languages, including Eng...

21. [ElevenLabs: AI Voice Generator - Apps on Google Play](https://play.google.com/store/apps/details?id=io.elevenlabs.coreapp&hl=en) - Available across 70+ languages from Spanish, French, German, Chinese (Mandarin and Cantonese) and Ja...

22. [Music](https://elevenlabs.io/docs/eleven-creative/products/music) - Generate and edit custom songs in any style using AI-powered music creation tools

23. [Music quickstart | ElevenLabs Documentation](https://elevenlabs.io/docs/eleven-api/guides/cookbooks/music) - Learn how to generate music with Eleven Music.

24. [Create composition plan | ElevenLabs Documentation](https://elevenlabs.io/docs/api-reference/music/create-composition-plan) - Create a composition plan for music generation. Usage of this endpoint does not cost any credits but...

25. [Ep 2: Music Prompting Tips from ElevenLabs Team : r/ElevenMusic](https://www.reddit.com/r/ElevenMusic/comments/1mpjzyt/master_ai_music_prompting_with_eleven_music_ep_2/) - Learn how to refine your AI music prompts and gain full creative control with Eleven Music. In this ...

26. [new tools for exploring, editing and producing music with AI](https://elevenlabs.io/blog/eleven-music-new-tools-for-exploring-editing-and-producing-music-with-ai)

27. [AI Stem Separation Technology by ElevenLabs Enables ...](https://blockchain.news/ainews/ai-stem-separation-technology-by-elevenlabs-enables-advanced-song-splitting-for-music-production) - According to ElevenLabs (@elevenlabsio), their AI-driven stem separation technology allows users to ...

28. [How to ISOLATE Individual Instruments in ElevenLabs Music with Stem Separation](https://www.youtube.com/watch?v=Mv2onySj6lY) - 👉  In this video, I will show you how to use stem separation in ElevenLabs Music to extract individu...

29. [Upload Music for Inpainting - ElevenLabs Knowledge | One](https://www.withone.ai/knowledge/elevenlabs/conn_mod_def::GJ2a2xFbWwI::_yALjThxSNKmqvUWaVf9Wg) - API knowledge for Upload Music for Inpainting on ElevenLabs. Method, parameters, response schema, an...

30. [Introducing Music Finetunes in ElevenCreative - ElevenLabs](https://elevenlabs.io/blog/introducing-music-finetunes-in-elevencreative) - Finetunes create a custom version of the ElevenLabs Music model fine-tuned to your sound. Once ready...

31. [ElevenLabs Lets You Train a Custom AI Music Model on Your Own ...](https://www.vp-land.com/p/elevenlabs-lets-you-train-a-custom-ai-music-model-on-your-own-catalog) - How It Works ... Users upload their own tracks to ElevenCreative, and the platform fine-tunes the El...

32. [Capturing Genre Nuance with Music Finetunes in ElevenCreative](https://www.youtube.com/watch?v=JNsjjb98Ees) - Blend Genres with Finetunes → https://elevenlabs.io/... By uploading targeted examples, you can push...

33. [Getting Started with Music Finetunes in ElevenCreative - YouTube](https://www.youtube.com/watch?v=8aISrxqaTbE) - to take more control over their sound and build truly personalized music models ... Using GPT-5 To C...

34. [Generate Music for Any Video with AI, Instant Video to Music Matching](https://elevenlabs.io/studio/video-to-music) - Upload a video and get AI-generated music to match in seconds. ElevenLabs creates original, high-qua...

35. [Introducing Video-to-Music flow in ElevenLabs Studio - LinkedIn](https://www.linkedin.com/posts/elevenlabsio_today-were-launching-a-new-video-to-music-activity-7362172590137692160-KNlF) - Today, we're launching a new Video-to-Music flow in ElevenLabs Studio. In one click, our Eleven Musi...

36. [ElevenLabs on Instagram: "You can now generate unique ...](https://www.instagram.com/reel/DNdL6l3qkFf/) - Let me show you how it works. In 11 Labs, head to studio and then click video to music. Upload a vid...

37. [August 20, 2025 | ElevenLabs Documentation](https://elevenlabs.io/docs/changelog/2025/8/20) - ElevenLabs provides APIs and SDKs for text to speech, voice cloning, speech to text, sound effects, ...

38. [Music | Agent Skills Library - Awesome MCP Servers](https://mcpservers.org/agent-skills/elevenlabs/music) - ElevenLabs Music Generation. Generate music from text prompts - supports instrumental tracks, songs ...

39. [Upload Music | ElevenLabs Documentation](https://elevenlabs.io/docs/api-reference/music/upload) - Upload a music file to be later used for inpainting. Only available to enterprise clients with acces...

40. [Automated AI music generation with ElevenLabs, Google Sheets ...](https://n8n.io/workflows/11047-automated-ai-music-generation-with-elevenlabs-google-sheets-and-drive/) - This workflow automates the creation, storage, and cataloging of AI-generated music using the Eleven...

41. [ElevenAPI Pricing for creators and businesses of all sizes](https://elevenlabs.io/pricing/api) - Explore ElevenAPI subscription plans and find the one that fits your needs. Choose from individual, ...

42. [Deprecated - ElevenLabs](https://elevenlabs.io/eleven-music-v1-terms-archived-nov-21-2025)

43. [ElevenLabs Pricing for Creators & Businesses of All Sizes](https://elevenlabs.io/pricing) - Explore all subscription plans and find which one is right for you. Choose from a range of individua...

44. [How to Use ElevenLabs Music Model 2025 (Step by Step)](https://www.youtube.com/watch?v=fjUixAyzW4c) - Discover how to use the ElevenLabs Music Model in 2025 with this step-by-step tutorial. Learn how to...

45. [List of V3 audio tags. : r/ElevenLabs - Reddit](https://www.reddit.com/r/ElevenLabs/comments/1l8k45e/list_of_v3_audio_tags/) - List of V3 audio tags. · Emotional tone: [EXCITED], [NERVOUS], [FRUSTRATED], [TIRED] · Reactions: [G...

46. [Introducing the Music Marketplace in ElevenCreative - ElevenLabs](https://elevenlabs.io/blog/introducing-the-music-marketplace-in-elevencreative) - Introducing the Music Marketplace in ElevenCreative. Publish tracks made in ElevenCreative and earn ...

47. [Today we launched the Music Marketplace in ElevenCreative ...](https://www.linkedin.com/posts/aneriamin_today-we-launched-the-music-marketplace-in-activity-7440420383268372480-SwPm) - Today we launched the Music Marketplace in ElevenCreative. Creators can now publish tracks made with...

48. [Creators Can Now Sell, Remix, and License AI-Generated Tracks](https://quasa.io/media/elevenlabs-launches-music-marketplace-creators-can-now-sell-remix-and-license-ai-generated-tracks) - In another major step toward mainstreaming AI music, ElevenLabs has officially opened its Music Mark...

49. [ElevenLabs Just Launched Music Marketplace! 🎵  🔥 #MusicMarketplace #ElevenLabs #AICreators](https://www.youtube.com/watch?v=YrqZGL8x32k) - 🚨 GAME-CHANGING AI MUSIC UPDATE!  

ElevenLabs just dropped the **Music Marketplace** inside ElevenC...

50. [Automate your entire creative workflow with ElevenLabs Flows](https://elevenlabs.io/flows) - Chain image, video, voice, and SFX into automated visual flows. Create once and generate unlimited c...

51. [ElevenLabs AI: Voice Cloning, Text-to-Speech, and AI Voice Agents](https://digino.org/ai-tools/eleven-labs-ai/) - ElevenCreative is the content production platform inside ElevenLabs. It lets you generate voiceovers...

52. [AI Unicorn ElevenLabs Rolls Out with AI Music Generator](https://www.digitalmusicnews.com/2025/08/05/elevenlabs-ai-music-generator/) - AI platform ElevenLabs announces a new model allowing users to generate music it claims is already c...

53. [ElevenLabs Audio Tags: More control over AI Voices](https://elevenlabs.io/blog/v3-audiotags) - They can be anything from [excited], [whispers], and [sighs] through to [gunshot], [clapping] and [e...

54. [Eleven v3 Audio Tags: Directing character performance in speech](https://elevenlabs.io/blog/eleven-v3-character-direction) - Common tags for character performance · Accents & dialects: [British accent], [Australian accent], [...

55. [Eleven v3 Audio Tags: Expressing emotional context in speech](https://elevenlabs.io/blog/eleven-v3-audio-tags-expressing-emotional-context-in-speech) - Common tags for emotional context ; Emotional states: [excited], [nervous], [frustrated], [sorrowful...

