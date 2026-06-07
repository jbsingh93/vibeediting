# Brief — Animated Explainer (No Footage)

For 5-30 minute animated content with VO. Uses spec-as-contract pattern.

---

TITLE: <video title>

LANGUAGE: <language code, e.g. en>

DURATION: <minutes>

ASPECT: <16:9 (default) | 9:16 (rare for long-form)>

---

## SCRIPT

Source: scripts/<title>.script.md
  (write the prose script first; can be AI-generated with anti-fabrication gate)

If brief is too narrow to script:
  - Topic: <subject>
  - Outline: <3-7 chapter list>
  - Hook: <what viewer will be able to do by end>
  - Anti-fabrication: WebFetch ≥2 sources

---

## SPEC GENERATION

Skill MUST generate `specs/<title>.spec.md` from script BEFORE any TSX. Spec includes:

1. Composition contract (1920×1080, 30fps, durationInFrames)
2. Color palette (use useBrand() tokens in code; your brand.json colors in prose)
3. Visual philosophy (1 paragraph — register, density, key style choices)
4. Scene plan (one entry per scene, 25-40 scenes for 20-30min)
5. Animation conventions (entries, exits, transitions, code reveals)
6. Key beats (the moments the spec MUST nail with timestamps)

USER MUST APPROVE SPEC before code generation.

---

## VISUAL CHOICES

Style anchor: <"educator" | "Apple keynote" | custom>

Theme: dark | light

Code rendering: <yes — JetBrains Mono | no>

3D content: <yes — uses @remotion/three | no>

Animations: <Lottie from public/icons/ | custom Remotion only>

---

## VOICEOVER

Mode: <generate via ElevenLabs | record manually | sync to existing recording>

If generate:
  - Voice ID from brand/brand.json (voice.elevenlabsVoiceId); ships empty until the user sets one
  - Style: <conversational | authoritative | playful>
  - Generate with: `tsx capabilities/generate/elevenlabs-tts.ts`

If record manually:
  - Recording happens AFTER Remotion renders video-only
  - Synced to spec's "Key beats" timestamps as cue marks

---

## AUDIO MODE

For >5min: render video-only from Remotion, finalize audio externally.
For <5min: audio inside Remotion (programmatic VO + music + SFX).

---

## SCENE PATTERNS (commonly needed)

- TITLE CARD with hook
- CHAPTER CARD on each major break
- CODE REVEAL line-by-line synced to narration
- DIAGRAM with progressive build (boxes + arrows drawing in)
- COUNTER for numerical reveals
- CHECKLIST for "what you'll learn" / recap
- LOWER-THIRD for speaker (if any talking-head intercut)
- LOGO STING intro + outro

Compose canonical components from src/components/ by name (BrandContext, HookText,
Counter, Checklist, LowerThird, LogoSting, …). Do not copy components into the
composition folder — import them from the barrel: `import { ... } from '../../components';`

---

## EXPORT

Preset: youtube-1080 (or youtube-4k)
Render with: `tsx capabilities/deliver/render-preset.ts`
Mode: --muted (audio finalized in a separate pass)
Output: out/explainer_youtube_16x9_<Nm>_<title>.mp4

After audio finalization:
  Final upload: YouTube + SRT (per LANGUAGE + English)

Preview the composition in the cockpit Player via `vibe ui` — never Remotion Studio.
Frame checks: `npx remotion still`.

---

## TWO-WORKSPACE FOLDER DISCIPLINE

scripts/                    — prose scripts (Script Lab)
  └── <title>.script.md
specs/                      — spec.md files (the contracts)
  └── <title>.spec.md
src/compositions/<title>/   — generated TSX (Animation Studio)
  ├── Main.tsx
  ├── Scene1Intro.tsx
  └── ...
out/                        — rendered MP4s
  └── explainer_youtube_16x9_<Nm>_<title>.mp4
