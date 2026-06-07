# Pipeline: Animated Explainer (No Footage)

Animation-from-script pipeline. Loaded when brief mentions "explainer", "animated", "no footage", or duration >2min.

## When to use

- Long-form (10-30 min) animated explainers from a script
- Course module videos with no talking head
- Animated walkthroughs with VO

When NOT to use:
- Short ads (<2min) → use `pipeline-paid-ad.md`
- Tutorials with raw footage → use `pipeline-tutorial.md`

## The 4-stage workflow

1. **Script** — write or AI-generate
2. **Spec** — load-bearing artifact; covers timing, scenes, visual philosophy, key beats, color palette
3. **Build** — Claude generates React/Remotion code from the spec
4. **Render** — Remotion outputs MP4 → finalize audio/captions in an external editor (for long-form)

## Two-workspace pattern

For long-form, separate concerns:

- **Script Lab**: prose scripts in `scripts/` folder (e.g., `scripts/agent-tutorial.script.md`)
- **Animation Studio**: Remotion project (`src/`), spec files (`specs/`), generated code (`src/compositions/<name>/`), rendered outputs (`out/`)

## Workflow detail

### Step 1: Script

Standard prose script in Markdown:

```markdown
# How to Build an AI Agent in 20 Minutes

## Intro (90s)
Today I'm going to show you how to build a working AI agent in just 20 minutes.
By the end, you'll have a Slack bot that summarizes your unread channels every morning.

## Chapter 1: Setting Up (3 min)
First, let's set up your environment...

[continues for 20-30 min total]
```

Save to `scripts/<title>.script.md`.

### Step 2: Spec (the contract)

This is the load-bearing artifact. Don't skip. Don't shortcut.

```markdown
# Spec — How to Build an AI Agent

## Composition
- 1920×1080, 30fps, ~22 minutes (~39,600 frames)
- Aspect: 16:9
- Theme: brand dark mode

## Color palette
- Pull from brand/brand.json: background, primary text, accent, success, code colors

## Visual philosophy
Clean, technical, code-forward. Minimal cinematic flourishes — this is a tutorial, not a hype reel. Type and code dominate.

## Scene plan

### Scene 1 — Intro (0-90s)
- Frame range: 0-2700
- Voiceover: "Today I'm going to show you..." [matches script intro paragraph 1]
- Visual: title card with hook text, slow zoom-in 1.0→1.05 over 90s
- Animation technique: spring entry on title (16f), word-by-word reveal on subtitle

### Scene 2 — Chapter 1 setup (90s-4min)
- Frame range: 2700-7200
- Voiceover: "First, let's set up your environment..."
- Visual: split screen — code editor on left, terminal on right
- Animation technique: cursor highlight tracking; zoom-in on each terminal command
- B-roll cue: real screen recording at /assets/setup-screencap.mp4

[continues for every scene, ~25-40 scenes for a 20-30 min video]

## Key beats (the moments the spec MUST nail)
- 0:08 — title text fully visible
- 0:45 — first chapter title card appears
- 4:00 — first code block builds
- 7:30 — output appears alongside code
- 18:00 — deployment success animation
- 21:30 — outro CTA card

## Animation conventions
- All entries: spring with damping 18, durationInFrames 12-16
- All exits: linear ease-in, 8 frames
- Scene transitions: 18-frame fade
- Code reveals: line-by-line with 6-frame stagger
- All numbers count up via interpolate with cubic ease-out
```

Save to `specs/<title>.spec.md`. Get user approval BEFORE generating any TSX.

### Step 3: Build

Hand the spec to Claude:

> "Read specs/<title>.spec.md. Generate the Remotion composition. One file per scene. Reference scripts/<title>.script.md for actual VO text-to-display. Wait for my approval after each scene."

Claude generates:
- `src/Root.tsx` registering the composition
- `src/compositions/<title>/Main.tsx` orchestrating scenes via `<Series>` or `<TransitionSeries>`
- `src/compositions/<title>/Scene1Intro.tsx`, `Scene2Setup.tsx`, etc.

After each scene, render a still and verify before next.

### Step 4: Render

```bash
# Video-only (audio finalized externally for long-form)
tsx capabilities/deliver/render-preset.ts youtube-1080 ExplainerAgent --muted

# Or 4K
tsx capabilities/deliver/render-preset.ts youtube-4k ExplainerAgent --muted
```

Run in background.

### Step 5: Audio (external editor for long-form)

For >5min videos:
1. Open `out/ExplainerAgent.mp4` in your external editor
2. Record VO over the timeline (use spec's "Key beats" timestamps as cue marks)
3. Add background music (suggest: ambient, 80-110 BPM, low energy)
4. Add SFX where spec calls for them
5. Burn captions in (optional) or upload SRT for YouTube
6. Color grade if needed
7. Export final → upload to YouTube

## Why spec-as-contract works

The spec is the contract between the voice-over recording and the animation. Most people think the
code is the hard part — it's actually the spec. If the spec is right, the code is mechanical. If the
spec is wrong, no amount of iteration fixes it.

## Why audio outside Remotion for long-form

Long-form VO needs human direction — pacing, emphasis, breathing room. AI TTS can't reliably match
that quality at 20+ minute scale yet. Render the video timeline from Remotion (deterministic), record
VO in a DAW/external editor (human-driven).

For SHORT explainers (<5 min), audio inside Remotion is fine — VO + music + SFX layered programmatically.

## Component imports for explainers

```tsx
import { BrandContext } from '../../components/BrandContext';
import { TitleCard } from '../../components/TitleCard';
import { ChapterCard } from '../../components/ChapterCard';
import { CodeReveal } from '../../components/CodeReveal';
import { Diagram } from '../../components/Diagram';
import { Counter } from '../../components/Counter';
import { Checklist } from '../../components/Checklist';
import { LogoSting } from '../../components/LogoSting';
```

## Pre-publish checklist

- [ ] Spec approved before any TSX
- [ ] Each scene rendered as still + verified
- [ ] Storyboard PNGs at every chapter start checked
- [ ] No layout overflow at any sample frame
- [ ] Animation conventions consistent across all scenes (per spec)
- [ ] Key beats land on time per spec
- [ ] VO recorded + synced
- [ ] Audio loudnormed to -14 LUFS
- [ ] SRT uploaded to YouTube
- [ ] File named: `explainer_youtube_16x9_{Nm}_{title}.mp4`
