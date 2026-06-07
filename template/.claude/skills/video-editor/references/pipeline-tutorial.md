# Pipeline: Long-Form Tutorial (16:9, 5-30min)

The full procedure for YouTube tutorials. Loaded when brief mentions "tutorial", "YouTube", "16:9", or duration ≥3min.

## Composition spec

| Property | Value |
|---|---|
| Aspect | 16:9 (1920×1080) |
| FPS | 30 (60 if heavy screen-recording motion) |
| Duration | 5min = 9000f, 10min = 18000f, 30min = 54000f |
| Codec | H.264, CRF 18, yuv420p |
| Audio | -14 LUFS, AAC 192k |
| Audio mode | render video-only from Remotion, finalize in an external editor for >5min |

## Workflow

### Step 1: Brief intake

Read brief. Confirm or ask for:
- Topic (tutorial subject)
- Chapter outline (3-7 chapters typical)
- Source footage location (`public/raw/<project>/`)
- VO mode (already recorded, or generate via ElevenLabs)
- Captions: SRT for YouTube upload (always) + burned-in if for non-YouTube use
- Style anchor (default: "Ali Abdaal style" or "AGM educator")

### Step 2: Anti-fabrication gate

For tutorial content, MANDATORY: use WebFetch/WebSearch to verify any technical claims before scripting. Cite sources in `script.md` comments.

### Step 3: Spec-as-contract

For >2min videos, write `spec.md` first:

```markdown
# Spec — <Tutorial title>

## Composition
- 1920×1080, 30fps, ~<duration>s
- Aspect: 16:9
- Theme: brand dark mode

## Color palette
- Pull from brand/brand.json: background, primary text, accent, success, code colors

## Visual philosophy
Clean, technical, code-forward. Minimal cinematic flourishes — this is a tutorial, not a hype reel.

## Scene plan

### Chapter 1 — Intro (0-90s)
- Voiceover: "Today I'm going to show you..."
- Visual: title card with hook text
- Animation: spring entry, slow zoom-in 1.0→1.05 over 90s
- B-roll: none

### Chapter 2 — Setup (90s-4min)
...

## Animation conventions
- All entries: spring damping 18, durationInFrames 12-16
- All exits: linear ease-in, 8 frames
- Scene transitions: 18-frame fade
- Code reveals: line-by-line with 6-frame stagger

## Key beats (the moments the spec MUST nail)
- 0:08 — title text fully visible
- 0:45 — first chapter title card
- 4:00 — first code block builds
- 7:30 — output appears alongside code
- ...
```

Get user approval on spec before generating any TSX.

### Step 4: Plan mode

Propose chapter table:

| # | Chapter | Frames | Time | B-roll | Lower-third |
|---|---|---|---|---|---|
| 1 | Intro | 0-2700 | 0-90s | none | n/a |
| 2 | Setup | 2700-7200 | 90s-4min | public/broll/setup-A.mp4 | "Presenter Name" 30s |
| 3 | Build agent | 7200-15000 | 4-8:20 | public/broll/build-A.mp4, build-B.mp4 | none |
| ... | ... | ... | ... | ... | ... |

Wait for ExitPlanMode approval.

### Step 5: Scaffold

```bash
vibe new-comp Tutorial-AgentBuild 18000 1920 1080 30
```

### Step 6: Source footage processing

If source footage provided:

```bash
# Probe
tsx capabilities/ingest/probe.ts public/raw/agent-tutorial/take-01.mp4

# Generate proxy for analysis (Whisper, Gemini, etc.)
tsx capabilities/deliver/make-proxy.ts public/raw/agent-tutorial/take-01.mp4 public/proxy/agent-tutorial-720p.mp4

# Transcribe (OpenAI whisper-1, word-level)
tsx capabilities/ingest/transcribe.ts public/raw/agent-tutorial/take-01.mp4 public/voiceovers/take-01

# Apply last-take rule + filler-word cuts (see references/captions.md)
# Output: public/voiceovers/take-01.cuts.json (kept segments)
```

### Step 7: Generate chapter by chapter

For each chapter:
1. Generate `Chapter<N>.tsx` from spec
2. Render still at chapter midpoint to verify
3. Tell user "Chapter N done, scrub frames X-Y in the Player"
4. Refine before moving to next chapter

### Step 8: Storyboard checkpoint

Render PNGs at every chapter start + midpoint:

