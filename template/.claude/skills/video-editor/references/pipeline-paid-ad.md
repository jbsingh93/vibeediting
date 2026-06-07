# Pipeline: Short Paid Ad (9:16, 15-60s)

The full procedure for short-form vertical paid ads. Loaded when the brief mentions "ad", "reel", "TikTok", "9:16", or duration ≤60s.

## Composition spec

| Property | Value |
|---|---|
| Aspect | 9:16 (1080×1920) |
| FPS | 30 |
| Duration | 15s = 450f, 30s = 900f, 60s = 1800f |
| Codec | H.264, CRF 18, yuv420p |
| Audio | -14 LUFS, AAC 128k stereo |

## Workflow

### Step 1: Brief intake

Read the brief. Confirm or ask for:
- Hook (first 3s message)
- CTA (one clear action)
- Duration (default 30s)
- Target platform (Reels / TikTok / Shorts / LinkedIn) — affects safe zone
- Language (default from brand.json)
- Brand color override (default from brand.json accent)
- Voiceover: provided or generate via ElevenLabs?
- Source footage if any (else: text-only or stock)
- Style anchor (default: "AGM educator" — see `references/named-style-anchors.md`)

### Step 2: Hormozi structure (default)

Apply the direct-response structure:

```
0-3s:    HOOK         — bold claim / outcome / curiosity gap
3-8s:    PROBLEM      — name the pain
8-15s:   AGITATION    — make pain 3D ("if you keep doing X...")
15-30s:  SOLUTION     — your insight / product
30-45s:  PROOF        — testimonial, stat, demo, before/after
45-55s:  OFFER        — what they get + why now
55-60s:  CTA          — one dumb-simple action
```

For 30s ads, compress: 0-3 hook, 3-10 problem+solution, 10-20 proof, 20-27 offer, 27-30 CTA.

For 15s ads, compress further: 0-2 hook, 2-10 promise, 10-15 CTA.

### Step 3: Plan mode

Propose scene table:

| # | Frames | Time | Visual | Animation | Caption | Audio |
|---|---|---|---|---|---|---|
| 1 | 0-90 | 0-3s | Hook text + brand bg | spring scale-in 1.0→1.05 | "AI is coming for your job" word-by-word | VO + sting at 0.0s |
| 2 | 90-300 | 3-10s | Source footage (B-roll) | OffthreadVideo, slight 1.0→1.04 zoom | "...and it's faster than you" continued kinetic | VO + music ducked -16dB |
| 3 | 300-720 | 10-24s | Stat counter + screenshot | Counter spring up 0→47, screenshot scale-pop | "47 leads yesterday" | VO + tick on counter |
| 4 | 720-870 | 24-29s | Offer card | Card spring up | "Join in 14 days" | VO |
| 5 | 870-900 | 29-30s | CTA button | Button pulse | "Check the link in bio" | VO + sub-drop |

Wait for ExitPlanMode approval.

### Step 4: Scaffold

```bash
vibe new-comp ShortAd9x16-launch 900 1080 1920 30
```

Creates `src/compositions/short-ad-9x16-launch/Main.tsx` + scene files + Root.tsx registration.

### Step 5: Generate scene by scene

After each scene:

```bash
npx remotion still ShortAd9x16-launch out/check-scene-N.png --frame=<midpoint> --scale=0.25
```

Verify visually before moving to next.

### Step 6: Storyboard checkpoint

```bash
for f in 0 90 300 720 870; do
  npx remotion still ShortAd9x16-launch out/storyboard-${f}.png --frame=${f} --scale=0.25
done
```

Open all 5 PNGs. Check:
- [ ] Text in safe zone (not in bottom 480 px or right 250 px on 9:16)
- [ ] No layout overflow
- [ ] Caption legibility against background
- [ ] Brand colors consistent
- [ ] First frame is scroll-stopping

### Step 7: Preview in the cockpit Player

Tell the user: "Open `vibe ui`, scrub the timeline in the Player. Tell me which scenes need refinement."

### Step 8: Refine

Accept frame-accurate change requests. Examples:
- "Make the hook 0.4s tighter — cut from 90 frames to 84"
- "The CTA button color should be the success color not the accent for this variant"
- "Slow the zoom on scene 2 — change easing to Easing.bezier(0.16, 1, 0.3, 1)"

Re-render only changed scenes.

### Step 9: Final render

```bash
tsx capabilities/deliver/render-preset.ts vertical-ad ShortAd9x16-launch
```

Run in background. Report when done.

### Step 10: Loudnorm

```bash
tsx capabilities/deliver/loudnorm.ts out/ShortAd9x16-launch.mp4
```

### Step 11: BIT integration

Ask the user:
- "What pattern from this ad worked? I'll save it to templates/"
- "What did you have to manually fix? I'll add it as a hard rule"

## Pattern interrupts

Reset attention every 1.5-3 seconds. Available techniques:
- Camera-angle cut
- Zoom-in/zoom-out punch
- New text card
- B-roll insert
- Sound-effect sting
- Color/lighting shift
- New on-screen prop

Plan ≥3 pattern interrupts in the first 10 seconds.

## Sound-off design rules

- Captions are PRIMARY (90% of feed views are muted)
- Burned in, NOT relying on platform CC
- Word-by-word kinetic for ads (Hormozi style)
- 5-7 words per line for English (4-6 for denser languages)
- High contrast: white + 3px black stroke + drop shadow
- Place captions in vertical CENTER (not bottom — UI overlap)

## Safe-zone usage

```tsx
import { SafeZone } from '../../components/SafeZone';

<SafeZone platform="tiktok">     {/* or "reels", "shorts", "universal" */}
  <CTACard />
</SafeZone>
```

Default to `"universal"` if target platform unknown.

## Audio defaults

- VO at full volume (1.0)
- Music ducked to 0.15-0.25 (under VO) via sidechain or static volume
- Music fades in at 0.5s, fades out 30 frames before end
- SFX at 0.3-0.5 volume, layered sparingly (2-3 max simultaneous)
- Final loudnorm to -14 LUFS / -1 dBTP

## Component imports for ads

```tsx
import { BrandContext } from '../../components/BrandContext';
import { SafeZone } from '../../components/SafeZone';
import { HookText } from '../../components/HookText';
import { KineticCaptions } from '../../components/KineticCaptions';
import { CTAButton } from '../../components/CTAButton';
import { LogoSting } from '../../components/LogoSting';
```

If components don't exist in `src/components/`, copy from `${CLAUDE_SKILL_DIR}/templates/components/` first.

## Brief checklist

Before final render:
- [ ] Hook in first 3 seconds
- [ ] Face/eye/text contrast in frame 1 (scroll-stopper)
- [ ] Audio sting at 0.0-0.5s
- [ ] Pattern interrupt every 1.5-3s
- [ ] Captions burned in, in safe zone
- [ ] CTA visible, in safe zone
- [ ] Brand colors / logo consistent
- [ ] Tone check passed (follow brand/brand.json `tone.sellStyle` and your local marketing/advertising law)
- [ ] Audio loudnormed to -14 LUFS
- [ ] Duration ≤ platform max
- [ ] File named per convention: `ad_{platform}_{aspect}_{duration}_{variant}.mp4`
