# Named Style Anchors

Visual style shortcuts. When the user asks for a "style," map to one of these.

## "Hormozi style" (`paid-ad-hormozi`)

Direct-response, sound-off-optimized.

- **Background**: black or dark teal (use your brand.json dark color)
- **Captions**: word-by-word kinetic, Inter 900, 84pt at 1080×1920
- **Color**: white default, brand accent on emphasis, red on urgency words
- **Stroke**: 3px black on captions
- **Cuts**: hard, every 1-2 seconds
- **Motion**: zoom punches (1.0 → 1.08) at cuts, scale-pop on text entry
- **SFX**: dense — whoosh on cuts, tick on each word reveal, sub-drop on key beats
- **Music**: 130-160 BPM, beat-matched cuts
- **No fades**, no smooth transitions, hard cuts only

Use for: aggressive direct-response ads, course launch reels.

## "Ali Abdaal style" (`ali-abdaal`)

Calm, educational, multi-cam talking head.

- **Background**: soft natural setting (bookshelf, neutral wall) — clean B-roll
- **Cuts**: jump cuts on dead-air pauses (every 1-4s)
- **Multi-cam angles**: 2-3 angles cut for rhythm
- **Captions**: line-by-line (NOT kinetic), Inter 600, 36-44pt
- **Color**: warm grade (slight orange highlights), natural skin tones
- **Music**: 80-110 BPM lofi/ambient, low in mix
- **SFX**: minimal — soft chime on key takeaways
- **Lower-thirds**: clean, sans-serif, slide-in from left

Use for: long-form tutorials, course explainers.

## "MKBHD style" (`tutorial-mkbhd`)

Premium product / tech review aesthetic.

- **Aspect**: 16:9 only
- **Background**: deep blacks (#000), shallow-DOF B-roll
- **Motion**: slow parallax (1.0 → 1.05 over 30-60s), gentle dolly-ins
- **Captions**: large sans-serif lower-thirds, never burned-in body captions
- **Color**: high-contrast grade, slightly desaturated, deep shadows
- **Music**: cinematic ambient, sub-bass-heavy
- **SFX**: subtle whoosh on transitions, impact stings on reveals
- **Pacing**: 3-5s ASL (longer holds)

Use for: product walkthroughs, premium brand films.

## "iOS liquid glass" (`ios-liquid`)

Apple's liquid-glass design language, programmatically.

- **Backdrop**: `backdrop-filter: blur(40px) saturate(1.5)` on cards
- **Cards**: rounded 24-32px corners, subtle white border (`rgba(255,255,255,0.15)`)
- **Text**: white on gradient backgrounds
- **Motion**: spring-bounce reveals (damping 12, stiffness 200, overshoot 1.08)
- **Color**: pastel gradients (purple→pink, blue→cyan, peach→amber)
- **Cuts**: smooth (12-18 frame fades) between scenes
- **SFX**: subtle pops on card entry, no harsh sounds

Use for: SaaS / app demos, iOS-targeted ads.

## "Apple keynote" (`apple-keynote`)

Product-reveal aesthetic.

- **Background**: pure black (#000) or pure white (#FFF), never gradient
- **Type**: SF Pro Display (or Inter Display fallback), oversized (120-200pt for hero)
- **Motion**: fade-up reveals (24-36 frames), slow camera dollies on stills (1.0 → 1.08 over 90s)
- **Negative space**: massive — 60%+ of frame empty
- **Captions**: none (or single hero word at a time, centered)
- **Color**: monochrome with one accent color
- **Music**: orchestral swell or ambient bass
- **SFX**: none, or single deep "thunk" on major reveal

Use for: hero/manifesto videos, course launch trailers.

## "TikTok native" (`tiktok-native`)

Algorithm-optimized for TikTok organic.

- **Aspect**: 9:16 only, 60fps
- **Captions**: every word, scale-pop, emoji overlays scattered
- **Cuts**: jump cuts every 0.5-1.5s
- **Background**: bright, busy — match the "TikTok aesthetic" (kitchen, café, car)
- **Color**: high-sat, slightly over-exposed
- **Music**: trending audio (you'll need to swap externally — Remotion can't license trending audio)
- **SFX**: stings, whooshes, "ding" on every beat
- **Hooks**: 0.5s into the video at most

Use for: TikTok organic content, lo-fi UGC-style ads.

## "AGM educator" (`agm-educator`) (custom — RECOMMENDED DEFAULT)

The house blend: **Hormozi cadence + Apple polish + calm**. **Use this when the user doesn't
specify a style.**

- **Cadence**: Hormozi (cuts every 1-2s in ads, every 2-4s in tutorials)
- **Polish**: Apple keynote (clean type, considered negative space, slow zoom on stills)
- **Tone**: Ali Abdaal calm (no aggressive SFX, music at -18dB under VO)
- **Captions**: word-by-word for ads, line-by-line for tutorials
- **Color**: your brand.json colors — primary (near-black), accent, success
- **Type**: Inter 400/700/900, JetBrains Mono for code
- **SFX**: subtle — pop on text entry, whoosh on scene change, no aggressive stings
- **Register**: evidence-led; follow the tone rules in `brand/brand.json`
  (`tone.sellStyle: soft|neutral|direct`) and `brand/brand-voice.md`

## Style selection guidance

When the brief is ambiguous, default to **"AGM educator"** for:
- Course launches
- Tutorial intros
- LinkedIn organic
- B2B-facing content

Switch to **"Hormozi style"** for:
- Direct-response paid ads
- Aggressive-hook performance creative
- Performance-marketing creative tests

Switch to **"Ali Abdaal style"** for:
- Long-form YouTube tutorials
- Course module content
- Workshop recordings

Switch to **"Apple keynote"** for:
- Hero brand films (rare)
- Major launch trailers
- Annual presentations

## How to combine styles

Style anchors can be mixed: "Hormozi cadence + Apple polish" means:
- Caption rhythm and SFX density from Hormozi
- Type, negative space, and color from Apple

Always state the dominant style first.
