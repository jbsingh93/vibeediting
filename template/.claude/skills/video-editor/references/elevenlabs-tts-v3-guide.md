<!-- ════════════════════════════════════════════════════════════════════════
     PIPELINE HEADER (how to use this guide in video-editor)
     The rest of this file (from "# The World's Most Comprehensive Guide…" down,
     ESPECIALLY §5 The Complete Audio Tags Reference and everything after it) is
     copied verbatim as the authoritative ElevenLabs v3 TTS reference.
     ════════════════════════════════════════════════════════════════════════ -->

# Using this guide with the ElevenLabs TTS capability

**Read this header first, then use §5 (Audio Tags) → §22 below as the reference.** This
governs how this pipeline directs VO. Companion: [elevenlabs-audio.md](elevenlabs-audio.md)
(music/SFX/TTS overview, output paths, loudnorm, cost). Capability CLI:
`tsx capabilities/generate/elevenlabs-tts.ts`.

### The one thing that unlocks everything: **audio tags need `eleven_v3`**
- Audio tags (`[excited]`, `[whispers]`, `[laughs]`, `[pause]`, `[British accent]`, …) **only
  work on `eleven_v3`**. The default model `eleven_multilingual_v2` **ignores most
  tags** (it's the stable, no-tags narrator). To direct a performance, pass **`--v3`**:
  ```bash
  tsx capabilities/generate/elevenlabs-tts.ts @public/<project>/voiceovers/script.txt \
    public/<project>/voiceovers/vo-en-…-v1.mp3 --v3 --stability 0.45 --similarity 0.8 --seed 7
  ```
- **Model choice:** `--v3` for expressive/character/emotional VO (hooks, ads, story beats);
  default `multilingual_v2` for long, even, dependable narration where consistency > expression
  (§2, §4.1). Both are multilingual (70+ languages on v3; pass `--lang` for an explicit code).

### Script-flag → guide mapping (`elevenlabs-tts`)
| Flag | Guide § | Pipeline default for v3 + tags |
|---|---|---|
| `--stability` | §4.1 | **0.4–0.5** (Natural) — Robust (>0.65) kills tag responsiveness |
| `--similarity` | §4.2 | 0.75–0.85 |
| `--style` | §4.3 | 0.0–0.3 (start at 0) |
| `--no-speaker-boost` | §4.4 | leave boost ON for ads/VO; OFF for soft/ASMR |
| `--speed` | §4.5 | 1.0 (generate slightly slow, speed up in post if needed) |
| `--seed` | — | set it; v3 is nondeterministic, so also generate 2–3 takes and pick best (§17.3) |

### Pipeline rules for generated VO (in addition to the guide)
1. **Tags are always English**, even in a non-English script (§5.1): `[whispers]`, not a
   translated tag. Non-English text + English tags is correct. v3 supports 70+ languages (§19).
2. **Normalize numbers/dates/symbols to spoken words** in the script's language before synthesis
   (§12.2): e.g. `5,000` → `five thousand`, `0.9%` → `zero point nine percent`, `9:23` → `nine
   twenty-three`. Spell out acronyms (`API` → `A-P-I`) when they should be read as letters.
3. **Respect the tone rules** in `brand/brand.json` (`tone.sellStyle: soft|neutral|direct`) and
   `brand/brand-voice.md` — tags change *delivery*, not the register your brand voice defines.
4. **Voice:** use the voice ID from `brand/brand.json` (`voice.elevenlabsVoiceId`); it ships empty
   until the user sets one (UI API-Keys/Brand pages, or elevenlabs.io/voices). An Instant Voice
   Clone (IVC) is ⭐⭐⭐⭐ for v3 (§3.1) and needs **Starter tier+** for API use (see
   elevenlabs-audio.md). PVCs are not yet v3-optimized (§3.1).
5. **Tag density 3–8 per 100 words** (§9.1); max 2–3 stacked tags; no contradictions (§9.3).
6. **`[pause]` / `…` / `—` for rhythm — never SSML `<break>`** (not supported in v3, §5.6).
7. Generated VO is still audio: **caption it from the produced file with Whisper**
   (`tsx capabilities/ingest/transcribe.ts`, timing ≠ the script's tags), and **loudnorm the
   final mix to -14 LUFS**. Keep VO segments at equal LUFS (~footage level) — a quiet-outro
   mismatch is a real bug; match levels across hook/outro.

### Fast path
Write the tagged script → `@file` into `elevenlabs-tts --v3` (Natural stability) →
generate 2–3 seeds, pick best → Whisper-caption → mix + loudnorm. Everything below is the deep
reference; jump to **§5 Audio Tags**, **§4 Voice Settings**, **§9 Tag Density**, **§14 Best
Practices**, **§17 Troubleshooting** most often.

---

# The World's Most Comprehensive Guide to Human-Like TTS with ElevenLabs v3

> **Purpose:** A definitive, AI-agent-ready reference for producing 100% human-like speech using ElevenLabs Eleven v3. Every setting, every audio tag, every prompting strategy, and every best practice is documented here. Hand this document to any LLM/AI agent and it will be able to direct ElevenLabs v3 to produce authentic human-sounding output.

***

## 1. What Is Eleven v3 and Why It Matters

Eleven v3 is ElevenLabs' most emotionally rich and expressive speech synthesis model. Unlike traditional TTS systems that simply read text aloud, v3 allows users to **direct a performance** — controlling emotion, pacing, character, and delivery through intuitive inline text annotations called **Audio Tags**. The model understands text context at a deeper level, following emotional cues, tone shifts, and speaker transitions more naturally than any previous generation.[^1][^2][^3]

v3 supports over 70 languages, has a 5,000-character limit per request, and supports natural multi-speaker dialogue through both the UI and the new Text to Dialogue API. Think of earlier models (v2, v2.5) as a voice actor reading a script. Eleven v3 is a voice actor *performing* that script — with you as the director.[^2][^3][^4][^5][^6]

**API model ID:** `eleven_v3`[^7]

**Key differentiators vs. v2:**

| Feature | Eleven v3 | Eleven Multilingual v2 |
|---|---|---|
| Audio Tag Support | Full range of emotions, direction, effects[^2] | Basic tags only (pauses, breaks)[^2] |
| Languages | 70+[^2] | 29[^8] |
| Multi-Speaker Dialogue | Yes (Dialogue Mode + API)[^9] | No[^2] |
| Emotional Range | Highest[^8] | High[^8] |
| Character Limit | 5,000[^6] | 10,000[^8] |
| PVC Support | Limited (in progress)[^1] | Full[^10] |

***

## 2. Model Architecture and Available Models

ElevenLabs offers several models. Choosing the right one is essential:[^8]

| Model ID | Best For | Latency | Languages | Char Limit |
|---|---|---|---|---|
| `eleven_v3` | Emotion, drama, storytelling, characters[^8] | ~1-2s | 70+[^2] | 5,000[^6] |
| `eleven_multilingual_v2` | Premium quality, audiobooks, narration[^8] | ~1-2s | 29[^8] | 10,000[^8] |
| `eleven_flash_v2_5` | Real-time agents, chatbots[^8] | ~75ms[^8] | 32[^8] | 40,000[^8] |
| `eleven_flash_v2` | Real-time (legacy Flash)[^6] | ~75ms | 32 | 40,000 |

**When to use v3:** Character discussions, audiobook production, emotional dialogue, multi-character scenes, any content where expressiveness and human-like delivery is paramount.[^8]

**When NOT to use v3:** Real-time agents requiring <200ms response (use Flash v2.5), long-form stable narration where consistency matters more than expressiveness (use Multilingual v2).[^6]

***

## 3. Voice Selection — The Single Most Important Decision

The voice choice is the **most critical parameter** for Eleven v3. Audio tags perform dramatically differently across voices. A voice trained on whisper-heavy samples will not suddenly shout convincingly from a `[shout]` tag — and vice versa.[^11][^12]

### 3.1 Voice Types and v3 Compatibility

| Voice Type | v3 Performance | Recommendation |
|---|---|---|
| Designed Voices (ElevenLabs library) | ⭐⭐⭐⭐⭐ Excellent | Best for production[^3] |
| Pre-made Library Voices (Adam, Rachel, Bella) | ⭐⭐⭐⭐⭐ Excellent | Curated for v3[^3] |
| Instant Voice Clones (IVC) | ⭐⭐⭐⭐ Very Good | Great for diverse characters[^3] |
| Professional Voice Clones (PVC) | ⭐⭐ Limited | Not yet fully optimized for v3[^1][^10] |

PVCs are currently not fully optimized for Eleven v3, resulting in potentially lower clone quality compared to earlier models. During this research preview, use an IVC or a designed voice if you need v3 features — PVC optimization is coming.[^1]

### 3.2 Voice Selection Strategy

- **Emotionally diverse voices:** For expressive IVC voices, vary emotional tones across the recording — include both neutral and dynamic samples.[^11]
- **Targeted niche voices:** For specific use cases like sports commentary, maintain consistent emotion throughout the training dataset.[^11]
- **Neutral voices:** Neutral voices tend to be more stable across languages and styles, providing reliable baseline performance.[^11]
- **Match voice to tags:** Ensure the voice's natural character aligns with the tags you plan to use. A formal, measured voice may not respond well to playful tags like `[giggles]`.[^11]

### 3.3 Creating an Instant Voice Clone (IVC) for v3

For maximum tag responsiveness, creating an optimized IVC is recommended:[^10]

- **Recording environment:** Choose a location with minimal room echo/reverb — a vocal booth or DIY "blanket fort" works.[^10]
- **Microphone:** A professional XLR mic ($150-$300 range, e.g., Audio-Technica AT2020 + Focusrite interface).[^10]
- **Pop filter:** Essential to avoid plosives and breath artifacts.[^10]
- **Recording format:** WAV files at 44.1kHz or 48kHz with at least 24-bit depth.[^10]
- **Levels:** Aim for peaks of -6 dB to -3 dB and average loudness of -18 dB.[^10]
- **Consistency:** If recording animated voice, keep it animated throughout. If subdued, keep it subdued. Mixing styles confuses the AI.[^10]
- **Duration:** 1-5 minutes produces good IVC results; 2 minutes minimum recommended.[^13][^14]
- **Content:** Use your own writing as source material for a more natural, expressive clone.[^13]

For Professional Voice Cloning (PVC): at least 30 minutes of clean audio; 3 hours is optimal. Be extremely judicious — unnatural pauses or sentence fragments in training audio will appear in the clone.[^14][^13]

***

## 4. Complete Voice Settings Reference

These settings fine-tune voice characteristics independently of audio tags. They are available via UI sliders and the API.[^15][^16]

### 4.1 Stability (`stability`)

**Range:** 0.0 – 1.0 | **Default:** 0.5 | **API key:** `stability`[^17]

The **most important setting in v3**. Controls how closely the generated voice adheres to the original reference audio and how much emotional variation occurs between generations.[^18][^15][^11]

| Value Range | Behavior | Named Mode | Use Case |
|---|---|---|---|
| 0.0 – 0.35 | Maximum expressiveness, highest emotional range, prone to hallucinations[^12] | **Creative** | Dramatic storytelling, character acting[^12] |
| 0.35 – 0.65 | Balanced, closest to original voice, good responsiveness to tags[^12] | **Natural** | General purpose, audiobooks, conversations[^12] |
| 0.65 – 1.0 | Highly stable, consistent, but less responsive to audio tags — similar to v2 behavior[^12] | **Robust** | Technical narration, consistent corporate voice[^12] |

**Critical rule:** For maximum expressiveness with audio tags, use **Creative or Natural** settings. Robust mode significantly reduces the model's responsiveness to directional prompts.[^18][^11]

**Recommended ranges by use case:**
- Audiobooks/narration: 0.5–0.6[^3]
- Character performance/drama: 0.3–0.5[^3]
- Professional/corporate: 0.6–0.8[^6]
- Customer support: 0.7–0.9[^6]

### 4.2 Similarity Boost (`similarity_boost`)

**Range:** 0.0 – 1.0 | **Default:** 0.75 | **API key:** `similarity_boost`[^15]

Determines how closely the AI should adhere to the original voice when attempting to replicate it. Higher values make the output sound more like the source voice, but may amplify audio artifacts if the original recording had background noise.[^17][^15]

| Value | Effect |
|---|---|
| 0.0 – 0.5 | More flexible, allows more natural/expressive tones[^19] |
| 0.5 – 0.8 | Good balance between natural delivery and voice accuracy[^19] |
| 0.8 – 1.0 | Tight adherence to source voice, ideal for voice cloning accuracy[^19] |

**Sweet spot:** 0.75 for most cases. Use 0.7–0.85 when using v3 audio tags.[^3][^6]

### 4.3 Style Exaggeration (`style`)

**Range:** 0.0 – 1.0 | **Default:** 0.0 | **API key:** `style`[^15]

Attempts to amplify the unique speaking style and character of the original voice. Only available for v2+ and v3 models. Higher values make the voice more "characterful" but can reduce stability.[^15][^17]

| Value | Effect |
|---|---|
| 0.0 | Natural, neutral style (default — recommended starting point)[^6] |
| 0.2–0.4 | Subtle amplification, good for narration[^6] |
| 0.5–0.7 | Noticeable style exaggeration, good for characters[^3] |
| 0.7–1.0 | Heavy exaggeration, dramatic effect, risk of instability[^6] |

**Important:** Style exaggeration consumes additional computational resources and may increase latency if set above 0. Start at 0.0 and increase only if needed.[^15]

### 4.4 Speaker Boost (`use_speaker_boost`)

**Type:** Boolean | **Default:** `true` | **API key:** `use_speaker_boost`[^15]

Post-processing enhancement that boosts the similarity to the original speaker — making the voice sound fuller and more powerful, as if recorded in a professional studio. Using this setting requires slightly higher computational load, increasing latency.[^19][^17][^15]

- **Turn ON:** Professional narration, YouTube videos, ads, podcasts, audiobooks[^19]
- **Turn OFF:** Soft, gentle, cinematic, ASMR, or whisper-style voices[^19]
- **Generally:** Leave on unless experiencing artifacts[^17]

### 4.5 Speed (`speed`)

**Range:** 0.25 – 4.0 | **Default:** 1.0 | **API range for Agents Platform:** 0.7–1.2[^17]

Controls the speech speed multiplier. Values below 1.0 slow speech; values above 1.0 speed it up.[^17][^11]

| Value | Effect | Use Case |
|---|---|---|
| 0.7 – 0.85 | Deliberate, weighty, thoughtful[^11] | Emotional moments, audiobooks |
| 1.0 | Natural default pace[^17] | General use |
| 1.1 – 1.2 | Slightly energetic[^11] | Upbeat content |
| Above 1.2 | Fast, may affect quality[^11] | Action sequences, urgency |

**Best practice:** In post-processing, it is easier to speed up slow speech than to slow down fast speech. Generate slightly slower and adjust in post if needed.[^20]

### 4.6 Recommended Settings by Use Case

| Use Case | Stability | Similarity | Style | Speaker Boost | Speed |
|---|---|---|---|---|---|
| Audiobook narration[^6] | 0.6–0.8 | 0.7 | 0.0–0.2 | ON | 0.9–1.0 |
| Character voices/drama[^6] | 0.3–0.5 | 0.8 | 0.5–0.7 | ON | Variable |
| Customer support[^6] | 0.7–0.9 | 0.9 | 0.0 | ON | 1.0 |
| Emotional narration[^19] | 0.4–0.5 | 0.75 | 0.2–0.4 | Situational | 0.9 |
| Conversational AI agent[^19] | 0.5–0.6 | 0.75 | 0.0 | OFF | 1.0 |
| TikTok/Reels content[^19] | 0.4–0.5 | 0.75 | 0.3–0.4 | ON | 1.0–1.1 |

***

## 5. The Complete Audio Tags Reference

Audio Tags are words wrapped in square brackets placed inline in your script. They tell the AI **how** to deliver the text, not just **what** to say. They use natural language understanding — the model was trained to recognize emotional states, delivery styles, and character archetypes from conversational descriptions.[^1][^3]

### 5.1 Syntax Rules

| Element | Format | Example |
|---|---|---|
| Basic tag | `[tag]` | `[excited]`[^3] |
| Multiple tags | `[tag1][tag2]` | `[quietly][nervous]`[^3] |
| Placement | Before or within text | `[whispers] I know the secret`[^3] |
| Case sensitivity | Not case-sensitive | `[EXCITED]` = `[excited]`[^3] |
| Language of tags | Always write tags in English | `[French accent]` not `[français accent]`[^3] |

Tags affect the text that follows until a new tag is introduced. They can be placed anywhere in a script — before a sentence, mid-sentence, or at the start of a new paragraph.[^21][^1]

### 5.2 Emotion Tags

These tags set the emotional tone of the voice.[^1]

**Primary Emotions:**

| Tag | Effect | Intensity Variants |
|---|---|---|
| `[happy]` | Joy, positivity[^21] | `[slightly happy]`, `[very happy]` |
| `[excited]` | High energy, enthusiasm[^3] | `[mildly excited]`, `[extremely excited]` |
| `[sad]` | Melancholy, sorrow[^22] | `[a bit sad]`, `[deeply sad]` |
| `[sorrowful]` | Deep grief[^1] | `[utterly sorrowful]` |
| `[angry]` | Frustration, rage[^22] | `[mildly angry]`, `[furious]` |
| `[frustrated]` | Agitated, annoyed[^3] | `[slightly frustrated]` |
| `[nervous]` | Anxiety, worry[^3] | `[somewhat nervous]`, `[very nervous]` |
| `[scared]` | Fear[^3] | `[terrified]` |
| `[terrified]` | Extreme fear[^3] | — |
| `[curious]` | Interested, inquisitive[^7] | — |
| `[mischievously]` | Playful, impish[^7] | — |
| `[sarcastic]` | Ironic, sarcastic tone[^7] | `[sarcastically]` |
| `[crying]` | Deep sadness, tears[^7] | — |
| `[calm]` | Peaceful, measured[^3] | — |
| `[tired]` | Low energy, weary[^3] | `[exhausted]` |
| `[wistful]` | Nostalgic sadness[^3] | — |
| `[resigned]` | Accepting defeat[^3] | `[resigned tone]`[^22] |
| `[conflicted]` | Internal struggle[^3] | — |
| `[hopeful]` | Cautious optimism[^3] | — |
| `[regretful]` | Remorseful[^3] | `[regretfully]` |
| `[awestruck]` | Wonder, amazement[^3] | `[awe]`[^1] |
| `[smug]` | Self-satisfied, gloating[^3] | — |
| `[bitter]` | Resentful[^3] | — |
| `[dramatic]` | Theatrical, intense[^3] | `[dramatic tone]`[^1] |
| `[playfully]` | Teasing, fun[^3] | — |
| `[professionally]` | Business-like, formal[^3] | — |
| `[condescending]` | Superior, patronizing[^3] | — |
| `[cheerfully]` | Upbeat, happy[^22] | — |
| `[flatly]` | Flat, neutral[^22] | — |
| `[deadpan]` | Zero emotion, dry[^3] | — |
| `[enthusiastic]` | High positivity and energy[^3] | — |
| `[determined]` | Resolved, committed[^3] | — |
| `[triumphant]` | Victorious[^3] | — |
| `[hesitant]` | Unsure, uncertain[^3] | `[hesitantly]` |
| `[timidly]` | Shy, soft[^23] | — |
| `[gravely]` | Solemn, serious[^3] | — |
| `[ominous]` | Threatening, dark[^3] | — |
| `[mysterious]` | Intriguing, secretive[^3] | — |
| `[conspiratorial]` | Secretive, plotting[^3] | — |

### 5.3 Delivery Direction Tags

These tags control vocal volume, energy, and manner of speaking.[^12][^1]

**Volume & Energy:**

| Tag | Effect | Use Case |
|---|---|---|
| `[whispers]` / `[whispering]` | Very quiet, breathy, intimate[^3][^21] | Secrets, ASMR, intimacy |
| `[quietly]` / `[speaking softly]` | Subdued volume[^3][^21] | Sad moments, introspection |
| `[loudly]` | Increased volume[^3] | Announcements, excitement |
| `[shouts]` / `[shouting]` | Maximum volume[^3][^21] | Emergencies, anger, cheering |
| `[raised voice]` | Elevated but not shouting[^3] | Emphasis, mild urgency |
| `[urgently]` | Pressing, time-sensitive[^3] | Calls to action, emergencies |
| `[intensely]` | High energy and focus[^3] | Drama, confrontation |

**Pacing & Speed Delivery:**

| Tag | Effect | Use Case |
|---|---|---|
| `[slowly]` | Deliberate pace[^23] | Emphasis, suspense |
| `[quickly]` | Rapid delivery[^23] | Urgency, excitement |
| `[rushed]` | Hurried, frantic[^23][^1] | Panic, time pressure |
| `[drawn out]` | Extended pronunciation[^23][^1] | Emphasis, sarcasm |
| `[rapid-fire]` | Very fast[^3] | Lists, action sequences |
| `[deliberate]` | Intentional, careful pace[^23] | Important instructions |
| `[slows down]` | Decelerating[^3] | Important moments |
| `[picks up pace]` | Accelerating[^3] | Building tension |

**Hesitation & Rhythm:**

| Tag | Effect | Use Case |
|---|---|---|
| `[stammers]` | Stuttering[^23] | Nervousness, shock |
| `[stuttering]` | Halting speech[^24] | Character trait |
| `[repeats]` | Repeating words[^23] | Uncertainty |
| `[emphasized]` | Stress on word/phrase[^3] | Importance, weight |
| `[understated]` | Downplayed delivery[^3] | Subtlety, sarcasm |
| `[monotone]` | Flat, no variation[^3] | Boredom, robots |
| `[sing-song]` | Musical quality[^3] | Children's content, mockery |

### 5.4 Human Reaction Tags

These add non-verbal sounds that make speech feel truly human. They are among the most powerful tags for realism.[^1]

| Tag | Sound | Use Case |
|---|---|---|
| `[laughs]` / `[laughing]` | Natural chuckling[^7][^21] | Joy, amusement |
| `[laughs harder]` | Escalating laughter[^12] | Building amusement |
| `[laughs softly]` | Quiet giggle[^1] | Gentle amusement |
| `[starts laughing]` | Beginning of laugh[^12] | Onset of humor |
| `[wheezing]` | Breathless laughter[^12] | Extreme amusement |
| `[giggles]` | Light, playful laugh[^11] | Playfulness |
| `[sighs]` | Exhale of resignation[^7][^22] | Disappointment, tiredness |
| `[exhales]` | Audible breath out[^7][^6] | Relief, effort |
| `[inhales]` | Audible breath in[^12] | Preparation, shock |
| `[gasps]` / `[gasp]` | Sharp intake of breath[^22][^6] | Shock, surprise |
| `[gulps]` | Swallowing nervously[^22] | Fear, anticipation |
| `[swallows]` | Swallowing sound[^11] | Tension, realism |
| `[clears throat]` | Attention-getting sound[^1][^21] | Preparation, authority |
| `[snorts]` | Involuntary snort[^7] | Suppressed laughter, derision |
| `[crying]` | Tearful vocalization[^7] | Deep sadness |
| `[panting]` | Rapid breathing[^25] | Exertion, fear |
| `[breathes]` | Natural breathing sound[^3] | Realism, physical exertion |
| `[yawning]` | Yawn sound[^3] | Tiredness |
| `[woo]` | Exclamation of excitement[^12] | Celebration |

### 5.5 Sound Effects Tags

Eleven v3 can embed environmental and action sounds directly into speech generation:[^21]

| Tag | Sound | Use Case |
|---|---|---|
| `[gunshot]` | Firearm sound[^12] | Action scenes |
| `[explosion]` | Explosive sound[^12][^26] | Drama, action |
| `[applause]` | Audience clapping[^12] | Presentations, performances |
| `[clapping]` | Clapping sound[^12][^6] | Celebrations, acknowledgment |
| `[door creaks]` | Creaking door[^21] | Atmospheric, horror |
| `[bird chirping]` | Bird sounds[^21] | Environmental ambiance |

### 5.6 Pause and Timing Tags

| Tag | Duration | Use Case |
|---|---|---|
| `[brief pause]` | ~0.5 seconds[^3] | Quick thought |
| `[pause]` | ~1 second[^3] | Standard dramatic beat |
| `[long pause]` | ~2-3 seconds[^3] | Major transitions, weight |
| `[beat]` | Theatrical pause[^3] | Drama, comedy timing |
| `[continues softly]` | Gentle resumption[^3] | After interruption |
| `[continues after a beat]` | Resume with pause[^23] | Narrative rhythm |

**Note:** Eleven v3 does NOT support SSML `<break time="x.xs" />` tags. Use audio tags and punctuation (ellipses `…`, dashes `—`) to control pauses in v3. SSML break tags are supported on v2 models only.[^20][^11]

### 5.7 Accent and Language Tags

Switch regional speech patterns mid-script without changing models.[^4]

**English Varieties:**

| Tag | Accent |
|---|---|
| `[American accent]` | General American[^4] |
| `[British accent]` | Received Pronunciation[^4] |
| `[Australian accent]` | Australian English[^4] |
| `[Irish accent]` | Irish English[^4] |
| `[Scottish accent]` | Scottish English[^4] |
| `[New York accent]` | New York dialect[^3] |
| `[Southern US accent]` | Southern American[^4] |
| `[Cockney accent]` | London working-class[^3] |
| `[Received Pronunciation]` | Formal British RP[^3] |
| `[Welsh accent]` | Welsh English[^3] |
| `[Boston accent]` | Boston dialect[^3] |

**International Accents:**

| Tag | Accent |
|---|---|
| `[French accent]` | French-accented English[^4] |
| `[German accent]` | German-accented English[^4] |
| `[Spanish accent]` | Spanish-accented English[^4] |
| `[Italian accent]` | Italian-accented English[^4] |
| `[Russian accent]` | Russian-accented English[^4] |
| `[Indian English]` | Indian English accent[^4] |
| `[Japanese accent]` | Japanese-accented English[^3] |
| `[strong X accent]` | Strong version of any accent (replace X)[^12] |

**Character Voices:**

| Tag | Effect |
|---|---|
| `[pirate voice]` | Gruff, sea-faring tone[^4] |
| `[robot voice]` / `[robotic tone]` | Mechanical, monotone[^4] |
| `[evil scientist voice]` | Menacing, intellectual[^3] |
| `[childlike tone]` | Young, innocent[^3] |
| `[elderly voice]` | Aged, wise[^3] |
| `[superhero voice]` | Heroic, commanding[^3] |
| `[narrator voice]` | Formal, storytelling[^3] |
| `[gruff voice]` | Rough, tough[^3] |

### 5.8 Dialogue Flow Tags (Multi-Speaker)

These tags control natural conversation dynamics:[^3]

| Tag | Effect | Use Case |
|---|---|---|
| `[interrupting]` | Cuts off previous speaker[^1] | Arguments, excitement |
| `[overlapping]` | Simultaneous speech[^1] | Chaos, agreement |
| `[cuts in]` | Abrupt entry[^3] | Emergency, correction |
| `[trailing off]` | Sentence fades[^3] | Distraction, realization |
| `[continues]` | Resumes after interruption[^3] | Persistence |
| `[explaining]` | Teaching, expository tone[^21] | Instructions, storytelling |

### 5.9 Special and Experimental Tags

| Tag | Effect | Note |
|---|---|---|
| `[sings]` | Singing voice[^12] | Experimental, voice-dependent |
| `[fart]` | Sound effect[^12] | Experimental/comedy |
| `[stream of consciousness]` | Internal thought flow[^3] | Literary effect |
| `[documentary style]` | Factual, educational[^3] | Non-fiction narration |
| `[fairy tale narrator]` | Whimsical, magical[^3] | Children's stories |
| `[omniscient narrator]` | All-knowing voice[^3] | Classic fiction |
| `[unreliable narrator]` | Questionable truth[^3] | Mystery, psychology |

**Warning:** Experimental tags may yield inconsistent results across different voices. Always test before production use.[^12]

***

## 6. Punctuation as a Control Mechanism

In v3, punctuation significantly affects delivery and should be treated as a performance tool:[^12][^11]

| Punctuation | Effect | Example |
|---|---|---|
| `…` (ellipses) | Pause, weight, hesitation[^11] | `I don't know… maybe.` |
| `—` (em dash) | Abrupt pause, interruption[^20] | `He said—then stopped.` |
| `-` (hyphen) | Short pause[^20] | `One - two - three.` |
| `CAPITALS` | Emphasis, stress, increased volume[^11] | `This is CRITICAL.` |
| `?` (question mark) | Natural upward inflection[^6] | `You did what?` |
| `!` (exclamation) | Enthusiasm, excitement[^6] | `We won!` |
| `.` (period) | Natural sentence closure[^27] | `It is done.` |
| `,` (comma) | Micro-pause in flow[^27] | `Well, I suppose so.` |

**Important:** Commas and periods help the model understand turn boundaries in dialogue — they do much of the pacing work in multi-speaker scenes.[^27]

***

## 7. The Seven Pillars of Audio Tag Mastery

ElevenLabs organizes audio tag usage into seven core categories:[^1]

### Pillar 1: Situational Awareness
Tags that let v3 react to the moment — raising stakes, softening warnings, or pausing for suspense. Example: `[WHISPER]`, `[SHOUTING]`, `[SIGH]`.[^1]

### Pillar 2: Character Performance
Tags that turn narration into role-play. Shift persona mid-line and direct full character performances without changing models. Example: `[pirate voice]`, `[French accent]`.[^1]

### Pillar 3: Emotional Context
Cues that steer feelings moment by moment, layering tension, relief, or humour. Example: `[sigh]`, `[excited]`, `[tired]`.[^1]

### Pillar 4: Narrative Intelligence
Storytelling is timing. Tags that control rhythm and emphasis so AI voices guide the listener through each beat. Example: `[pause]`, `[awe]`, `[dramatic tone]`.[^1]

### Pillar 5: Multi-Character Dialogue
Write overlapping lines and quick banter with interruption tags and tone switches. One model, many voices — natural conversation in a single take. Example: `[interrupting]`, `[overlapping]`.[^1]

### Pillar 6: Delivery Control
Fine-tune pacing and emphasis. Tags that give precision over tempo. Example: `[pause]`, `[rushed]`, `[drawn out]`.[^1]

### Pillar 7: Accent Emulation
Switch regions on the fly for culturally rich speech without model swaps. Example: `[American accent]`, `[British accent]`, `[Southern US accent]`.[^1]

***

## 8. Advanced Prompting Techniques

### 8.1 Emotional Layering

Combine multiple emotional states for complex, nuanced performances:[^3]

```
[conflicted][quietly][regretfully]
I want to help you, but [pause] I just can't.
```

This creates someone who feels torn, speaks softly, and feels guilty simultaneously.[^3]

More examples:
```
[excited][nervous][breathless]
We did it! We actually— [gasp] I can't believe we pulled it off!

[sad][resigned][tired]
I tried everything. [long pause] There's nothing left to do.

[playfully][sarcastically][smug]
Oh sure, YOUR plan worked perfectly. [pause] Oh wait, no it didn't.
```

### 8.2 Progressive Emotional Arcs

Show character development over time within a single script:[^3]

```
[Day 1]
[enthusiastic][optimistic] This project is going to be amazing!

[Week 2]
[slightly less enthusiastic] It's... coming along.

[Month 3]
[exhausted][frustrated] I don't know if I can finish this.

[Project Complete]
[triumphant][relieved][proud] I DID IT! It's finally done!
```

### 8.3 Micro-Expressions

Use subtle modifiers for nuanced, realistic delivery:[^3]

```
[slight hesitation] I suppose that could work.
(vs.) [confident] That will definitely work!

[hint of sadness] I'm fine, really.
(vs.) [cheerfully] I'm fine, really!
```

### 8.4 Environmental Context

Add atmospheric realism through situational framing:[^3]

```
[in a library][whispers] Have you found the book yet?
[pause]
[from across room][still whispering but slightly louder]
Over here, I think I found it!
```

### 8.5 Character Consistency Across Long Content

Maintain character voice throughout long-form content by establishing a baseline:[^3]

```
PROFESSOR CHARACTER: [British accent][intellectual][formal tone]

Chapter 1: [professorial] Today, we examine quantum mechanics.
Chapter 5: [professorial][still British] As we discussed earlier...
Chapter 10: [professorial][excited] This next discovery is remarkable!
```

### 8.6 Narrative Book-Style Cuing

Writing in book-style narration embeds emotional and delivery cues naturally:[^20]

```
"Our options are limited," he said slowly.
"I understand," she replied calmly.
"You don't understand anything!" he said, voice rising with frustration.
```

This contextual approach is one of the most reliable methods for emotion across ALL ElevenLabs models, not just v3.[^6]

### 8.7 Using the Enhance Button

In the ElevenLabs UI, clicking the **"Enhance"** button automatically generates relevant audio tags for your input text using an internal LLM. This is useful when you have plain text and want a quick starting point for a tagged script. The LLM behind Enhance applies tags based on the emotional context of the text.[^25][^11]

***

## 9. Tag Density and Optimization

### 9.1 Optimal Tag Density

| Tag Density | Tags per 100 words | Result |
|---|---|---|
| Too sparse | 0–2 | Flat, monotone delivery[^3] |
| **Optimal** | **3–8** | **Natural, dynamic performance**[^3] |
| Too dense | 15+ | Overly theatrical, unnatural[^3] |

### 9.2 Effective Tag Combinations

| Emotion Base | + Delivery | + Volume | Result |
|---|---|---|---|
| `[excited]` | `[quickly]` | `[loudly]` | High-energy announcement[^3] |
| `[sad]` | `[slowly]` | `[quietly]` | Deep grief[^3] |
| `[angry]` | `[picks up pace]` | `[building volume]` | Escalating rage[^3] |
| `[nervous]` | `[hesitantly]` | `[whispers]` | Terrified secret[^3] |

### 9.3 Tag Combinations to AVOID

| Bad Pairing | Why | Better Alternative |
|---|---|---|
| `[whispering][shouting]` | Directly contradictory[^3] | Choose one |
| `[happy][sorrowful]` | Conflicting emotions[^3] | `[bittersweet]` or separate sections |
| `[rushed][slowly]` | Opposing speeds[^3] | Pick appropriate pace |
| 5+ stacked emotion tags | Confuses the model[^3] | Max 2-3 combined |

### 9.4 Over-Tagging vs. Under-Tagging

```
❌ Over-tagged (avoid):
[excited][happy][enthusiastic][energetic][loud][fast] Hi there!

✅ Optimally tagged:
[excited][loudly] Hi there!

❌ Under-tagged (flat delivery):
Welcome to the show. We have a great lineup tonight.

✅ Properly tagged:
[warmly][enthusiastic] Welcome to the show! [pause]
We have a GREAT lineup tonight.
```

***

## 10. Multi-Speaker Dialogue Mode

### 10.1 What Is Dialogue Mode

Dialogue mode, available when using multiple speakers via the website or the Text to Dialogue API, generates dynamic multi-speaker conversations with natural pacing. It handles interruptions, shifts in tone, and emotional cues based on conversational context.[^9]

### 10.2 Using the UI

1. Log in to ElevenLabs
2. Go to Text to Speech
3. Select the **Eleven v3** model from the dropdown[^28]
4. Write your first speaker's text in the text box
5. Click **"Add Speaker"** to create a new voice lane[^29]
6. Select a contrasting voice for the second speaker (different gender, age, accent)[^27]
7. Write the second speaker's dialogue
8. Repeat for additional speakers
9. Click **"Generate Speech"**[^28]

**Tips for multi-speaker UI:**
- Keep each speaker's lines within their own section rather than stacking in one block[^27]
- Read the script aloud once before generating — if it sounds clear to you, it will render more naturally[^27]
- Use short sentences with natural punctuation[^27]
- Make each voice as distinct as possible (different accent, age, personality baseline)[^27]

### 10.3 The Text to Dialogue API

The dedicated `/v1/text-to-dialogue` endpoint accepts a structured JSON array:[^5][^24]

**Python SDK example:**
```python
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
from elevenlabs.play import play
import os

load_dotenv()

elevenlabs = ElevenLabs(
    api_key=os.getenv("ELEVENLABS_API_KEY"),
)

audio = elevenlabs.text_to_dialogue.convert(
    inputs=[
        {
            "text": "[cheerfully] Hello, how are you?",
            "voice_id": "9BWtsMINqrJLrRacOk9x",
        },
        {
            "text": "[stuttering] I'm... I'm doing well, thank you",
            "voice_id": "IKne3meq5aSn9XLyUdCD",
        }
    ]
)

play(audio)
```


**Full API JSON structure:**
```json
{
  "inputs": [
    {
      "speaker_id": "scarlett",
      "text": "(cheerfully) Perfect! And if that pop-up is bothering you, there's a setting under Notifications."
    },
    {
      "speaker_id": "lex",
      "text": "You are a hero. An actual digital wizard."
    },
    {
      "speaker_id": "scarlett",
      "text": "(laughs) Glad we could stop that in time."
    }
  ]
}
```


The endpoint automatically manages speaker transitions, emotional changes, and interruptions.[^5]

***

## 11. Full TTS API Reference

### 11.1 Create Speech Endpoint

```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
```

**Required Headers:**
```
xi-api-key: YOUR_API_KEY
Content-Type: application/json
Accept: audio/mpeg
```

**Full Request Body:**
```json
{
  "text": "[excited] Hello, welcome to the show!",
  "model_id": "eleven_v3",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0.0,
    "use_speaker_boost": true,
    "speed": 1.0
  },
  "output_format": "mp3_44100_128",
  "language_code": "en",
  "pronunciation_dictionary_locators": []
}
```


### 11.2 Streaming Endpoint

```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream
```

Same body as above; returns audio as a stream.[^3]

**WebSocket endpoint for real-time streaming:**
```
wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input
```


### 11.3 Output Audio Formats

All formats are specified via `output_format` parameter in the format `codec_samplerate_bitrate`:[^26]

**MP3 formats:**

| Format | Tier Required |
|---|---|
| `mp3_22050_32` | Free and above[^30] |
| `mp3_44100_32` | Free and above[^30] |
| `mp3_44100_64` | Free and above[^30] |
| `mp3_44100_96` | Free and above[^30] |
| `mp3_44100_128` | Free and above (default)[^30] |
| `mp3_44100_192` | Creator tier and above[^30] |

**PCM formats (uncompressed, for pro audio):**

| Format | Tier Required |
|---|---|
| `pcm_8000` | Free and above[^30] |
| `pcm_16000` | Free and above[^30] |
| `pcm_22050` | Free and above[^30] |
| `pcm_24000` | Free and above[^30] |
| `pcm_44100` | Pro tier and above[^31][^30] |
| `pcm_48000` | Available[^30] |

**Other formats:**

| Format | Use Case |
|---|---|
| `ulaw_8000` | Telephony, Twilio integrations[^26][^31] |
| `alaw_8000` | Telephony applications[^32][^33] |
| `opus_48000_32` through `opus_48000_192` | Web streaming, low latency[^33] |

**Recommendation:** Use `mp3_44100_128` (default) for standard content. Use `pcm_44100` for professional post-production. Use `ulaw_8000` for Twilio phone integrations.[^31][^26]

### 11.4 Python API Implementation (Complete v3 Example)

```python
import requests

ELEVENLABS_API_KEY = "your_api_key"
VOICE_ID = "your_voice_id"

def generate_v3_speech(text: str, voice_id: str = VOICE_ID) -> bytes:
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    
    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY
    }
    
    data = {
        "text": text,
        "model_id": "eleven_v3",
        "voice_settings": {
            "stability": 0.5,        # Natural mode
            "similarity_boost": 0.75,
            "style": 0.0,
            "use_speaker_boost": True,
            "speed": 1.0
        },
        "output_format": "mp3_44100_128"
    }
    
    response = requests.post(url, json=data, headers=headers)
    response.raise_for_status()
    return response.content

# Single-voice example
script = """
[narrator voice][mysterious] Chapter One: The Discovery.
[pause]
[excited][British accent] Professor! You need to see this!
[pause]
[calmly][American accent][elderly] What is it, my dear?
[breathless][British accent] The artifact... it's glowing!
"""

audio = generate_v3_speech(script)
with open("output.mp3", "wb") as f:
    f.write(audio)
```


***

## 12. Pronunciation Control

### 12.1 v3 Pronunciation Methods

**Note:** SSML phoneme tags (`<phoneme alphabet="ipa">`) are only supported on `eleven_flash_v2` and `eleven_monolingual_v1` models. For v3 and Multilingual v2, use alternative methods:[^34][^35]

**Method 1: Alias Tags (recommended for v3)**
```xml
exeme>
  <grapheme>UN</grapheme>
  <alias>United Nations</alias>
</lexeme>
```


**Method 2: Phonetic Spelling Tricks**

For v3 and Multilingual v2, use creative spelling modifications:[^36]
- Dashes: `en-gine-X` → `engine X` pronounced correctly
- Capital letters for stress: `trapezIi` → emphasizes the "ii"
- Apostrophes and quotes around syllables
- Alternative spellings: `dah-ta` or `day-tah` for "data"[^37]

**Method 3: Pronunciation Dictionaries (.pls files)**

Upload XML-based .pls files for consistent word-by-word control:[^35]
```xml
exicon>
  exeme>
    <grapheme>tomato</grapheme>
    <phoneme alphabet="ipa">təˈmɑːtoʊ</phoneme>
  </lexeme>
  exeme>
    <grapheme>UN</grapheme>
    <alias>United Nations</alias>
  </lexeme>
</lexicon>
```


You can upload up to 3 pronunciation dictionaries per request. AI tools like ChatGPT or Claude can generate IPA or CMU notations for specific words.[^38][^35]

**Method 4: CMU Arpabet (for Flash v2/English v1)**
For older models, use CMU Arpabet phoneme codes from the CMU Pronouncing Dictionary (134,000+ words):[^37]
```xml
<phoneme alphabet="cmu-arpabet" ph="M AE1 D IH0 S AH0 N">Madison</phoneme>
```


### 12.2 Text Normalization for Numbers and Special Text

Models can mispronounce complex text like phone numbers, currencies, and addresses. Apply normalization:[^11]

| Raw Input | Normalized for TTS |
|---|---|
| `$1,000,000` | `one million dollars`[^11] |
| `123-456-7890` | `one two three, four five six, seven eight nine zero`[^11] |
| `2024-01-01` | `January first, twenty twenty-four`[^11] |
| `9:23 AM` | `nine twenty-three AM`[^11] |
| `Ctrl + Z` | `control z`[^11] |
| `100km` | `one hundred kilometers`[^11] |
| `100%` | `one hundred percent`[^11] |
| `Dr.` | `Doctor`[^11] |
| `example.com/path` | `example dot com slash path`[^11] |

Use an LLM pre-processing step to normalize text before passing it to v3. This is the recommended approach for agent pipelines.[^11]

***

## 13. Use Case Blueprints for AI Agents

### Blueprint 1: Audiobook Production

```
[narrator voice][setting tone] Chapter One: The Beginning.
[pause]
[character 1 voice + accent][emotion] Character dialogue.
[narrator voice][transition tag] Narrative bridge.
[character 2 voice][emotion] Second character response.
[narrator voice][descriptive] Scene description.
```

**Production settings:** Stability 0.5–0.6, Similarity 0.75, Style 0.0[^3]

### Blueprint 2: Voice Agent / AI Assistant

```
GREETING: [friendly][warm] Hi there! How can I help you today?
PROCESSING: [attentive][professional] Sure, let me pull that up for you.
[brief pause]
RESULT: [helpful] Here's what I found...
ERROR: [apologetic] I'm sorry, I wasn't able to retrieve that information.
```

**Agent settings:** Stability 0.6, Similarity 0.75, Style 0.0, Flash v2.5 for real-time[^19]

### Blueprint 3: Podcast Multi-Host

```
HOST 1: [enthusiastic][American accent] Welcome back to the show!
HOST 2: [laid-back][slightly sarcastic] Where we talk about things you didn't know you needed.
HOST 1: [playfully offended] Hey, the topics are great!
HOST 2: [deadpan] Are they though?
HOST 1: [laughs][continues] Anyway, today's topic...
```

**Production settings:** Stability 0.4–0.5, Similarity 0.8, Style 0.3[^3]

### Blueprint 4: E-Learning / Corporate Training

```
[instructor voice][enthusiastic] Welcome to Module 3!
[conversational][friendly] Now, I know what you're thinking...
[mimicking student voice][quieter] "This seems complicated."
[reassuring] Not at all! Let me show you.
[clear][instructional][slightly slower] First, here's the key concept...
[encouraging][warm] Don't worry if you don't get it right away.
```

**Educational settings:** Stability 0.5–0.6, Style 0.2–0.3[^3]

### Blueprint 5: Game NPC Dialogue

```
[IF PLAYER HAS HIGH REP]
NPC: [impressed][slightly awed] Oh! You're the hero everyone's talking about!
[excited] Please, let me show you something special.

[IF PLAYER IS HOSTILE]
NPC: [terrified][stammers] P-please! I have a family!
[desperate] Take what you want, just don't hurt anyone!
```

**Character settings:** Stability 0.3–0.4, Style 0.5–0.7[^3]

### Blueprint 6: Marketing / Ad Copy

```
[energetic][fast-paced] Tired of boring, robotic voiceovers?
[frustrated voice] "Your call is important to us..."
[sarcastic][deadpan] Sure it is.
[transition to excited] But what if your audio could actually PERFORM?
[enthusiastic][building] Introducing the future of voice—
[whispers conspiratorially] your audience will thank you.
[confident][memorable] Audio that performs.
```

**Ad settings:** Stability 0.4, Style 0.3–0.5, Speaker Boost ON[^3]

***

## 14. Scripting Best Practices for Human-Like Speech

### 14.1 The DO List

- **Start simple:** Begin with 1-2 tags, then layer complexity gradually[^21][^3]
- **Be specific:** `[slightly nervous]` > `[nervous]`[^3]
- **Use natural language in tags:** Write as you'd direct a human voice actor[^3]
- **Test multiple iterations:** Generate 2-3 versions and select the best[^21]
- **Layer emotions:** Combine 2-3 tags maximum for nuanced delivery[^3]
- **Consider context:** Match tags to situation, character, and narrative moment[^3]
- **Use pauses strategically:** Silence is powerful — `[pause]` and ellipses are underused[^3]
- **Maintain character consistency:** Assign baseline tags to each character and keep them throughout[^3]
- **Use 250+ character prompts:** Longer text gives the model more context for stable generation[^39]
- **Match voice to tag intent:** A whispery voice won't shout convincingly[^11]
- **Add natural breathing:** `[breathes]` before physically demanding lines[^40]
- **Break long content into segments:** Limit each TTS request to ~150 characters for maximum expressiveness[^41]

### 14.2 The DON'T List

- **Don't over-tag:** `[excited][happy][enthusiastic][energetic][loud][fast]` → confuses the model[^3]
- **Don't use contradictory tags:** `[whispering][shouting]` → they cancel out[^3]
- **Don't rely solely on PVCs:** Not yet optimized for v3[^1]
- **Don't write tags in non-English:** `[français accent]` won't work → use `[French accent]`[^3]
- **Don't use SSML break tags in v3:** They're not supported[^11]
- **Don't overuse `<break>` tags in v2:** Too many cause instability, speed fluctuations, and audio artifacts[^20][^11]
- **Don't expect perfection on first generation:** v3 requires iteration[^21]
- **Don't ignore regeneration:** Three generations of the same text give you selection options[^20]

### 14.3 Pre-Generation Checklist

Before submitting text to v3, verify:
- [ ] Correct voice selected (IVC or designed voice, not PVC)[^1]
- [ ] Stability set to Creative (0.3) or Natural (0.5) for expressiveness[^11]
- [ ] All numbers, currencies, and special characters normalized[^11]
- [ ] Tag density is 3-8 per 100 words[^3]
- [ ] No contradictory tag combinations[^3]
- [ ] Character voices are distinct (different accent, age, emotion baseline)[^3]
- [ ] Pauses placed for intended dramatic impact[^3]
- [ ] Punctuation aids rhythm (commas for micro-pauses, `…` for weight)[^11]
- [ ] Content length under 5,000 characters for a single request[^6]

***

## 15. AI Agent System Prompt for v3 TTS Optimization

This prompt can be fed directly to any AI agent to make it produce optimized v3 scripts:

```
You are a voice prompt enhancer trained in ElevenLabs v3 best practices.

When given a block of text to convert for ElevenLabs v3 TTS:

RULES:
1. Keep output at least 250 characters for stable generation
2. Add emotional and vocal tags [laughs], [whispers], [sighs], [excited], [pause] where appropriate
3. Use expressive punctuation: ellipses (...), em dashes (—), commas for micro-pauses
4. Use CAPITALS for emphasis on key words
5. Write in natural, conversational short sentences
6. If the text is dialogue, format with Speaker 1, Speaker 2, etc., and apply relevant emotional tags
7. Add emotional highs and lows to prevent monotone output
8. Tag density: aim for 3-8 tags per 100 words
9. Never use SSML <break> tags (not supported in v3)
10. Always write audio tags in lowercase English in square brackets
11. Combine max 2-3 tags per phrase
12. Normalize all numbers, dates, currencies, URLs to spoken word form
13. Match tag choices to the emotional context of the text
14. Add [pause] and [breathes] for natural rhythm
15. Output the tagged script ONLY, ready to paste into ElevenLabs
```


***

## 16. Voice Design — Creating Synthetic Voices from Scratch

When the Voice Library doesn't have the exact voice you need, Voice Design generates fully synthetic voices from a text prompt:[^42]

### 16.1 Voice Design Prompt Structure

**Formula:**
```
[Gender] + [Age range] + [Accent/Region] + [Tone/Quality] + [Delivery style] + [Use case context]
```

**Examples:**
- `"A warm, middle-aged female voice with a British accent, ideal for cozy audiobook narration"`
- `"A young Indian female with a soft, high voice. Conversational, slow and calm"`[^42]
- `"An angry old pirate, shouting"`[^42]
- `"A massive evil ogre, troll"`[^42]

### 16.2 Voice Design Parameters

| Parameter | Range | Effect |
|---|---|---|
| Guidance Scale | 3–8[^43] | Lower = AI creative freedom; Higher = strict prompt adherence |
| Quality | 0.5–1.0[^43] | Use 0.8+ for production |
| Prompt Strength | 0–1[^43] | When using reference audio: lower = prioritize reference, higher = follow description |
| Loudness | -1 to 1[^43] | Output volume control |
| Seed | Any integer[^43] | Save + reuse for reproducible voices |

### 16.3 Available Voice Design Models

- `eleven_multilingual_ttv_v2`: Broad multilingual support[^43]
- `eleven_ttv_v3`: Advanced features + reference audio guidance[^43]

***

## 17. Troubleshooting Guide

### 17.1 Tags Being Read Aloud Instead of Interpreted

**Cause:** Incompatible voice type or wrong model selected[^21]

**Solutions:**
1. Confirm `eleven_v3` model is selected — tags only work in v3[^21]
2. Switch from PVC to IVC or designed voice[^21]
3. Regenerate multiple times for consistency[^21]

### 17.2 Flat, Monotone Output Despite Tags

**Solutions:**
1. Lower stability setting — move from Robust to Natural or Creative[^12]
2. Check tag density — add more tags (3-8 per 100 words)[^3]
3. Add contextual text around tagged phrases[^21]
4. Ensure text length is sufficient (250+ characters)[^39]
5. Add natural pauses with `[pause]` and `…` ellipses[^11]

### 17.3 Inconsistent Emotional Output

**Solutions:**
1. Add more descriptive context around tagged phrases[^21]
2. Adjust stability — try slightly higher for more predictable results[^21]
3. Use longer scripts — more context = more stable performance[^3]
4. Accept that v3 is nondeterministic — generate 3x and select best[^20][^21]

### 17.4 Characters Sound the Same

**Solutions:**
1. Use distinct accent + age + personality combinations for each character[^3]
2. Assign emotion defaults: `[cheerful]` baseline for one, `[resigned]` for another[^3]
3. Use different actual voice IDs through the Dialogue API[^5]

### 17.5 Audio Artifacts and Glitches

**Solutions:**
1. Enable Speaker Boost[^6]
2. Reduce Style Exaggeration[^6]
3. Fix punctuation issues — add natural sentence-ending punctuation[^6]
4. Reduce number of `<break>` tags (for v2 content)[^20]
5. Lower stability if artifacts come from forced over-stability[^17]
6. Regenerate — artifacts are often non-deterministic[^20]

### 17.6 Mispronunciation

**Solutions:**
1. Rewrite phonetically: `Siobhan` → `Shiv-on`[^36]
2. Use dashes: `electro-encephalo-gram`[^3]
3. Add inline phonetic guide: `Dr. Nguyen [NU-YIN]`[^3]
4. Create an alias pronunciation dictionary (.pls file)[^35]
5. Use CMU Arpabet phoneme tags on Flash v2 for precise control[^37]

### 17.7 Sound Effects Not Registering

**Solutions:**
1. Combine sound effect tag with delivery tag: `[excited][clapping]`[^21]
2. Test different voices — effects vary by voice type[^21]
3. Regenerate multiple times[^21]

***

## 18. Agent Platform and Conversational AI Configuration

When using v3 (or Flash v2.5) within ElevenLabs Agents, the system prompt structure is critical:[^44]

### 18.1 System Prompt Structure for Human-Like Agent Voices

```markdown
# Role
[Define what the agent is and its primary function]

# Personality
[Define tone, speaking style, character traits]
Example: Speak conversationally. Use short sentences. Sound warm, not corporate.

# Goal
[Step-by-step instructions for handling each interaction]

# Tools
[List tools and when/how to use them]

# Guardrails
[Non-negotiable rules the agent must always follow]

# Error Handling
[What to say when tools fail or information is unavailable]
```


### 18.2 Text Normalization Strategy for Agents

Two options via the `text_normalisation_type` configuration:[^44]

- **`system_prompt` (default):** Adds LLM instructions to normalize numbers/symbols. No latency cost, but LLMs occasionally fail to normalize.[^44]
- **`elevenlabs`:** TTS normalizer runs after LLM generation. More reliable, minor latency addition, keeps transcripts natural.[^44]

### 18.3 Model Selection for Agents

| Agent Use Case | Recommended Model | Reasoning |
|---|---|---|
| General-purpose customer support[^44] | GPT-4o or GLM 4.5 Air | Best latency/accuracy/cost balance |
| High-frequency simple routing[^44] | Gemini 2.5 Flash Lite | Ultra-low latency |
| Complex multi-step reasoning[^44] | Claude Sonnet 4/4.5 | Highest accuracy, excellent tool-calling |

For the TTS voice output layer, pair complex LLMs with `eleven_flash_v2_5` for real-time delivery, or `eleven_v3` for expressive character-driven agents.[^8][^6]

***

## 19. Complete Languages Supported by Eleven v3

Eleven v3 supports 70+ languages:[^2]

Afrikaans, Arabic, Armenian, Assamese, Azerbaijani, Belarusian, Bengali, Bosnian, Bulgarian, Catalan, Cebuano, Chichewa, Croatian, Czech, Danish, Dutch, English, Estonian, Filipino, Finnish, French, Galician, Georgian, German, Greek, Gujarati, Hausa, Hebrew, Hindi, Hungarian, Icelandic, Indonesian, Irish, Italian, Japanese, Javanese, Kannada, Kazakh, Kirghiz, Korean, Latvian, Lingala, Lithuanian, Luxembourgish, Macedonian, Malay, Malayalam, Mandarin Chinese, Marathi, Nepali, Norwegian, Pashto, Persian, Polish, Portuguese, Punjabi, Romanian, Russian, Serbian, Sindhi, Slovak, Slovenian, Somali, Spanish, Swahili, Swedish, Tamil, Telugu, Thai, Turkish, Ukrainian, Urdu, Vietnamese, Welsh.[^2]

**Language code parameter:** Use ISO 639-1 codes in the API (`language_code: "en"`, `"fr"`, `"de"`, etc.). If the model doesn't support the provided language code, an error will be returned.[^38]

***

## 20. Quality Assurance Workflow for Production

For any content going to production, follow this QA pipeline:

1. **Draft script** with appropriate narrative context
2. **Select voice** matching intended character and emotional range
3. **Tag script** using 3-8 tags per 100 words, no contradictions
4. **Normalize text:** all numbers, dates, special characters expanded
5. **Set settings:** Stability 0.4–0.5 (Creative/Natural), Similarity 0.75
6. **Generate 3 versions** using the regenerate feature
7. **A/B test:** Listen on headphones to catch artifacts, sibilance, unnatural pauses
8. **Minor text tweaks:** Fix mispronunciations via phonetic spelling before regenerating
9. **Final generation:** Apply best settings combination discovered during testing
10. **Post-processing:** Speed adjust in Audacity if needed (speed up is easier than slow down)[^20]

**Review checklist before delivery:**
- [ ] All character voices are distinct and consistent
- [ ] Emotions match narrative context
- [ ] Pauses are placed effectively for impact
- [ ] Pacing is appropriate for the content type
- [ ] No contradictory tags remain
- [ ] Output sounds natural when played back on consumer headphones
- [ ] Technical terms and names are pronounced correctly[^3]

***

## 21. Subscription Tiers and Feature Availability

| Feature | Free | Starter | Creator | Pro | Scale/Business |
|---|---|---|---|---|---|
| MP3 128kbps | ✓[^30] | ✓[^30] | ✓[^30] | ✓[^30] | ✓[^30] |
| MP3 192kbps | ✗ | ✗ | ✓[^30] | ✓[^30] | ✓[^30] |
| PCM 44.1kHz | ✗ | ✗ | ✗ | ✓[^31][^30] | ✓[^30] |
| WAV output | ✗ | ✗ | ✓ | ✓[^30] | ✓[^30] |
| API access | ✓ | ✓ | ✓ | ✓ | ✓ |
| Eleven v3 | ✓ | ✓ | ✓ | ✓ | ✓ |
| Text normalization (v2.5) | ✗ | ✗ | ✗ | ✗ | ✓ (Enterprise)[^8] |

**Note:** Higher quality audio formats (PCM 44.1kHz, MP3 192kbps) require higher subscription tiers.[^31]

***

## 22. Key Takeaways for AI Agents

An AI agent given this document and tasked with producing human-like speech via ElevenLabs v3 should:

1. **Always use `eleven_v3` model** for emotionally expressive output
2. **Set stability to 0.4–0.5** (Natural mode) for maximum tag responsiveness
3. **Use IVC or designed voices**, never PVC for v3
4. **Apply 3-8 audio tags per 100 words** — no more, no less
5. **Normalize all numbers, currencies, and special text** before submission
6. **Add `[pause]`, `[breathes]`, and ellipses** for natural rhythm
7. **Layer 2-3 compatible emotion tags** for nuanced delivery
8. **Never use SSML break tags** in v3 — use punctuation and audio tags instead
9. **Generate multiple versions** (3x) and select the best
10. **Match voice character to intended tags** — a formal voice won't respond to playful tags

This complete reference covers every documented setting, every known audio tag category, all API parameters, all output formats, pronunciation control methods, multi-speaker dialogue configuration, agent prompting best practices, and quality assurance workflows needed to produce consistently human-like, emotionally authentic speech through ElevenLabs Eleven v3.

---

## References

1. [ElevenLabs Audio Tags: More control over AI Voices](https://elevenlabs.io/blog/v3-audiotags) - Use ElevenLabs v3 audio tags for precise control over AI voice emotion, pacing, and sound effects. I...

2. [Eleven v3 — Most Expressive AI Voice Model - ElevenLabs](https://elevenlabs.io/v3) - Generate lifelike speech in 70+ languages with emotion, direction, and multi-speaker control. Experi...

3. [The Complete Guide to ElevenLabs v3: Master Interactive ...](https://dev.to/yigit-konur/the-complete-guide-to-elevenlabs-v3-master-interactive-voice-experiences-with-audio-tags-3bn2) - ElevenLabs v3 represents a paradigm shift in text-to-speech technology. Unlike traditional TTS...

4. [Eleven v3 Audio Tags - Master AI Accent Emulation - ElevenLabs](https://elevenlabs.io/blog/eleven-v3-audio-tags-emulating-accents-with-precision) - Seamlessly switch accents mid-sentence with Eleven v3 Audio Tags. Emulate American, British, French,...

5. [Eleven v3: Most Expressive AI TTS Model Launched - ElevenLabs](https://elevenlabs.io/blog/eleven-v3) - Eleven v3 (alpha) introduces advanced audio tags, dialogue mode, and 70+ languages for nuanced, emot...

6. [ElevenLabs Cheat Sheet (2026) - Models, Voices, API & Agents](https://www.webfuse.com/elevenlabs-cheat-sheet) - v3 Audio Tags. Special tags for Eleven v3 model only. Voice Tags. [laughs] [whispers] [sighs] [exhal...

7. [How do audio tags work with Eleven v3? - ElevenLabs](https://help.elevenlabs.io/hc/en-us/articles/35869142561297-How-do-audio-tags-work-with-Eleven-v3) - Eleven v3 supports audio tags, giving unprecedented control over your generated audio: Emotions: [cu...

8. [Models | ElevenLabs Documentation](https://elevenlabs.io/docs/overview/models) - Emotional Dialogue: Generate natural, lifelike dialogue with high emotional range and contextual und...

9. [What is Dialogue mode?](https://help.elevenlabs.io/hc/en-us/articles/35869170509201-What-is-Dialogue-mode) - Eleven v3 (Alpha) offers Dialogue mode, allowing you to generate dynamic multi-speaker conversations...

10. [Voice Cloning overview | ElevenLabs Documentation](https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning) - IVC allows you to create voice clones from shorter samples near instantaneously. Creating an instant...

11. [Best practices | ElevenLabs Documentation](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices) - Learn how to control delivery, pronunciation, emotion, and optimize text for speech. This guide prov...

12. [v3 Alpha Support Documentation (copied from Eleven Labs before taken down)](https://www.reddit.com/r/ElevenLabs/comments/1l3fsgk/v3_alpha_support_documentation_copied_from_eleven/) - v3 Alpha Support Documentation (copied from Eleven Labs before taken down)

13. [Tips on Getting Great Voice Clones from ElevenLabs - SuperGeekery](https://supergeekery.com/blog/tips-on-getting-great-voice-clones-from-elevenlabs) - To create a professional voice clone you need at least 30 minutes of clean audio. I discovered that ...

14. [AI Voice Cloning: Clone Your Voice in Minutes - ElevenLabs](https://elevenlabs.io/voice-cloning) - For instant voice cloning, 1-5 minutes of clear audio produces good results. For professional-grade ...

15. [Get default voice settings | ElevenLabs Documentation](https://elevenlabs.io/docs/api-reference/voices/get-default-settings)

16. [Get voice settings | ElevenLabs Documentation](https://elevenlabs.io/docs/api-reference/voices/get-settings)

17. [skills/text-to-speech/references/voice-settings.md at main - GitHub](https://github.com/elevenlabs/skills/blob/main/text-to-speech/references/voice-settings.md) - Collections of skills for building with ElevenLabs - elevenlabs/skills

18. [Prompting Eleven v3 (Alpha) - ElevenLabs Documentation - Scribd](https://www.scribd.com/document/955133143/Prompting-Eleven-v3-alpha-ElevenLabs-Documentation) - Prompting Eleven v3 (alpha) _ ElevenLabs DocumentationPrompting Eleven v3 (alpha) _ ElevenLabs Docum...

19. [ElevenLabs Settings Explained - Speed, Stability, Similarity, Style, Language Override, Boost](https://www.youtube.com/watch?v=6Y6-ceCU41U) - Unlock the best ElevenLabs voice settings in just a few minutes!
In this video, I break down all the...

20. [What are your tips and tricks for using ElevenLabs efficiently ... - Reddit](https://www.reddit.com/r/ElevenLabs/comments/1fzt965/what_are_your_tips_and_tricks_for_using/) - If you have already changed the text but you wish to regenerate last thing you can use ctrl/cmd + Z ...

21. [ElevenLabs v3 Audio Tags User Guide: Mastering Emotional Voice ...](https://jonathanmast.com/elevenlabs-v3-audio-tags-user-guide-mastering-emotional-voice-control/) - Instant Voice Clones (IVC) and designed voices from the ElevenLabs library work best with v3 feature...

22. [Eleven v3 Audio Tags: Expressing emotional context in speech](https://elevenlabs.io/blog/eleven-v3-audio-tags-expressing-emotional-context-in-speech) - Infuse AI speech with emotional nuance using Eleven v3 Audio Tags. Control tension, warmth, hesitati...

23. [Eleven v3 Audio Tags: Precision delivery control for AI speech](https://elevenlabs.io/blog/eleven-v3-audio-tags-precision-delivery-control-for-ai-speech) - Fine-grained control over timing, rhythm, and emphasis with Eleven v3 Audio Tags. Transform flat del...

24. [Text to Dialogue quickstart | ElevenLabs Documentation](https://elevenlabs.io/docs/developers/guides/cookbooks/text-to-dialogue) - Learn how to generate immersive dialogue from text.

25. [List of V3 audio tags.](https://www.reddit.com/r/ElevenLabs/comments/1l8k45e/list_of_v3_audio_tags/) - List of V3 audio tags.

26. [Create sound effect | ElevenLabs Documentation](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert) - Turn text into sound effects for your videos, voice-overs or video games using the most advanced sou...

27. [How To Create Multi-Voice Dialogue On ElevenLabs (Full Guide 2025)](https://www.youtube.com/watch?v=IiEeW9Gz7ng) - How To Create Multi-Voice Dialogue On ElevenLabs (Full Guide 2025)


In this video we discuss eleven...

28. [How to Create Multi Voice Dialogue On ElevenLabs - Step by Step](https://www.youtube.com/watch?v=_9Ztx9PX8JU) - How to create multi voice dialogue on ElevenLabs step by step for podcasts, videos, and AI voice pro...

29. [How to Create Multi-Voice Dialogue on ElevenLabs (2025 Tutorial)](https://www.youtube.com/watch?v=VejogC5eSoc) - 🔗 Try ElevenLabs Free Here: https://try.elevenlabs.io/a10z6n1mbyor

Learn how to create multi-voice ...

30. [What audio formats do you support?](https://help.elevenlabs.io/hc/en-us/articles/15754340124305-What-audio-formats-do-you-support) - We support a range of audio formats across our website and via API. Speech Synthesis MP3 44.1kHz/16b...

31. [Voice changer stream | ElevenLabs Documentation](https://elevenlabs.io/docs/api-reference/speech-to-speech/stream) - Stream audio from one voice to another. Maintain full control over emotion, timing and delivery.

32. [Update supported formats (#1045) · elevenlabs/elevenlabs-docs@0b9cb5a](https://github.com/elevenlabs/elevenlabs-docs/commit/0b9cb5ae7a924f5c7c48fdabfb43305b4594054a) - Documentation for elevenlabs.io/docs. Contribute to elevenlabs/elevenlabs-docs development by creati...

33. [Why is ulaw_8000 format not supported for ElevenLabsTTSService · Issue #1632 · pipecat-ai/pipecat](https://github.com/pipecat-ai/pipecat/issues/1632) - Problem Statement Currently the tts.py in ElevenLabs supports only below formats ElevenLabsOutputFor...

34. [Pronunciation dictionaries | ElevenLabs Documentation](https://elevenlabs.io/docs/eleven-agents/customization/voice/pronunciation-dictionary) - Learn how to control how your AI agent pronounces specific words and phrases.

35. [Using pronunciation dictionaries | ElevenLabs Documentation](https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/pronunciation-dictionaries) - This guide shows you how to manage pronunciation dictionaries programmatically.

36. [How can I force a certain pronunciation of a word or name?](https://help.elevenlabs.io/hc/en-us/articles/16712320194577-How-can-I-force-a-certain-pronunciation-of-a-word-or-name) - If you want to force a certain pronunciation, you can use SSML phoneme tags. We support both IPA and...

37. [How To Correct Pronunciation in ElevenLabs (Easy Fix)](https://www.youtube.com/watch?v=ooDD5KGmw8E) - Here’s how to correct pronunciation in ElevenLabs when the AI voice gets words wrong.

In this tutor...

38. [Create speech | ElevenLabs Documentation](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) - Converts text into speech using a voice of your choice and returns audio.

39. [ElevenLabs V3 Tutorial: How to Get Human-Like AI Voiceovers (Step-by-Step)](https://www.youtube.com/watch?v=xapf2tL8lFI) - 👉🏼 ElevenLabs V3 now available: https://tinghsiao.com/recommends/elevenlabs

In this video, I’m shar...

40. [Add Realistic Breathing & Pauses to ElevenLabs Voices (Step-by-Step Guide)](https://www.youtube.com/watch?v=xUh40JqjdVA) - This guide explains how to generate realistic breathing, pauses, and natural timing in ElevenLabs AI...

41. [What are best practice's for TTS generation? : r/ElevenLabs - Reddit](https://www.reddit.com/r/ElevenLabs/comments/1qd34sj/what_are_best_practices_for_tts_generation/) - You can generate as much text as you want, or however much the system allows, and it should still ge...

42. [AI Voice Design - Generate Unique Voices from Text Prompts](https://elevenlabs.io/voice-design) - Generate any AI voice you can imagine using just a text prompt · Prompt to voice in seconds. Easily ...

43. [Elevenlabs Voice Design API - Segmind](https://www.segmind.com/models/elevenlabs-voice-design) - Voice Design is a generative AI model from ElevenLabs that creates fully synthetic voices from scrat...

44. [Prompting guide](https://elevenlabs.io/docs/agents-platform/best-practices/prompting-guide) - System design principles for production-grade conversational AI

