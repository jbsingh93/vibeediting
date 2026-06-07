<!-- ════════════════════════════════════════════════════════════════════════
     PIPELINE HEADER (how to use this guide in video-editor)
     Everything below the next "# The World's Most Comprehensive Guide…" line is
     copied verbatim as the authoritative ElevenLabs SFX (text-to-sound v2) reference.
     ════════════════════════════════════════════════════════════════════════ -->

# Using this guide with the ElevenLabs SFX capability

**Read this header first, then use Parts 2–6 + the Quick Reference Card below as the
reference.** This governs how this pipeline generates sound effects.
Companion: [elevenlabs-audio.md](elevenlabs-audio.md) (music/SFX/TTS overview, output paths,
mixing, loudnorm, cost). Capability CLI: `tsx capabilities/generate/elevenlabs-sfx.ts`
(model `eleven_text_to_sound_v2`).

### Script-flag → guide mapping (`elevenlabs-sfx`)
| Flag | Guide § | What it sets | Pipeline default |
|---|---|---|---|
| `<text \| @file>` | Part 2.1, Part 3 | the prompt (the whole craft) | use the 7-dimension formula |
| `--seconds` | Part 2.2 | `duration_seconds` (0.5–30; omit = auto) | omit for one-shots; set for loops/beats |
| `--influence` | Part 2.3, 6.9 | `prompt_influence` (0–1) | **0.3 default → raise to 0.6–0.9 for precise SFX** |
| `--loop` | Part 2.4 | seamless loop (ambience beds) | with 15–30s + low influence (0.3–0.4) |
| `--format` | Part 2.6 | output_format | `mp3_44100_128` |

> **The single most important lever is `--influence`** (Part 2.3): the CLI defaults to
> **0.3**, which is *creative/atmospheric*. For the punchy, literal SFX you usually want in
> reels (whoosh, impact, UI tick, sparkle) **pass `--influence 0.6–0.9`**. Keep it low (0.2–0.45)
> only for ambience/textures. Run the same prompt at 0.3/0.5/0.7 to get a variation bank (Part 6.2).

### The prompt formula (Part 3.1 / Quick Reference)
```
[MATERIAL] [SOUND SOURCE] [ACTION], [ENVIRONMENT/SPACE], [INTENSITY/DYNAMICS],
[TEMPORAL ARC], [ACOUSTIC PROPERTIES], [PRODUCTION STYLE], [EXCLUSIONS], [DURATION].
```
"whoosh" is weak; *"short clean whoosh transition, mid-high frequency, sharp attack and quick
fade, dry studio, designed, no musical tone, 0.5s"* is world-class. Use **exclusions**
(`no music`, `no voices`, `no thunder`, Part 3.3) and **power words** (`cinematic`, `foley`,
`designed`, `subsonic`, `transient`, `one-shot`, Quick Reference) as output "unlocks".

### SFX presets (starting points for reels)
| Need | Prompt sketch | `--seconds` | `--influence` | `--loop` |
|---|---|---|---|---|
| Transition whoosh | `short clean whoosh swish, mid-high, snappy, dry, no musical tone` | 0.5–0.7 | 0.6–0.8 | — |
| Impact / boom | `deep cinematic boom impact, subsonic bass, short metallic tail` | 1–2 | 0.8 | — |
| Riser | `smooth rising tension riser building anticipation, clean` | 1.5–3 | 0.75 | — |
| Sparkle / reveal ding | `bright magical sparkle chime, positive reveal, short shimmer` | 1–1.5 | 0.6 | — |
| Ambience bed | `warm room ambience, subtle hum, no voices, loopable` | 15–30 | 0.3 | `--loop` |

### Pipeline rules (in addition to the guide)
1. **SFX is the quality path; the WAV-synth-in-Node trick is the offline/no-credit fallback**
   (the bundled stripped ffmpeg lacks audio-source filters). Use this when you want a
   believable sound, not a sine.
