# Brief — Long-Form Tutorial (16:9, 5-30min)

Fill in the fields below. Skill reads this + generates spec.md → composition.

---

COMPOSITION:
  id: <auto, e.g., Tutorial-AgentBuild-2026-05>
  width: 1920
  height: 1080
  fps: 30
  durationInFrames: <5min=9000 | 10min=18000 | 30min=54000>

BRAND:
  All brand values come from brand/brand.json (colors, fonts, logo).
  Colors/fonts surface in code via useBrand() tokens.

LANGUAGE: <language code, e.g. en>

PLATFORM: YouTube (long-form)

---

## TOPIC

Title: <YouTube-optimized title, max 60 chars>

Hook promise: <what viewer will be able to do by end>

Target audience level: <beginner | intermediate | advanced>

Anti-fabrication: cite ≥2 sources for any technical claims (use WebFetch)

---

## CHAPTERS

Plan 3-7 chapters. Front-load best content; mid-video lull happens at 55-65%.

CHAPTER 1: <Intro>
  - Duration: 60-90s
  - Hook + what they'll learn
  - Show end result first (teaser)

CHAPTER 2: <Topic A>
  - Duration: ~3-5min
  - Script section: scripts/<title>-section-A.md
  - B-roll: public/broll/<project>/A1.mp4

CHAPTER 3: <Topic B>
  - ...

CHAPTER N: <Recap + CTA>
  - Loop hook at 80-90% mark before end-screen

---

## SOURCE FOOTAGE

Primary recording: public/raw/<project>/take-01.mp4
Probe before importing: tsx capabilities/ingest/probe-asset.ts <path>

CUT MODE:
  - Auto: Whisper (`whisper-1`) + VAD + last-take rule (filler removal, dead-air trim)
  - Human-review: run `tsx capabilities/perception/cut-doctor.ts` for approval before applying

---

## VISUAL TREATMENT

Style anchor: <"Ali Abdaal style" | "educator" (default)>

LOWER-THIRDS:
  - Speaker: "<speaker name>"
  - Title: "<role / brand>"
  - Style: brand-color accent bar slide-in, brand heading 700, 4-6s on screen
  - Position: bottom-left
  - Insert at: chapter starts + 5s into talking-head

B-ROLL CUES:
  - Each chapter start gets establishing footage
  - Auto-detect: when narrator says "let me show you" → cut to B-roll
  - Source: public/broll/<project>/

CAPTIONS:
  - Burned in: line-by-line (NOT kinetic)
  - Font: brand body 600, 36pt at 1080p, 44pt for emphasis lines
  - Position: bottom-third safe area (avoid bottom 90px for YT progress bar)
  - SRT export: ALWAYS — for YouTube SEO + accessibility

CODE-ON-SCREEN (for tutorials with code):
  - Font: JetBrains Mono (brand mono), 22pt minimum
  - Theme: One Dark Pro
  - Reveal line-by-line, 6f stagger
  - Highlight active line, dim others to 40%

---

## TRANSITIONS

- Within chapter: hard cuts
- Between chapters: 12-frame fade with springTiming (damping 200, durationRestThreshold 0.001)
- Insert chapter title card at each chapter start (1-2s)

---

## AUDIO MODE

For >5min: render video-only from Remotion, finalize audio in a separate pass.
For <5min: audio inside Remotion is acceptable.

Music: ambient/lofi 80-110 BPM, -18dB under VO

---

## END SCREEN

- 20-second window at end
- Subscribe + next-video clickable elements
- Reduce visual noise behind CTAs
- Loop hook tease at 80-90% mark BEFORE end-screen

---

## EXPORT

Preset: youtube-1080 (or youtube-4k for high-traffic)
Render with: `tsx capabilities/deliver/render-preset.ts`
Output: out/tutorial_youtube_16x9_<Nm>_<title>.mp4
Loudnorm: -14 LUFS / -1 dBTP (or done in a separate audio pass)

Preview in the cockpit Player via `vibe ui`. Frame checks: `npx remotion still`.

---

## RETENTION HOOKS (re-engagement triggers)

Plan one every 60-90s during long-form:
- Pattern interrupt (B-roll burst)
- "But here's what happens next..." tease
- Style switch (zoom-out reveal, change of background)
- Quick "look at this" callout

Especially important at 55-65% mark (mid-video lull).
