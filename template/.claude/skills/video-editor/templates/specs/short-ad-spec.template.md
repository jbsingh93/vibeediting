# Spec — <Ad Title>

For short ads (15-60s), spec is optional but recommended for high-stakes flagship ads.
For most ad work, the brief template (templates/briefs/short-paid-ad.md) is sufficient.

## Composition contract

- 1080×1920, 30fps
- Duration: <15s=450f | 30s=900f | 60s=1800f>
- Target platform: <Reels | TikTok | Shorts | LinkedIn>
- Aspect: 9:16

## Color palette

(use useBrand() tokens in code — your brand.json colors; override only if intentional variant)

## Visual philosophy

(one paragraph — usually "educator" with platform-specific tweaks)

## Scene plan

### Scene 1 — Hook (0-3s, frames 0-90)
- VO: "<hook line>"
- Visual: <hook text + brand color background>
- Animation: spring scale-in 1.0→1.05 with cubic out
- Caption: "<emphasis word>" highlighted in brand accent
- SFX: whoosh at 0.0s

### Scene 2 — Problem (3-7s, frames 90-210)
- VO: "<problem statement>"
- Visual: <source footage or graphic>
- Animation: <subtle 1.0→1.04 zoom>
- Pattern interrupt: <text card swap | zoom punch>

### Scene 3 — Solution (7-15s, frames 210-450)
...

### Scene N — CTA (last 4s)
- Visual: CTA button + brand color background
- Caption: "<CTA text>"
- Animation: spring entry, pulse loop
- SFX: sub-drop at entry

## Animation conventions

- Hook entry: spring damping 14, stiffness 200, 14 frames
- Pattern interrupt: zoom punch 1.0→1.08 over 6 frames at cut
- Caption: per-word Hormozi pop (KineticCaptions component)
- CTA: spring + subtle pulse loop

## Audio plan

- VO: full volume (1.0)
- Music: -16dB under VO (or sidechain via VAD)
- SFX: per-cue (whoosh on hook, tick on emphasis words, sub-drop on CTA)
- Final loudnorm: -14 LUFS / -1 dBTP

## Key beats

- 0:00 — sting + face/text in frame
- 0:03 — hook fully visible
- 0:08 — first pattern interrupt
- last-4s — CTA visible

## Variant matrix (if testing)

If this is an A/B test:
- v1: this spec
- v2: change <one variable>
- v3: change <one variable>

## Approval

User: <name>
Approved: <yes | no>