```bash
for f in 0 2700 5000 7200 11000 15000 17500; do
  npx remotion still Tutorial-AgentBuild out/storyboard-${f}.png --frame=${f} --scale=0.25
done
```

Check overflow + safe zone + readability.

### Step 9: Preview in the cockpit Player

Tell user: "Open `vibe ui`, scrub the timeline in the Player. Confirm chapter transitions land naturally."

### Step 10: Refine

Common refinements for tutorials:
- Tighten chapter intro by N frames
- Add B-roll insert at frame X-Y
- Slow lower-third entry
- Adjust code-reveal stagger from 6f to 8f for slower narration

### Step 11: Render video-only

Per cluster consensus rule 16, for >5min videos render video-only:

```bash
tsx capabilities/deliver/render-preset.ts youtube-1080 Tutorial-AgentBuild --muted
# OR for 4K:
tsx capabilities/deliver/render-preset.ts youtube-4k Tutorial-AgentBuild --muted
```

Run in background.

### Step 12: Audio in an external editor (if long-form)

Tell the user: "Render done at out/Tutorial-AgentBuild.mp4. Drop into your editor for VO + music + captions burn-in. SRT available at public/voiceovers/take-01.srt for upload to YouTube."

For SHORT tutorials (<5min) where audio inside Remotion is acceptable, render WITH audio:

```bash
tsx capabilities/deliver/render-preset.ts youtube-1080 Tutorial-AgentBuild
tsx capabilities/deliver/loudnorm.ts out/Tutorial-AgentBuild.mp4
```

### Step 13: BIT integration

Ask: "What worked? What needed manual fix? I'll update the Skill."

## Talking-head editing patterns

For talking-head footage:

- **Jump cuts** on dead air and filler words (use the Whisper transcript + per-language filler maps from `references/captions.md`)
- **Last-take rule**: if phrase repeats, keep second occurrence
- **Zoom-and-emphasize** on key phrases (1.0 → 1.04 over 12-18 frames)
- **B-roll insert** when narrator says "let me show you" / "here you can see"
- **Lower-third** at 5s mark (4-6s on screen)

## Code-on-screen rules

- Font: JetBrains Mono, 22pt minimum at 1080p
- Theme: One Dark Pro (high contrast)
- Reveal line-by-line synced to narration (6f stagger)
- Highlight active line with brand-accent underline; dim others to 40% opacity
- Avoid walls of code — split into chunks of ≤8 lines

## Caption modes for tutorials

- **Burned-in**: line-by-line (NOT word-by-word — too chaotic for tutorials)
- **SRT upload**: always generate for YouTube SEO + accessibility
- Font: Inter 600, 36-44pt
- Position: bottom-third safe area (avoid bottom 90px for YouTube progress bar)

## Retention curve management

Plan re-engagement triggers:
- **0-30s**: front-load best content (hook landing)
- **3-6min sweet spot**: most exciting + simple content
- **55-65% mark**: insert a re-engagement (B-roll burst, "but here's what happened next…")
- **80-90% mark**: loop hook / next-video tease before end-screen

## Lower-third pattern

```tsx
import { LowerThird } from '../../components/LowerThird';

<Sequence from={150} durationInFrames={180}>   {/* 5s in, 6s on screen */}
  <LowerThird name="Presenter Name" title="Founder" />
</Sequence>
```

## Chapter card pattern

```tsx
import { ChapterCard } from '../../components/ChapterCard';

<TransitionSeries.Sequence durationInFrames={2700}>
  <Chapter1 />
</TransitionSeries.Sequence>
<TransitionSeries.Transition
  presentation={slide({ direction: 'from-right' })}
  timing={springTiming({ config: { damping: 30 }, durationInFrames: 24 })}
/>
<TransitionSeries.Sequence durationInFrames={4500}>
  <ChapterCard index={2} title="Setup your environment" />
  <Chapter2 />
</TransitionSeries.Sequence>
```

## Pre-publish checklist

- [ ] First 30 seconds hooks (decides retention)
- [ ] Chapters tagged with YouTube timestamp markers
- [ ] Lower-thirds entered at 5s, exited cleanly
- [ ] B-roll cut to script — no dead screen
- [ ] Code legible at 22pt+ on mobile preview
- [ ] Captions: SRT uploaded; optional burn-in done
- [ ] Audio loudnormed to -14 LUFS (or done in your editor)
- [ ] Loop hook at 80-90% mark
- [ ] End screen with subscribe + next-video card
- [ ] File named per convention: `tutorial_youtube_16x9_{Nm}_{title}.mp4`