2. **Mix subtly:** ≤0.4 volume, 2–3 simultaneous max, spread across frequency bands; drive
   per-word ticks off caption timestamps. Loudnorm the **final mix** to -14 LUFS (the SFX itself
   isn't the master). See [audio-mixing.md](audio-mixing.md).
3. **Output** to `public/<project>/sfx/` (project-specific) or `public/sfx/` (a reusable,
   git-tracked library of good ones). Keep good generations — don't re-spend credits.
4. **Cost:** ~**40 credits/sec** when `--seconds` is set (Part 9.1). A `--loop` 30s bed is ~1,200
   credits — generate loops deliberately.
5. **Embedded SFX inside a VO line** (e.g. `[gunshot]`, `[door creak]` mid-sentence) is a v3 **TTS**
   feature, not this endpoint — see Part 4.4 and the [v3 TTS guide](elevenlabs-tts-v3-guide.md).

Most-used sections below: **Part 2** (settings), **Part 3** (prompting system), **Part 4**
(audio terminology), **Part 6.9** (influence by category), **Part 10** (troubleshooting), and the
**Quick Reference Card**.

---

# The World's Most Comprehensive Guide to ElevenLabs Sound Effect Generation
### AAA Production-Grade SFX via AI — Everything an Agent Needs to Generate World-Class Audio

***

## Executive Summary

ElevenLabs Sound Effects (SFX) v2 is the most capable AI sound generation model publicly available as of 2026. It converts natural-language text prompts into professional 48 kHz audio at up to 30 seconds per generation, with seamless looping, multiple output formats, and full commercial licensing on paid plans. The model understands both natural language *and* professional audio industry terminology — making prompt engineering both an art and a precise technical discipline. This guide covers every parameter, every setting, every audio tag, every prompting technique, and every professional workflow hack needed to produce consistently AAA-grade sound effects — whether via the UI, API, or an autonomous AI agent.[^1][^2][^3]

***

## Part 1: Understanding the Model Architecture

### 1.1 What SFX V2 Is and How It Works

ElevenLabs SFX V2 launched in September 2025, upgrading from the original model with four key improvements: extended clip duration (up to 30 seconds), seamless looping capability, a 48 kHz audio sample rate (up from a lower standard), and improved prompt adherence. The model uses deep learning to interpret text descriptions that combine natural language with acoustic and professional audio terminology — producing audio that reacts to both everyday descriptions ("rain hitting a tin roof") and technical terms ("cinematic braam," "one-shot impact," "drone texture").[^2][^1]

The model excels at:[^4][^5]
- **Environmental ambience**: rain, wind, forests, cities, interiors
- **Impact and collision sounds**: explosions, hits, crashes, glass, wood
- **Foley sounds**: footsteps, doors, clothing, props
- **Cinematic/designed sounds**: braams, whooshes, risers, stingers
- **Sci-fi/fantasy effects**: energy blasts, magical textures, futuristic machines
- **UI and game audio**: notification chimes, button clicks, transition tones
- **Music-adjacent elements**: drum loops, percussion hits, bass textures, instrument stabs

Unlike music generators (Suno, Udio), SFX V2 is specifically tuned for short-form, high-specificity sound design — prioritizing prompt adherence and production usability over creative musical improvisation.[^5]

### 1.2 Output Quality and Format Specifications

ElevenLabs SFX V2 delivers audio at professional broadcast standards:[^6][^3]

| Format Code | Description | Plan Required |
|---|---|---|
| `mp3_44100_128` | MP3, 44.1 kHz, 128 kbps | Free and above (default) |
| `mp3_44100_192` | MP3, 44.1 kHz, 192 kbps | Creator tier and above |
| `pcm_44100` | WAV/PCM, 44.1 kHz | Pro tier and above |
| `wav_48000` | WAV, 48 kHz (non-looping downloads) | Available on all plans |

Non-looping sound effects can be downloaded as WAV at 48 kHz — the industry standard for film, TV, and game audio — ensuring no resampling is required when importing into professional DAWs or game engines. The 48 kHz sample rate matches the professional studio recording standard and is genuinely hard to distinguish from professionally designed sounds in most categories.[^1][^5]

**Generation produces 4 variations per request** from the UI, which can be auditioned and selected. The API generates a single output per call by default, but can be configured to batch.[^7]

***

## Part 2: All Settings — Deep Dive

Every generation is controlled by **three parameters** plus the prompt itself. Mastering all three, in combination with prompt engineering, is what separates amateur from professional results.

### 2.1 Parameter 1: `text` (The Prompt)

**Type:** string (required)
**Max length:** No enforced character limit, but optimal length is 20–150 words
**Description:** The natural-language description of the sound you want to generate[^8]

This is the primary creative control. Everything else in this guide is in service of crafting the best possible `text` value. See Part 3 for the complete prompting system.

### 2.2 Parameter 2: `duration_seconds`

**Type:** number or null
**Default:** null (auto — model determines from prompt context)
**Range:** 0.5 to 30 seconds
**API parameter name:** `duration_seconds`
**Cost implication:** 40 credits per second when duration is explicitly specified[^1]

This parameter explicitly sets the clip length. When set to `null`, the model infers a natural duration from your prompt — a "glass shattering" cue produces ~1 second; a "forest ambience" cue produces longer clips.[^9]

**Optimal duration by use case:**

| Use Case | Recommended Duration |
|---|---|
| UI sounds (clicks, chimes, alerts) | 0.5 – 2 seconds |
| One-shot impacts (explosions, hits) | 1 – 4 seconds |
| Cinematic transitions (whooshes, risers) | 2 – 6 seconds |
| Short foley (door open, footstep burst) | 1 – 5 seconds |
| Short ambiences / scene stingers | 5 – 15 seconds |
| Full ambient loops | 15 – 30 seconds |
| Background textures for looping | 20 – 30 seconds |

**Pro tips:**
- Add a small buffer of +10–20% over your target edit point. A sound you need at exactly 3 seconds should be generated at 3.5 seconds to allow trim handles in your DAW[^10]
- For looping ambiences, 15–20 seconds provides a good balance between variety and efficiency[^11]
- Setting an explicit duration on a short ambient prompt (e.g., `duration_seconds=0.5` for "door creak") forces the model into impact territory; leaving it auto often produces more natural timing
- For a foley burst like "five footsteps on gravel," specify duration to control tempo/pacing

### 2.3 Parameter 3: `prompt_influence`

**Type:** number (float 0.0 – 1.0)
**Default in UI:** 0.30 (30%)[^9]
**Default in API (skills.sh):** 0.30[^12]
**Default in Unifically docs:** 0.50[^13]

This is the most misunderstood and underrated parameter in the entire system. It controls the balance between **literal prompt adherence** and **creative AI improvisation**.[^5]

| Value Range | Behavior | Best For |
|---|---|---|
| 0.0 – 0.3 | Maximum creative freedom; model improvises heavily | Atmospheric textures, ambient beds, generative variation |
| 0.3 – 0.5 | Balanced; model interprets loosely | Ambiences, organic sounds, explorative design |
| 0.5 – 0.7 | Moderate adherence | General-purpose SFX, foley sounds |
| 0.7 – 0.9 | High adherence; close to literal interpretation | Precise SFX, game audio cues, specific foley |
| 0.9 – 1.0 | Maximum adherence; very literal | Exact UI sounds, branded audio cues, specific impacts |

**Key insight from practitioners:**[^14][^5]
- Set `prompt_influence` to **0.7–0.9** for precise, specific sound effects (glass shattering, door slam, specific weapon sound)
- Set `prompt_influence` to **0.2–0.4** for ambient textures and creative atmospheric sounds
- Run the **same prompt at 0.3, 0.5, and 0.7** to get three genuinely different creative takes from identical text — useful for building variation banks[^11]
- The **UI default of 30%** is intentionally lower than what most precision work requires — consider raising it to 50–70% as your starting point for professional work[^14]
- For footstep sounds and other specific foley, ~70% influence produces the most consistent results[^14]

### 2.4 Parameter 4: `loop`

**Type:** boolean
**Default:** false
**Available in:** `eleven_text_to_sound_v2` model only[^6]

When `loop=true`, the model generates audio specifically designed so that the ending blends seamlessly into the beginning — no audible click or discontinuity when looped. This is engineered at the model level, not applied as a post-processing crossfade.[^1]

**Critical looping workflow tips:**
- Generate at **15–30 seconds** for loops; shorter loops become repetitive faster[^15]
- Use **lower `prompt_influence` (0.2–0.4)** for looped ambiences to create natural, organic variation within the texture[^11]
- Even with `loop=true`, some generations may not be perfectly seamless — **regenerate** if the loop point is noticeable[^15]
- For maximum loop length from a single generation: generate at exactly **30 seconds** with `loop=true`
- Loop mathematics: a 30-second SFX V2 loop can produce 66+ minutes of continuous audio by cycling[^3]
- Best categories for looping: rain, wind, ocean waves, fire, crowd murmur, mechanical hum, engine drone, ambient music beds, industrial atmospheres

### 2.5 Parameter 5: `model_id`

**Type:** string
**Default:** `eleven_text_to_sound_v2`[^8]
**Current models:**
- `eleven_text_to_sound_v2` — SFX V2 (current, default, best quality)
- The original v1 model is deprecated for new development

Always use `eleven_text_to_sound_v2` for all production work.

### 2.6 Parameter 6: `output_format`

**Type:** string (query parameter)
**Default:** `mp3_44100_128`

| Format | Use Case |
|---|---|
| `mp3_44100_128` | Professional projects, default |
| `mp3_44100_192` | High-quality delivery (Creator+) |
| `pcm_44100` | DAW import, post-production, game engine (Pro+) |
| WAV 48 kHz | Downloadable via UI for non-looping SFX |

**Professional recommendation:** For game audio, film, and broadcast work, always request PCM/WAV at 44.1 kHz or higher. MP3 artifacts can become audible after compression in delivery pipelines. Pro tier is required for PCM API access.[^16][^17]

***

## Part 3: The Complete Prompting System

### 3.1 The Anatomy of a World-Class SFX Prompt

Every high-quality ElevenLabs SFX prompt is built from up to **7 dimensions**. You don't need all 7 in every prompt — but knowing each one and choosing which to include is the craft.

```
[SOUND SOURCE] + [MATERIAL/SURFACE] + [ENVIRONMENT/SPACE] + [INTENSITY/DYNAMICS] + 
[TEMPORAL ARC] + [ACOUSTIC PROPERTIES] + [PRODUCTION QUALITY DESCRIPTORS]
```

**Dimension 1: Sound Source** (required)
The primary object, action, or phenomenon producing the sound.
- Examples: "footsteps," "glass breaking," "thunder," "engine," "sword strike," "fire"

**Dimension 2: Material/Surface** (highly recommended)
The physical substance generating or interacting with the sound. This single dimension dramatically increases realism.
- Examples: "on gravel," "on hollow wooden planks," "on wet concrete," "metallic resonance," "ceramic," "carbon fiber impact"

**Dimension 3: Environment/Space** (highly recommended)
The acoustic container. Different spaces fundamentally change how a sound behaves.
- Examples: "in a cathedral," "outdoors in open field," "in a small tiled bathroom," "underground cavern," "dense forest," "metal cargo container," "underwater"

**Dimension 4: Intensity/Dynamics** (recommended)
Volume, scale, and energy level.
- Examples: "heavy," "subtle," "thunderous," "delicate," "distant," "close-mic'd," "building to a crescendo," "barely audible"

**Dimension 5: Temporal Arc** (recommended for designed sounds)
How the sound evolves over time — its shape from start to finish.
- Examples: "sharp attack followed by slow resonant decay," "starts quietly then builds to a crash," "instantaneous impact then long reverberant tail," "gradually fading," "pulsing rhythmically"

**Dimension 6: Acoustic Properties** (advanced)
Technical audio descriptors that shape the sound's character.
- Examples: "reverberant," "dry and close," "muffled through a wall," "with slight echo," "dead room, no reverb," "high-frequency shimmer," "low-frequency rumble," "bright and transient"

**Dimension 7: Production Quality Descriptors** (cinematic output)
These signal the desired output *style* to the model — from naturalistic realism to Hollywood-designed audio.
- Examples: "cinematic," "high-quality professionally recorded," "sound effects foley," "designed," "AAA game audio," "realistic," "8-bit retro," "cartoon," "documentary quality"

### 3.2 Comparison: Weak vs. World-Class Prompts

| Weak Prompt | World-Class Prompt |
|---|---|
| "rain" | "Heavy rain on a corrugated metal roof, individual drops clearly audible, no thunder, consistent and loopable, recorded close-mic'd" |
| "explosion" | "Massive cinematic explosion with deep subsonic bass impact, metallic debris scatter, rising dust and hiss tail, fading reverberant echo in open desert canyon" |
| "footsteps" | "High-quality foley recording of heavy leather boots walking on wet gravel at a moderate pace, slight echo from surrounding stone walls" |
| "door" | "Aged heavy oak door with iron hinges creaking slowly open in a silent stone dungeon, long resonant squeak, dry reverb" |
| "laser" | "Futuristic sci-fi laser pulse: tight phased transient with ascending pitch sweep, digital crackling, 2-second duration, clean studio production" |
| "forest" | "Dense temperate rainforest ambience at dawn: layered bird calls, gentle wind through deciduous canopy, distant stream, no traffic, peaceful and immersive" |

### 3.3 The "Negative Prompting" Technique

ElevenLabs SFX responds to explicit **exclusion instructions** embedded in the prompt text — telling the model what *not* to include:[^2]

- **"no music"** or **"no musical tone"** — prevents melodic bleed into SFX
- **"no thunder"** — generates rain without thunder elements
- **"no voices"** — removes human vocal artifacts from crowd/ambient sounds
- **"no traffic"** — generates forest/nature without urban contamination
- **"no dialogue"** — for crowd scenes without intelligible speech
- **"no echo"** — for dry, close-mic'd foley
- **"not reverberant"** — for studio-dry sounds

**Example:**
- *"Action scene impact: heavy metallic collision with debris scatter, cinematic scale, **no musical tone**, **no voices**, clean designed sound"*[^2]

### 3.4 Frequency and Spectrum Descriptors

Using frequency terminology directly shapes the tonal character of output:[^18][^14]

| Descriptor | Effect | Use Cases |
|---|---|---|
| "low frequency" / "sub-bass" / "subsonic" | Emphasizes deep bass content | Explosions, impacts, rumbles, earthquakes |
| "high frequency" / "high-pitched" | Emphasizes treble content | Glass, metal, digital tones, UI sounds |
| "mid-frequency" | Balanced spectrum | Voices, organic sounds, foley |
| "wide stereo field" | Spacious stereo imaging | Ambience, environmental sounds |
| "mono" | Single-channel | UI cues, compatibility with mono systems |
| "bright" | Emphasizes upper harmonics | Transients, metallic sounds, clarity |
| "warm" | Emphasizes lower midrange | Wood, organic textures, vintage equipment |
| "thin" | Reduced body | Small objects, distant sounds |
| "bassy" | Low-end emphasis | Large impacts, machinery, vehicles |
| "tinny" | Narrow, high-forward | Telephone audio, old speakers, degraded audio |

### 3.5 Temporal and Dynamic Descriptors

These shape the *shape* of the sound over time — its ADSR envelope:[^19]

| Descriptor | Audio Meaning | Best For |
|---|---|---|
| "sharp attack" | Instant onset | Impacts, clicks, snaps |
| "gradual attack" | Slow build | Swells, risers, atmospheric build |
| "short decay" | Quickly disappears after peak | Staccato impacts, UI sounds |
| "long decay" | Sustained resonance after peak | Metal hits, bells, reverberant spaces |
| "long reverberant tail" | Extended room ambience | Cinematic hits, caves, large spaces |
| "no tail" | Instant end | Dry sounds, dead rooms |
| "fading out" | Gradual volume reduction | Ending ambiences, dissolve sounds |
| "building" / "crescendo" | Increasing intensity | Risers, tension build, engines accelerating |
| "pulsing" | Rhythmic amplitude variation | Alarms, engines, heartbeats |
| "evolving" | Changing character over time | Sci-fi textures, ambient drones |
| "continuous" | Sustained without variation | Loops, drones, tones |
| "staccato" | Short, separated pulses | Footsteps, machine gun fire, typing |

### 3.6 Environment and Acoustic Space Descriptors

| Environment | Acoustic Character | ElevenLabs Example |
|---|---|---|
| Cathedral / church | Long reverb (RT60 > 5s), rich low mids | "in a large cathedral, long reverberant tail" |
| Cave / underground | Very long reverb, uneven frequency response | "in a deep cave, echoey reverb" |
| Small bathroom | Short, tight reverb with bright high end | "in a small tiled bathroom" |
| Open outdoor field | No reverb, natural air absorption | "in an open field, no reverb" |
| Dense forest | Diffuse reverb, absorbed highs | "in dense forest, muffled by trees" |
| Urban street | Short reverb from hard surfaces, traffic presence | "on a busy urban street" |
| Metal container | Harsh resonant comb filtering | "inside a metal cargo container" |
| Recording studio | Acoustically dead, dry | "dry studio recording, no reverb" |
| Underwater | Muffled highs, pressure sensation | "underwater, deep muffled resonance" |
| Through wall | High-frequency attenuation | "heard through a thick stone wall" |
| Telephone / radio | Filtered, limited bandwidth | "over a crackling telephone line" |

### 3.7 Material and Surface Descriptors

The material dimension is **the most powerful single addition** to any SFX prompt. The model has a rich understanding of acoustic material properties:[^5]

**Hard materials (sharp transients):**
- Glass, ceramic, steel, iron, aluminum, titanium, concrete, stone, marble, porcelain

**Soft materials (rounded transients, dampened):**
- Rubber, foam, fabric, cotton, leather, carpet, soil, mud, clay, sand

**Resonant materials (sustained harmonics):**
- Hollow wood, tuned metal, crystal glass, bronze bells, stretched membrane (drum head)

**Natural materials:**
- Dry leaves, wet grass, gravel, bark, ice, snow, water surface

**Synthetic/industrial:**
- PVC, carbon fiber, fiberglass, circuit board, wiring

***

## Part 4: Audio Terminology Glossary — All Key Tags and Terms

These are the professional audio industry terms the ElevenLabs SFX model responds to most reliably. Using them in prompts activates specific learned behaviors in the model:[^14][^1]

### 4.1 Cinematic Sound Design Vocabulary

| Term | Definition | Example Prompt |
|---|---|---|
| **Braam** | Large, brassy cinematic hit — signifies epic drama; common in trailers | "Cinematic braam, deep brass resonance, dramatic trailer hit" |
| **Whoosh** | Movement through air; ranges from fast/sharp to slow/ghostly | "Fast whoosh through camera with high-frequency tail" |
| **Impact** | Collision or contact sound; from subtle taps to dramatic crashes | "Heavy cinematic impact with subsonic bass and metallic resonance" |
| **Stinger** | Short, sharp musical hit that punctuates a moment | "Orchestral stinger, brass and percussion, 1.5 seconds" |
| **Riser** | Ascending tension-building sound leading to an impact | "Cinematic riser over 4 seconds, building from low drone to high frequency" |
| **Swell** | Gradual increase in volume and intensity | "Audio swell, building orchestral texture over 8 seconds" |
| **Sting** | Brief, sharp tonal accent | "Horror sting, dissonant, sudden" |
| **Hit** | A single percussive or impact event | "Cinematic hit, orchestral, powerful" |
| **Transition** | A sound that bridges two scenes or moments | "Cinematic transition sweep, 3 seconds" |

### 4.2 Technical Audio Terms

| Term | Definition | Use in Prompts |
|---|---|---|
| **One-shot** | Single, non-repeating sound event | "Explosion, one-shot, cinematic" |
| **Loop** | Repeating audio segment with seamless playback | "Rain ambience loop, 20 seconds, seamless" |
| **Stem** | Isolated audio component (single element of a layered mix) | "Kick drum stem, isolated, 90 BPM" |
| **Ambience** | Background environmental sound establishing atmosphere | "Forest ambience, morning, birds and wind" |
| **Drone** | Continuous, sustained textural sound creating atmosphere | "Dark horror drone, low frequency, evolving" |
| **Texture** | Layered, complex background sound without distinct events | "Industrial metal texture, continuous grinding" |
| **Foley** | Recorded or recreated sound effects synchronized to picture | "High-quality foley, footsteps on gravel" |
| **Room tone** | The ambient sound of an empty space | "Room tone, small office, air conditioning hum" |
| **Atmos** | Atmospheric background sound (atmospheric audio) | "Jungle atmos, dense, humid, daytime" |
| **Bed** | Continuous background audio layer | "Ambient music bed, gentle, non-intrusive" |
| **Stab** | Short, sharp note or chord hit (musical context) | "Brass stab, vintage, funk, F minor" |
| **Glitch** | Electronic malfunction sound — jittering, erratic movement | "Digital glitch, data corruption, sci-fi" |
| **Transient** | The initial sharp attack component of a sound | "Crisp transient attack, metallic impact" |
| **Sustain** | The body of a sound after the initial attack | "Long sustain, resonant metal bell" |
| **Tail** | The reverberant decay after the main sound event | "Long reverberant tail fading into silence" |
| **Hit point** | The precise moment of maximum impact | "Sharp hit point, instantaneous impact" |

### 4.3 Genre and Style Descriptors

| Style Tag | Output Character |
|---|---|
| "cinematic" | Over-the-top, produced, Hollywood sound design aesthetic |
| "designed" | Sound designer-processed; not naturalistic, stylized |
| "realistic" | Naturalistic, field-recording aesthetic |
| "foley" | Synchronous, performance-based recording aesthetic |
| "AAA game audio" | Modern video game production quality and style |
| "8-bit retro" | Chiptune, lo-fi retro game aesthetic |
| "cartoon" | Exaggerated, comedic, animated film style |
| "horror" | Dark, unsettling, psychological |
| "sci-fi" | Futuristic, technological, otherworldly |
| "fantasy" | Magical, organic, ethereal |
| "documentary" | Natural, unprocessed, field-recording style |
| "vintage" | Analog, aged, classic film/audio era |
| "lo-fi" | Degraded quality, nostalgic, textured |
| "high-fidelity" | Maximum quality, wide dynamic range |

### 4.4 Audio Tags for Eleven v3 TTS (for Embedded SFX in Dialogue)

Eleven v3 supports inline audio tags within TTS scripts — these embed sound events directly into voice performance:[^20][^21]

**Sound Effect Tags (trigger actual sounds within speech):**
- `[gunshot]` — produces firearm sound at that point in the audio
- `[explosion]` — cinematic explosion embedded in timeline
- `[clapping]` — applause or clapping inserted at the tag position
- `[door creak]` — door creaking sound embedded in narration
- `[thunder]` — thunder clap within the audio stream
- `[glass breaking]` — breaking glass sound
- `[phone ringing]` — telephone ringing
- `[footsteps]` — footstep foley within the speech track

**Emotional/Delivery Tags (shape voice performance):**
- `[whispers]` — quiet, intimate delivery
- `[shouting]` — loud, forceful delivery
- `[laughs]` — genuine laughter inserted
- `[laughs softly]` — subtle laugh
- `[sighs]` — audible sigh
- `[clears throat]` — throat clearing
- `[gasps]` — sharp intake of breath
- `[groans]` — physical discomfort vocalization
- `[excited]` — high-energy delivery
- `[sad]` — melancholy emotional tone
- `[angry]` — forceful, aggressive delivery
- `[tired]` — low-energy, fatigued delivery
- `[nervous]` — anxious, hesitant delivery
- `[awe]` — wonder and amazement
- `[dramatic tone]` — theatrical emphasis
- `[rushed]` — rapid, urgent delivery
- `[drawn out]` — slow, elongated delivery
- `[pause]` — brief pause in delivery
- `[panting]` — breathless panting
- `[whispering]` — whispering register

**Accent and Character Tags:**
- `[American accent]`
- `[British accent]`
- `[French accent]`
- `[Southern US accent]`
- `[pirate voice]`

**Break timing tag (precise timing control):**
```xml
<break t="1.5s" />
```
Inserts a precisely timed pause (up to 3 seconds)[^22][^23]

**Best practices for v3 audio tags:**[^20]
- Prompts under 250 characters produce inconsistent results — use longer scripts
- Match tags to the voice's natural range; adding `[angry]` to a calm, quiet voice produces inconsistent results
- Use combinations: `[whispers] [scared]` for layered emotional direction
- Too many tags simultaneously causes erratic behavior — be strategic

***

## Part 5: Prompt Templates by Use Case

### 5.1 Film and Cinematic Production

**Trailer Impact Hit:**
```
Massive cinematic trailer hit: deep subsonic impact with metallic resonance, 
soaring orchestral sting, debris scatter texture, long reverberant tail fading 
into silence. Thunderous bass, high-quality designed sound, 3 seconds.
```
*Settings: `duration_seconds=3`, `prompt_influence=0.8`*

**Horror Atmosphere:**
```
Distant unsettling low drone, slowly evolving over 20 seconds, subtle harmonic 
dissonance, no sudden sounds, barely audible but psychologically oppressive, 
dark and ominous, suitable for looping.
```
*Settings: `duration_seconds=20`, `prompt_influence=0.4`, `loop=true`*

**Action Scene Explosion:**
```
Large military-scale explosion in an urban environment: sharp detonation transient, 
massive subsonic bass wave, secondary debris impacts, crumbling concrete, rising 
dust hiss, echoing reverb across open city streets, cinematic AAA production quality.
```
*Settings: `duration_seconds=5`, `prompt_influence=0.85`*

**Tension Builder/Riser:**
```
Cinematic tension riser building over 6 seconds: starts as barely audible low 
frequency hum, progressively layering metallic scraping textures, ascending 
frequency sweep, building to a crescendo with orchestral presence but no resolution.
```
*Settings: `duration_seconds=6`, `prompt_influence=0.75`*

**Sword Fight Foley:**
```
High-quality foley: steel sword drawn from metal scabbard with sharp metallic 
ring, followed by two rapid sword clash impacts with resonant steel ring, recorded 
dry in studio, cinematic film production quality.
```
*Settings: `duration_seconds=4`, `prompt_influence=0.8`*

### 5.2 Game Audio (AAA Production)

**Player Footsteps — Multiple Surfaces:**

*Stone dungeon:*
```
High-quality foley footsteps, heavy armored boots on wet stone floor, echoing 
underground corridor, slow measured pace, 6 footsteps, dungeon atmosphere.
```

*Forest floor:*
```
Character footsteps on compacted forest soil with dry leaf debris, moderate 
pace, light breeze through trees, naturalistic outdoor recording, 6 footsteps.
```

*Metal catwalk:*
```
Heavy industrial metal catwalk footsteps, reverberant metallic clanging with 
each step, maintenance facility, moderate pace, 6 footsteps.
```
*Settings for all footstep variants: `prompt_influence=0.75`, `duration_seconds=auto`*[^14]

**Weapon: Fantasy Sword Draw:**
```
Fantasy RPG sword unsheathed from leather scabbard, bright metallic ring with 
magical shimmer resonance, slight reverb tail, designed game audio, satisfying 
and weighty, 1.5 seconds.
```
*Settings: `duration_seconds=1.5`, `prompt_influence=0.85`*

**UI Notification / Button Click:**
```
Soft positive digital notification chime, single clear tone, warm bell character, 
brief and non-intrusive, 0.8 seconds, professional app audio quality.
```
*Settings: `duration_seconds=0.8`, `prompt_influence=0.9`*

**Level Up / Achievement:**
```
Triumphant game UI achievement sound: upward ascending arpeggio with sparkle 
texture, bright and rewarding, slight reverb, 1.5 seconds, AAA game audio quality.
```
*Settings: `duration_seconds=1.5`, `prompt_influence=0.85`*

**Error / Failure Sound:**
```
Game UI error sound: low descending buzzer with digital distortion, negative 
emotional character, brief and punchy, 0.7 seconds.
```
*Settings: `duration_seconds=0.7`, `prompt_influence=0.9`*

**Ambient Game Environment — Interior:**
```
Medieval tavern ambient atmosphere: warm fireplace crackling, low murmur of 
distant crowd conversation, occasional clink of glasses, creaking wooden 
floorboards, suitable for looping, no intelligible speech.
```
*Settings: `duration_seconds=30`, `prompt_influence=0.4`, `loop=true`*

**Ambient Game Environment — Exterior:**
```
Dense fantasy jungle ambience: tropical bird calls, insect chorus, light wind 
through broad leaves, distant waterfall, humid and alive, no traffic or modern 
sounds, suitable for seamless looping.
```
*Settings: `duration_seconds=30`, `prompt_influence=0.35`, `loop=true`*

**Magic Spell Effects:**
```
Powerful arcane frost spell: crackling ice forming and expanding, sharp 
crystalline shattering, ethereal cold wind with high-frequency shimmer, 
magical energy build and release, 2.5 seconds.
```
*Settings: `duration_seconds=2.5`, `prompt_influence=0.8`*

**Enemy Alert / Detection:**
```
Sci-fi security system alert: rising mechanical alarm with pulsing digital 
siren, urgent and harsh, industrial environment acoustic, 3 pulsing repetitions, 
2 seconds.
```
*Settings: `duration_seconds=2`, `prompt_influence=0.85`*

### 5.3 Podcasts and Audiobooks

**Scene Transition (podcast):**
```
Clean audio transition whoosh: smooth air movement from left to right stereo 
field, subtle and professional, non-intrusive, 1 second.
```

**Intro Stinger:**
```
Corporate podcast intro stinger: upward orchestral swell with digital sparkle, 
clean and professional, 2 seconds, no vocals.
```

**Ambient Background (interviews):**
```
Warm coffee shop ambience: gentle background conversation murmur, light 
background music feel, coffee machine sounds, low enough to sit comfortably 
under narration, loopable.
```
*Settings: `duration_seconds=20`, `loop=true`, `prompt_influence=0.3`*

### 5.4 Nature and Environmental

**Thunderstorm:**
```
Intense thunderstorm: heavy rain on a metal roof with individually audible 
droplet impacts, distant rumbling thunder rolling across the sky, light wind, 
dramatic and atmospheric, loopable background.
```
*Settings: `duration_seconds=30`, `loop=true`, `prompt_influence=0.45`*

**Ocean Waves:**
```
Peaceful ocean waves gently breaking on smooth rocky shore, distant seagulls, 
light sea breeze, relaxing and spacious, wide stereo field, suitable for 
meditation or sleep content, seamlessly loopable.
```
*Settings: `duration_seconds=30`, `loop=true`, `prompt_influence=0.35`*

**City Street:**
```
Busy modern city street ambience: car traffic passing, distant voices, 
pedestrian footsteps on pavement, occasional bus or truck, urban daytime energy, 
no specific identifiable voices, loopable.
```
*Settings: `duration_seconds=25`, `loop=true`, `prompt_influence=0.4`*

### 5.5 Music Production Elements

**808 Kick Drum:**
```
Super bassy 808 kick drum, deep subsonic punch, tight snap transient, 
clean sustain with gradual sine wave decay, 120 BPM compatible, music production stem.
```
*Settings: `duration_seconds=1`, `prompt_influence=0.85`*

**Vinyl Brass Stabs (from official ElevenLabs exercise):**
```
Old-school funky brass stabs from a vinyl sample, stem, 88 BPM in F# minor.
```
*Settings: `prompt_influence=0.75`*[^9]

**Cinematic Percussion Hit:**
```
Massive orchestral taiko drum hit with long reverberant tail, cinematic 
percussion, subsonic bass impact, stadium-scale reverb, single hit, 2.5 seconds.
```

***

## Part 6: Advanced Techniques and Production Hacks

### 6.1 The Layering Workflow

The model generates single stereo audio files. AAA production quality typically requires **layering multiple generations** — a foundational sound design technique:[^24][^25]

**Step 1: Decompose your target sound into layers**
For an AAA explosion:
- Layer 1: "Subsonic bass impact, single hit, no high frequencies, 1 second" (`prompt_influence=0.9`)
- Layer 2: "Explosion debris scatter texture, mid-frequency metallic shards, 2 seconds" (`prompt_influence=0.7`)
- Layer 3: "Long reverberant explosion tail, echo decay in large outdoor space, 5 seconds" (`prompt_influence=0.5`)
- Layer 4: "High-frequency explosive crack, sharp transient, 0.3 seconds" (`prompt_influence=0.9`)

**Step 2: Generate each layer separately**
Use the API to generate all four layers in parallel for speed.

**Step 3: Combine in your DAW**
Align by the impact transient, adjust relative levels, and apply any final EQ/compression.

**Layering frequency principle:** Combine sounds that occupy complementary parts of the frequency spectrum. A low-frequency bass layer + a mid-frequency body layer + a high-frequency transient layer produces a full-bodied, professional result that no single generation can match.[^25]

**For footsteps:** Generate a "floor impact thud" at low frequency + "surface texture detail" separately, then combine. This is how AAA foley is built in professional studios.

### 6.2 The Variation Bank Technique

Generate multiple versions of the same sound at different `prompt_influence` values to build a variation bank for games:[^11]

```python
import concurrent.futures
from elevenlabs.client import ElevenLabs

client = ElevenLabs(api_key="YOUR_API_KEY")

prompt = "Wood door slamming shut in a stone hallway"
influences = [0.3, 0.5, 0.7, 0.9]

def generate_variant(influence):
    audio = client.text_to_sound_effects.convert(
        text=prompt,
        prompt_influence=influence,
        duration_seconds=1.5
    )
    filename = f"door_slam_influence_{int(influence*100)}.wav"
    with open(filename, "wb") as f:
        for chunk in audio:
            f.write(chunk)
    return filename

with concurrent.futures.ThreadPoolExecutor() as executor:
    results = list(executor.map(generate_variant, influences))
```

This produces 4 distinct-sounding variants of the same door slam — useful for game engines that need randomized SFX playback to prevent repetition fatigue.

### 6.3 The Exclusion-First Technique

When the model adds unwanted elements, address them directly:

**Problem:** Generating rain includes thunder you don't want
**Solution:** "Heavy rain on tin roof, **no thunder**, no wind, only rain drops, loopable"

**Problem:** Crowd ambience includes intelligible voices
**Solution:** "Busy market crowd ambience, **no intelligible dialogue**, just crowd murmur texture"

**Problem:** Impact sounds have melodic bleeding
**Solution:** "Metallic impact, **no musical tone**, **no pitched elements**, pure percussion only"

**Problem:** Fantasy magic has sci-fi tech sounds
**Solution:** "Arcane magical spell, organic ethereal character, **no electronic synthesis**, **no digital artifacts**"

### 6.4 Duration Targeting for Scene Cuts

When designing SFX for a specific edit point:
1. Identify your exact target duration (e.g., 2.3 seconds to bridge two cuts)
2. Set `duration_seconds=2.8` (add 20% buffer)
3. Trim in your NLE/DAW for the exact cut point
4. This prevents the abrupt "cut" artifact of exactly-sized generations[^10]

### 6.5 Prompt Stacking for Complexity

For highly complex sounds, describe **sequential events** using temporal transition language:

```
"First: soft metallic hum building for 1 second, 
then: sharp high-pitched metallic impact, 
then: resonant ring slowly decaying over 3 seconds, 
finally: distant echo fading into room ambience"
```

The model understands "first," "then," "followed by," "building to," "resolving into," and "fading into" as temporal markers.[^26][^1]

**Caution:** The official ElevenLabs guidance recommends generating complex multi-event sounds as **separate generations** and combining in a DAW for best results. Use sequential prompts for sounds where the events are tightly coupled and organic.[^26]

### 6.6 The Remix Feature

ElevenLabs SFX includes a **Remix** capability in the Explore library. When you find a community sound in the Explore tab that is close but not quite right:[^27]
1. Open the sound in the Explore tab
2. Use Remix to modify the prompt while preserving the generation seed
3. Adjust wording to fine-tune the output while staying close to the original's character

### 6.7 The Multi-Prompt at Same Influence Technique

To generate true variants for batch SFX libraries: keep `prompt_influence` low (0.3) and run the same prompt multiple times. At low influence, the model incorporates creative variation, producing meaningfully different outputs from identical prompts — without manually rewriting the prompt.[^11]

### 6.8 Using Audio Terminology as "Unlocks"

Certain professional audio terms act as "unlock words" that shift the model's output mode significantly:[^14]

- Adding "**cinematic**" elevates the produced, larger-than-life character
- Adding "**foley**" or "**professionally recorded foley**" increases naturalistic realism
- Adding "**designed**" signals that processing and stylization are expected
- Adding "**stem**" tells the model to produce an isolated, unmixed component
- Adding "**one-shot**" focuses the model on a discrete, complete event
- Adding "**BPM**" (e.g., "120 BPM") engages the model's rhythmic alignment
- Adding a **musical key** (e.g., "in G minor") applies harmonic character

### 6.9 Specific Prompt-Influence Strategies by Category

| SFX Category | Recommended Influence | Reason |
|---|---|---|
| UI sounds, game feedback | 0.85 – 0.95 | Need exact, repeatable results |
| Precise foley (footsteps, doors) | 0.70 – 0.85 | Specific but allow natural variation |
| Impact/explosion one-shots | 0.75 – 0.90 | Need controlled characteristic |
| Music stems, loops | 0.70 – 0.80 | Need rhythmic precision |
| Short ambient stingers | 0.60 – 0.75 | Moderate specificity |
| Nature ambience loops | 0.30 – 0.45 | Organic variation preferred |
| Long atmospheric drones | 0.20 – 0.35 | Maximum creative interpretation |
| Horror/tension textures | 0.25 – 0.45 | Benefit from unpredictability |
| Sci-fi abstract sounds | 0.40 – 0.65 | Balance concept + creativity |

***

## Part 7: The Complete API Reference

### 7.1 REST API Endpoint

```
POST https://api.elevenlabs.io/v1/sound-generation
```

**Headers:**
```
xi-api-key: YOUR_API_KEY
Content-Type: application/json
```

**Request Body:**
```json
{
  "text": "Description of the sound effect",
  "duration_seconds": 5.0,
  "prompt_influence": 0.7,
  "model_id": "eleven_text_to_sound_v2"
}
```

**Query Parameters:**
```
?output_format=mp3_44100_192
```

**Response:**
The response is the audio file binary (MP3 or WAV depending on format requested).[^12]

### 7.2 Python SDK

```python
# Installation
# pip install elevenlabs python-dotenv

import os
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs

load_dotenv()
client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))

# Basic generation
audio = client.text_to_sound_effects.convert(
    text="Cinematic explosion with debris scatter in open canyon",
    duration_seconds=4.0,
    prompt_influence=0.8
)

with open("explosion.mp3", "wb") as f:
    for chunk in audio:
        f.write(chunk)
```


### 7.3 Looping Ambient Generation

```python
# Generate seamlessly looping ambient bed
audio = client.text_to_sound_effects.convert(
    text="Dense forest ambience with birds and gentle wind, suitable for looping",
    duration_seconds=20.0,
    prompt_influence=0.35,
    loop=True
)

with open("forest_loop.mp3", "wb") as f:
    for chunk in audio:
        f.write(chunk)
```


### 7.4 Batch Generation (Variation Bank)

```python
import concurrent.futures

def generate_sfx(params):
    text, influence, duration, filename = params
    audio = client.text_to_sound_effects.convert(
        text=text,
        duration_seconds=duration,
        prompt_influence=influence
    )
    with open(filename, "wb") as f:
        for chunk in audio:
            f.write(chunk)
    return filename

# Generate 4 variations of a door slam
sounds = [
    ("Heavy wooden door slamming shut in stone corridor", 0.3, 1.5, "door_v1.mp3"),
    ("Heavy wooden door slamming shut in stone corridor", 0.5, 1.5, "door_v2.mp3"),
    ("Heavy wooden door slamming shut in stone corridor", 0.7, 1.5, "door_v3.mp3"),
    ("Heavy wooden door slamming shut in stone corridor", 0.9, 1.5, "door_v4.mp3"),
]

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
    results = list(executor.map(generate_sfx, sounds))

print(f"Generated: {results}")
```

### 7.5 Complete Agent System Prompt for SFX Generation

The following is a production-grade system prompt for an AI agent tasked with generating world-class sound effects via the ElevenLabs API:

```
You are a professional AAA sound designer with 20 years of experience in 
film, games, and broadcast. Your task is to take any sound request and:

1. ANALYZE the request to identify:
   - Primary sound source
   - Material/surface context
   - Environmental/acoustic space
   - Intensity and dynamic character
   - Temporal arc (how the sound evolves)
   - Production style (realistic, cinematic, designed, etc.)

2. CONSTRUCT a world-class ElevenLabs SFX prompt using ALL relevant dimensions:
   - Sound source + material + environment + intensity + temporal arc + 
     acoustic properties + production style
   - Include exclusion terms ("no music," "no voices") where needed
   - Use professional audio terminology (braam, foley, one-shot, stem, etc.)
   - Target 40-100 words for complex sounds, 20-40 for simple sounds

3. SELECT optimal parameters:
   - duration_seconds: specific value or null (auto) based on sound type
   - prompt_influence: 0.3-0.45 for ambience, 0.7-0.9 for precise sounds
   - loop: true for ambient beds and textures, false for one-shots

4. CALL the ElevenLabs API with the constructed prompt and parameters

5. If the result is unsatisfactory, REFINE by:
   - Adjusting prompt_influence by ±0.2
   - Adding or removing acoustic environment descriptors
   - Simplifying complex multi-event prompts into separate generations
   - Adding frequency descriptors ("low frequency bass," "high frequency shimmer")

REMEMBER: The model responds best to specific, detailed, professional language.
"Rain" is poor. "Heavy rain on corrugated metal roof, individual drops audible, 
no thunder, consistent and loopable, close-mic'd" is world-class.
```

***

## Part 8: Platform Ecosystem and Workflows

### 8.1 ElevenLabs Studio 3.0 Integration

ElevenLabs Studio 3.0 provides a full audio-visual editor where SFX can be generated, placed on a timeline, and exported alongside voiceovers and music. The workflow:[^28][^29]
1. Upload video or create audio project in Studio
2. Navigate to "Add SFX and music" → "SFX"
3. Describe sound effect via prompt
4. Generate and preview multiple options
5. Click "+" to place on the video timeline
6. Fine-tune timing, volume, and balance in the editor
7. Export as standalone audio mix or full video with baked-in audio

Studio 3.0 includes a **Studio Agent** — describe your scene, and the agent drafts scripts, selects voices, places sound effects, and arranges clips automatically.[^29]

### 8.2 Video-to-Sound (Automated SFX from Footage)

Updated March 27, 2026, the Video-to-Sound tool uses AI vision to analyze video frame-by-frame, identify objects, movement, and scenes, then generate matched sound effects automatically:[^30][^2]

**Workflow:**
1. Upload video to the Video-to-Sound page
2. AI analyzes content (vehicles, people, environments)
3. Four audio options generated automatically
4. Preview with your video
5. Download and import to your editor

**Limitation:** The AI identifies primary scene content and may miss detailed Foley. For precision work, use text-to-SFX for full control.[^30]

### 8.3 SB1 Infinite Soundboard

SB1 is ElevenLabs' real-time AI soundboard — a grid of pads where each button triggers SFX generation from a text prompt:[^31][^32]

- Connect via MIDI for live performance and music production integration[^27]
- Map keyboard shortcuts for live triggering
- Build custom presets ("Livestream FX," "Horror Stingers") and share via link
- Use looping controls for continuous ambient generation
- Assign different prompts to each pad for unlimited sound palette
- OBS integration for streaming triggering is in development[^2]

**API behind SB1:**
```json
POST https://api.elevenlabs.io/v1/sound-generation
{
  "prompt": "rain hitting the roof of a tent",
  "n": 4,
  "format": "wav"
}
```
Returns an array of 4 URLs for audition and selection.[^31]

### 8.4 Workflow Automation Platforms

ElevenLabs SFX can be triggered from no-code automation platforms:[^33]
- **Make.com** — trigger SFX generation from Gmail, Slack, Google Sheets, HubSpot
- **Zapier** — chain SFX generation with content workflows
- **Tiny Command** — "Generate Sound Effect" action supports loop processing for batch operations
- **n8n** — ElevenLabs nodes available for voice and audio agent pipelines

### 8.5 MCP Server Integration

ElevenLabs provides an official MCP (Model Context Protocol) server for AI agent integration:[^8]

```python
# MCP agent call structure
await generate_sound_effect(
    text="Gentle forest ambiance with birds chirping",
    duration_seconds=10.0,
    prompt_influence=0.5,
    loop=True
)
```

***

## Part 9: Pricing, Licensing, and Credits

### 9.1 Credit Consumption

Sound effects are billed **per generation request**, not per second (when duration is set to auto). When `duration_seconds` is specified, cost is **40 credits per second**:[^1]

| Generation Type | Credit Cost |
|---|---|
| Auto-duration SFX | Per generation (exact amount varies) |
| Specified duration | 40 credits × duration in seconds |
| 5-second specified SFX | ~200 credits |
| 30-second specified loop | ~1,200 credits |

### 9.2 Plan Summary

| Plan | Monthly Cost | Credits | Commercial Use | Max Audio Quality |
|---|---|---|---|---|
| Free | $0 | 10k/month | Non-commercial only | 128 kbps MP3 |
| Starter | $6 | 30k/month | Yes | 128 kbps MP3 |
| Creator | $22 | 121k/month | Yes | 192 kbps MP3 |
| Pro | $99 | 600k/month | Yes + broadcast | PCM 44.1 kHz WAV |
| Scale | $299 | 1.8M/month | Yes | PCM + team collab |
| Business | $990 | 6M/month | Full commercial | All formats |

[^16]

**For game audio / film production:** Pro tier minimum is recommended — PCM WAV output is essential for professional delivery pipelines.[^16]

### 9.3 Commercial Licensing

- **Free plan:** Non-commercial only, attribution to elevenlabs.io required[^2]
- **Starter and above:** Full commercial use — YouTube, social, advertising, client work
- **Pro and above:** Film, broadcast, game release
- **Restriction on all plans:** Generated audio cannot be used to develop a competing sound generation product[^2]

***

## Part 10: Troubleshooting and Quality Control

### 10.1 When Results Are Wrong — Diagnostic Framework

| Symptom | Likely Cause | Fix |
|---|---|---|
| Sound is too generic / vague | Prompt lacks specificity | Add material, environment, intensity descriptors |
| Unwanted elements appear (music, voices) | Model interprets ambiguously | Add explicit exclusion: "no music," "no voices" |
| Sound doesn't match requested style | Style tag missing | Add "cinematic," "realistic," "designed," etc. |
| Wrong duration / too short or long | Auto-duration misfit | Specify `duration_seconds` explicitly |
| Too creatively interpreted | Low `prompt_influence` | Increase to 0.7–0.9 |
| Not creative enough / too literal | High `prompt_influence` | Decrease to 0.3–0.5 |
| Loop has audible click/discontinuity | Model variation | Regenerate; or check `loop=true` was set |
| Frequency balance is wrong | Missing spectrum descriptor | Add "low frequency," "bright," "warm," "bassy" |
| Complex multi-event sound loses elements | Prompt too complex | Split into separate generations and layer |
| Result is good but needs variation | Same prompt produces near-identical repeats | Lower `prompt_influence` to increase variation |

### 10.2 Quality Checklist Before Final Export

Before using a generated SFX in production, verify:

- [ ] **Frequency balance**: Does it occupy the right part of the spectrum for its role in the mix?
- [ ] **Transient clarity**: Is the attack appropriate (sharp for impacts, gradual for swells)?
- [ ] **Tail length**: Does it resolve cleanly or has an appropriate reverberant tail?
- [ ] **Loop integrity** (if looped): Is the loop point seamless? No click or discontinuity?
- [ ] **Volume level**: Is it appropriately calibrated for its role (needs headroom for mastering)?
- [ ] **Stereo field**: Is the stereo image appropriate for the placement context?
- [ ] **Artifacts**: Any digital noise, clipping, or AI generation artifacts?
- [ ] **Duration**: Does it fit the edit point with appropriate handles?
- [ ] **Character consistency**: Does it match the sonic world of the project?

### 10.3 Prompt Iteration Strategy

When the first generation isn't right:
1. **First iteration:** Increase specificity (add one more dimension: material, environment, or temporal arc)
2. **Second iteration:** Adjust `prompt_influence` by ±0.2
3. **Third iteration:** Add exclusion terms for unwanted elements
4. **Fourth iteration:** Add production quality descriptors ("cinematic," "professionally recorded")
5. **If still wrong:** Break into two simpler prompts and layer the results

***

## Part 11: Competitive Context and Use Case Decision Matrix

### 11.1 When to Use ElevenLabs SFX vs. Alternatives

| Need | ElevenLabs SFX | Traditional Libraries | Adobe Firefly SFX | Stable Audio 2.5 |
|---|---|---|---|---|
| Custom / unusual / non-existent sound | ✅ Best choice | ❌ May not exist | ✅ Good | ✅ Good |
| High volume, standard, fast browse | ⚠️ Slower to iterate | ✅ Best choice | ✅ Good | ⚠️ Slower |
| Seamless looping | ✅ Native support | ⚠️ Quality varies | ⚠️ Limited | ✅ Good |
| Runtime game audio generation | ✅ API-native | ❌ Pre-baked files | ❌ No API | ❌ No runtime API |
| Commercial license without attribution | ✅ Paid plans | ✅ Annual license | ✅ | ✅ |
| 48 kHz WAV output | ✅ | ✅ | ✅ | ✅ |
| Music stems / loops | ✅ Good | ✅ Excellent | ⚠️ Limited | ✅ Better for music |
| Spatial / 5.1 audio | ❌ Stereo only | ✅ Available | ❌ | ❌ |

[^34][^5][^2]

***

## Quick Reference Card

### The 60-Second World-Class Prompt Formula

```
[MATERIAL] [SOUND SOURCE] [ACTION/EVENT], [ENVIRONMENT/SPACE], 
[INTENSITY/DYNAMICS], [TEMPORAL ARC], [ACOUSTIC PROPERTIES], 
[PRODUCTION STYLE], [EXCLUSIONS], [DURATION TARGET if needed].
```

**Example:**
```
"Aged hollow oak door with rusted iron hinges creaking slowly open, 
large stone medieval dungeon corridor, heavy and resonant, 
slow deliberate motion over 2 seconds, long resonant tail, 
cinematic foley recording quality, no voice, no music."
```

### Parameter Quick Reference

| Parameter | Range | For Precision | For Creativity |
|---|---|---|---|
| `prompt_influence` | 0.0 – 1.0 | 0.75 – 0.90 | 0.25 – 0.45 |
| `duration_seconds` | 0.5 – 30 | Specify exactly | null (auto) |
| `loop` | true/false | false | true for ambience |
| `output_format` | see table | `pcm_44100` (Pro+) | `mp3_44100_128` |

### Top 10 Power Words for World-Class Output

1. **cinematic** — Hollywood-level production value
2. **foley** — naturalistic, synchronous recording aesthetic
3. **designed** — processed, stylized sound design
4. **subsonic** — emphasizes deep bass content
5. **reverberant** — adds acoustic space character
6. **transient** — sharp attack precision
7. **braam** — cinematic trailer hit
8. **one-shot** — complete, discrete sound event
9. **professionally recorded** — studio quality signal
10. **AAA game audio** — modern game production standard

---

## References

1. [Sound effects | ElevenLabs Documentation](https://elevenlabs.io/docs/capabilities/sound-effects) - Learn how to create high-quality sound effects from text with ElevenLabs.

2. [ElevenLabs AI Sound Effects 2026: Complete SFX & API Guide](https://elevenlabsmagazine.com/elevenlabs-ai-sound-effects-guide-2026/) - Complete guide to ElevenLabs AI sound effects in 2026. SFX V2 API, Text-to-SFX prompting guide, Vide...

3. [Introducing SFX v2 — Higher Quality, Seamless Looping, and Expanded Library](https://www.youtube.com/watch?v=82d9QlU0iiU) - Generate any sound effect directly from a prompt in our UI or API, now with higher quality, seamless...

4. [ElevenLabs Sound Effects (SFX) – The Essentials](https://help.scenario.com/articles/3629745009-elevenlabs-sound-effects-sfx-the-essentials) - Key strength: Sound Effects v2 generates contextually appropriate audio for films, games, podcasts, ...

5. [ElevenLabs SFX V2 Review: Is It Worth Using in 2025?](https://sound-effects-pro.site/blog/elevenlabs-sfx-v2-review) - An in-depth review of ElevenLabs SFX V2 sound generation API — audio quality, prompt accuracy, suppo...

6. [Create sound effect | ElevenLabs Documentation](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert) - Turn text into sound effects for your videos, voice-overs or video games using the most advanced sou...

7. [Sound effects (product guide) | ElevenLabs Documentation](https://elevenlabs.io/docs/creative-platform/playground/sound-effects) - How to create high-quality sound effects from text with ElevenLabs.

8. [Sound Effects | Agent Skills Library - Awesome MCP Servers](https://mcpservers.org/agent-skills/elevenlabs/sound-effects) - Generate sound effects from text descriptions using ElevenLabs. Use when creating sound effects, gen...

9. [Sound effects (product guide) | ElevenLabs Documentation](https://elevenlabs.io/docs/eleven-creative/playground/sound-effects) - How to create high-quality sound effects from text with ElevenLabs.

10. [How to Use ElevenLabs Sound Effects - YouTube](https://www.youtube.com/watch?v=TuBUDKCE4Dw) - Get FREE ElevenLabs access here: https://try.elevenlabs.io/FreeAccount Learn how to create professio...

11. [ElevenLabs Sound Effects API | AI Sound Generation - Unifically](https://unifically.com/ru/models/elevenlabs?model=sound-effect) - Generate AI sound effects from text descriptions.

12. [sound-effects by elevenlabs/skills](https://skills.sh/elevenlabs/skills/sound-effects) - Discover and install skills for AI agents.

13. [ElevenLabs Sound Effects API | Unifically](https://unifically.com/models/elevenlabs?model=sound-effect) - Access ElevenLabs Sound Effects API to generate AI sound effects from text descriptions. Variable du...

14. [Super cool example of how powerful our new Sound Effects model is](https://www.linkedin.com/posts/carlesreina_super-cool-example-of-how-powerful-our-new-activity-7205108826063151104-AWfs) - ... sound design style if that's what you're aiming for. → SFX Categories: Knowing basic SFX terms l...

15. [How to Create a Perfectly LOOPING Sound Effects with ElevenLabs AI](https://www.youtube.com/watch?v=YQT3WCk48zQ) - 👉  In this video, I will show you how to create seamlessly looping sound effects using ElevenLabs AI...

16. [ElevenLabs Pricing for Creators & Businesses of All Sizes](https://elevenlabs.io/pricing) - Explore all subscription plans and find which one is right for you. Choose from a range of individua...

17. [Bad API Quality - Help : r/ElevenLabs - Reddit](https://www.reddit.com/r/ElevenLabs/comments/1epgybg/bad_api_quality_help/) - Output format of the generated audio. Must be one of: mp3_22050_32 - output format, mp3 with 22.05kH...

18. [Sound Effects Terms Explained – Part 2](https://blog.prosoundeffects.com/sound-effects-terms-explained-part-2) - Curious about the meanings of sound effects terminology? We break down 10 common definitions in this...

19. [The Sound Designer's Glossary - Silverplatter Audio](https://silverplatteraudio.com/pages/glossary) - Foley can be used in film, television, and video games. Frequency. Frequency refers to the number of...

20. [How to Use Eleven v3 - Expressive AI Voice Prompt Engineering Guide](https://www.youtube.com/watch?v=b-GhMZ_rcJM) - In this video, you'll learn how to use Eleven v3, the most realistic Text to Speech in the world.

T...

21. [ElevenLabs Audio Tags: More control over AI Voices](https://elevenlabs.io/blog/v3-audiotags) - Use ElevenLabs v3 audio tags for precise control over AI voice emotion, pacing, and sound effects. I...

22. [List of V3 audio tags.](https://www.reddit.com/r/ElevenLabs/comments/1l8k45e/list_of_v3_audio_tags/) - List of V3 audio tags.

23. [What are your tips and tricks for using ElevenLabs efficiently ... - Reddit](https://www.reddit.com/r/ElevenLabs/comments/1fzt965/what_are_your_tips_and_tricks_for_using/) - Another way of making it slower is to write in a book-style narration: "Our options are limited", he...

24. [8 Essential Sound Design Tips for Game Developers in 2025](https://sfxengine.com/blog/sound-design-tips-for-game-developers) - Create rich, impactful sounds through advanced layering and stacking. Build dynamic audio systems th...

25. [Layering - the most important tool for a sound designer - YouTube](https://www.youtube.com/watch?v=0biAgn2ct0A) - The art of foley. Modern sound design techniques vs. dated/tried and true techniques. Business aspec...

26. [How do I prompt for sound effects?](https://help.elevenlabs.io/hc/en-us/articles/25735604945041-How-do-I-prompt-for-sound-effects) - The prompt is the piece of text or instruction that tells the AI what kind of output is expected. Th...

27. [New Opportunities for Creating Sound Effects from ElevenLabs](https://craftium.ai/elevenlabs-sound-effects-update-sb1-midi/) - Users can now generate sounds up to 30 seconds and create seamless loops. Text prompts can be used b...

28. [**Learn how to add AI SFX and AI Music to your videos, content and ...](https://www.facebook.com/groups/elevenlabsai/posts/1161688905910881/) - Learn how to add AI SFX and AI Music to your videos, content and AI short films with ElevenLabs Stud...

29. [Studio 3.0 - AI audio and video editor for creators - ElevenLabs](https://elevenlabs.io/studio) - Combine video, audio, and AI-generated music to prototype scenes, add voiceovers, and experiment wit...

30. [ElevenLabs video-to-sound: Easily add SFX to AI videos](https://elevenlabs.io/blog/how-to-add-sound-effects-to-your-video-with-elevenlabs-video-to-sound-generator) - Simply upload your video, and our AI will analyze the content to generate a variety of sound effects...

31. [ElevenLabs — AI Infinite Soundboard: How We Built SB1](https://elevenlabs.io/blog/how-we-created-a-soundboard-using-elevenlabs-sfx-api) - How ElevenLabs created SB1, an AI-powered infinite soundboard. Generate any sound with our SFX API. ...

32. [Custom Soundboard Creator - SB1 Infinite Soundboard with AI SFX](https://elevenlabs.io/sound-effects/soundboard) - Make your own custom soundboard using any sound effect you can think of. Upload sounds, use pre-made...

33. [Generate Sound Effect: ElevenLabs action | Tiny Command](https://www.tinycommand.com/integrations/elevenlabs/actions/generate-sound-effect) - Short answer: Drop the "ElevenLabs → Generate Sound Effect" action anywhere in your workflow, map th...

34. [Best AI Sound Effects Generators for 2026 - Curious Refuge](https://curiousrefuge.com/blog/best-ai-sound-effects-generator-for-2026) - In this article, I'm going to share a few of my favorite tools for creating AI sound effects in 2026...

