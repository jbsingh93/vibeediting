# Brief — Real Footage Edit + Graphics Overlay

Fill in the fields below. Skill applies subtractive editing pipeline (folder-contract I/O).

---

SOURCE: public/raw/<project>/<file>.mp4

PROBE FIRST:
  tsx capabilities/ingest/probe-asset.ts public/raw/<project>/<file>.mp4

GENERATE PROXY:
  tsx capabilities/ingest/make-proxy.ts public/raw/<project>/<file>.mp4 public/proxy/<file>-720p.mp4

---

OUTPUT TARGET:
  Type: <paid-ad | tutorial | testimonial-edit | b-roll-package>
  Aspect: <9:16 | 16:9 | 1:1>
  Final duration: <e.g., raw is 30min, want 8min cut>

---

## SHOT LIST

Use <OffthreadVideo> with trimBefore/trimAfter to select segments from source.

SCENE 1: 0-12s
  - source: 0:00-0:12 (intro segment)
  - treatment: slight zoom 1.0→1.04
  - overlays: lower-third at 5s (speaker name + role)

SCENE 2: 12-25s
  - source: 1:30-1:43 (key insight)
  - treatment: hard cut from prev
  - overlays: callout-arrow at 18s (drawing attention to <element>)

SCENE 3: 25-40s
  - source: 3:10-3:25 (proof)
  - treatment: zoom 1.0→1.2 over 12 frames at 28s
  - overlays: stat counter 28-35s (counting up to <number>)

SCENE 4: 40-50s
  - animated outro card (no source)
  - CTA + brand sting

---

## CUT DECISIONS (auto pipeline)

Apply via cluster consensus rules:

1. WHISPER TRANSCRIPTION (engine rule: OpenAI `whisper-1` via the API)
   tsx capabilities/ingest/transcribe.ts public/proxy/<file>-720p.mp4 out/02-analyze/<file>

2. SILENCE DETECTION (VAD)
   - Trim silences >300ms to ~150-200ms
   - 0.2s default word-gap

3. FILLER WORD CUTS
   - English: ["um", "uh", "you know", "like", "I mean"]
   - (Add localized filler lists for your audience's language as needed.)

4. LAST-TAKE RULE
   - If phrase repeats (similarity >0.85), keep the second occurrence

5. CUT REVIEW
   - Run `tsx capabilities/perception/cut-doctor.ts` to review proposed cuts
   - PAUSE FOR HUMAN APPROVAL before applying cuts

---

## OVERLAYS

LOWER-THIRD: <name, title, in/out frames>
CALLOUT-ARROW: <target x,y, in/out frames>
STAT COUNTER: <prefix, target, suffix, in/out frames>
B-ROLL INSERT: <source, in/out, place over which segment>

For all overlays, import canonical components from the barrel:
`import { LowerThird, Counter } from '../../components';`

---

## COLOR / GRADE

Optional warm LUT applied via CSS filter on wrapping AbsoluteFill:
  filter: saturate(1.15) contrast(1.05) brightness(0.98)

Or apply via FFmpeg post-render:
  ffmpeg -i out/raw.mp4 -vf "lut3d=brand-grade.cube" out/graded.mp4

---

## AUDIO

KEEP source audio: <yes | no — replace with VO>

DUCK source for VO segments:
  - Use VAD output to drive volume curve
  - -16dB during VO, ~-4dB otherwise

ADD music: public/music/<track>
  - Volume: 0.18 (under VO)
  - Fade in 30f, fade out 30f

---

## EXPORT

Preset: <vertical-ad | square-ad | youtube-1080 — based on aspect>
Render with: `tsx capabilities/deliver/render-preset.ts`

PROXY/ORIGINAL SWAP:
  - Composition reads `staticFile('proxy/<file>-720p.mp4')` during preview/iteration
  - For final render: env RENDER_MODE=final swaps to `staticFile('raw/<file>.mp4')`

Output: out/edit_<source-name>_<aspect>_<duration>.mp4
Loudnorm: -14 LUFS / -1 dBTP

Preview in the cockpit Player via `vibe ui`. Frame checks: `npx remotion still`.
