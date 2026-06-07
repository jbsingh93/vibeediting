# Spec — <Video Title>

This is the load-bearing artifact for >2-min videos. Get user approval BEFORE generating any TSX.

## Composition contract

- Width × Height: <e.g., 1920×1080>
- FPS: <30 | 60>
- Duration: <e.g., ~22 minutes (~39,600 frames)>
- Aspect: <e.g., 16:9>
- Theme: <dark mode | light mode | custom>

## Color palette

(use useBrand() tokens in code — your brand.json colors. The values below are the
neutral defaults; override only when the brand intends a variant.)

- Background: <hex (brand primary)>
- Primary text: <hex (brand secondary)>
- Accent: <hex (brand accent)>
- Success: <hex (brand success)>
- Danger: <hex (brand danger)>
- Code: <text on background — e.g., #ABB2BF on #1D1F23>

## Visual philosophy

<one paragraph defining the register, density, and key style choices>

Examples:
- "Clean, technical, code-forward. Minimal cinematic flourishes — this is a tutorial, not a hype reel. Type and code dominate. B-roll is screen recording only."
- "Documentary-feel. Slow zooms on stills. Warm grade. One animation choice per scene maximum."

## Scene plan

### Scene 1 — <name> (<start>-<end>s)
- Frame range: <0>-<2700>
- Voiceover: "<first sentence of VO>"
- Visual: <description>
- Animation technique: <spring entry on title (16f), word-by-word reveal on subtitle>
- B-roll cue: <none | path to footage>

### Scene 2 — <name> (...)
- ...

(continue for every scene; 25-40 scenes typical for 20-30min)

## Animation conventions

- All entries: spring with damping 18, stiffness 120, durationInFrames 12-16
- All exits: linear ease-in, 8 frames
- Scene transitions: 18-frame fade with springTiming(durationRestThreshold: 0.001)
- Code reveals: line-by-line with 6-frame stagger
- Numbers count up via interpolate with cubic ease-out
- Captions: <line-by-line for tutorials | word-by-word Hormozi for ads>

## Key beats (the moments the spec MUST nail)

Concrete timestamps the human cares about. Use as cue marks during VO recording.

- 0:08 — title text fully visible
- 0:45 — first chapter title card appears
- 4:00 — first code block builds
- 7:30 — output appears alongside code
- 18:00 — deployment success animation
- 21:30 — outro CTA card

## Audio plan

Mode: <video-only render → audio finalized in a separate pass | audio inside Remotion>

If Remotion:
- VO source: <public/voiceovers/...>
- Music: <public/music/... at -18dB ducked under VO via VAD>
- SFX: <list of SFX cues with frames>

If separate audio pass:
- Render with --muted
- VO recorded against video timeline using "Key beats" as cue marks

## Component imports needed

List the components this composition will use. Import canonical components from the
barrel (`import { BrandContext, LogoSting, LowerThird, Counter, Checklist } from '../../components';`).
Custom, composition-specific scenes live in this composition's own folder.

- BrandContext
- LogoSting
- LowerThird
- TitleCard (custom — TODO build)
- ChapterCard (custom — TODO build)
- CodeReveal (custom — TODO build)
- Counter
- Checklist
- ...

## Approval

User: <name>
Approved: <yes | no>
Date: <yyyy-mm-dd>
Notes: <any agreed deviations from defaults>
