# Deterministic Remotion-native VFX — decision tree & cheat-sheet (P4V.4 / GAP-46)

The DEFAULT VFX path. **Try this BEFORE any paid generation.** Free, frame-accurate, reproducible,
version-controlled, instant iteration, zero cost / latency / moderation risk.

## The GAP-46 decision tree (every effect runs through this)

```
1. Can I code it in Remotion / @remotion/* / CSS+Tailwind / GSAP / Three / Skia / Lottie?
       YES → DO THAT. Done.
2. Is the effect organic/photoreal AND I cannot code the organic element
   (fire, smoke, real explosion, photoreal B-roll plate, real face)?
       YES → step 3.
       NO  → revisit step 1; you almost never need step 3.
3. Generate ONLY the organic element on a black bg → composite in Remotion
   with mixBlendMode:'screen' or chromakey. (Paid: Runway/Veo/Seedance via vfx/generate/.)
4. Fully generative whole plate — only when nothing else fits.
```

## Catalog — what to reach for, in priority order

| Effect | First choice | Notes / refs |
|---|---|---|
| Fade / slide / scale / 1-element move | `interpolate` + `spring` | Zero dep. `src/components/motion/{FadeInOut, PopText, Wiggle}` |
| Multi-element timeline (labels, stagger, relative-timed) | `useGsapTimeline` | `paused:true` + `.seek(frame/fps)`. GAP-49 + `GSAP-IN-REMOTION.md` |
| Per-character / per-word text | `GsapSplitText` (SplitText) | Split AFTER fonts ready (`document.fonts.ready`) |
| SVG draw-on / morph / motion-path | GSAP `DrawSVGPlugin` / `MorphSVGPlugin` / `MotionPathPlugin` | All free since Webflow acquisition |
| CSS / Tailwind v4 styling | direct | Tailwind `animate-*` is REAL-TIME — DOES NOT RENDER; only static classes |
| Transitions between scenes | `TransitionScenes` (wraps `TransitionSeries`) | `springTiming({damping:200})` default; `fade` \| `slide` \| `wipe` |
| Camera motion blur | `@remotion/motion-blur` `CameraMotionBlur` | Install at core version (GAP-13) |
| Grain / noise overlay | `@remotion/noise` | |
| Shape / path / blob primitives | `@remotion/shapes` / `@remotion/paths` | |
| 3D / particles (WebGL) | `@remotion/three` (R3F) | Needs `setChromiumOpenGlRenderer('angle')` + `--gl=angle` |
| 2D GPU drawing | `@remotion/skia` | |
| GLSL shaders (glitch / RGB-split / CRT / scanline / chromatic-aberration) | `@remotion/html-in-canvas` | Custom shaders; HV §6. Use REAL WebGL API (texImage2D, not the hallucinated drawElementImage) |
| Vector / character animation from designer file | `@remotion/lottie` / `@remotion/rive` | |
| GIF embed | `@remotion/gif` | |
| Audio-driven viz | `@remotion/media-utils` `useAudioData` + `visualizeAudio` | |
| Layout-aware text-fit | `@remotion/layout-utils` `measureText` | |
| Google Fonts (Danish: include `latin-ext`) | `@remotion/google-fonts` | æøå requires latin-ext subset |
| Particles / dust / motes (HAND-CODED) | `@remotion/three` instanced meshes, or absolute-positioned divs animated by `useGsapTimeline` | Free, deterministic — no paid generator needed |
| "Fire / smoke / liquid on black" overlay | Try `@remotion/three` shader first; only escalate to Seedance 2.0 mood/textural for the truly photoreal ones | See `vfx/generate/templates/mood-texture-black-bg.md` |

## Hard rules (Remotion docs, verbatim)

> **"All animations in Remotion must be driven by the value returned by the `useCurrentFrame()` hook."**

Concretely (GAP-46/49):

- Tailwind `animate-*` / CSS `transition` / CSS `@keyframes` (without `animation-play-state` synced
  to frame) / **autoplaying GSAP / autoplaying anime.js / Matter.js live physics** → **do NOT render
  correctly.** Drop or make frame-driven.
- **GSAP timelines** MUST be built `paused: true` and seeked via `.seek(frame/fps)` every frame —
  encapsulated in `useGsapTimeline`. NEVER call `.play()` / `.pause()` / `.reverse()`.
- **NOT supported in Remotion**: Framer Motion, react-spring (use Remotion `spring()`), Reanimated.
- **No `Math.random()` / un-seeded `gsap.utils.random()`** in build paths — renders diverge per frame.
- **SplitText** must split AFTER fonts load (Remotion `delayRender` + `document.fonts.ready`) or line
  boxes differ across frames.

## VFX layering — the canonical compositor

For combining base footage + a generated/composited VFX element + an alpha overlay + a 2D title,
use **`VFXComposite`** in `src/components/motion/`. Props:

```ts
{
  base: { src, from?, durationInFrames? },           // OffthreadVideo plate
  screenBlend?:    { src, ... },                     // black-bg VFX → mixBlendMode:'screen'
  alphaOverlay?:   { src, ... },                     // ProRes 4444 / VP9 yuva
  chromakeyOverlay?: { src, ... },                   // RGBA — pre-key with assemble/chromakey
  title?: { text, color, fontSize, safeRegion, ... } // inside SafeZone
}
```

The Zod schema for the same scene config is `capabilities/vfx/compositor/scene.ts` —
`parseVFXScene()` validates a planner-emitted JSON before it hits a render.

## When to escalate to paid generation

Only when steps 1–2 of the decision tree above fail. Then read
`RESEARCH/capabilities/video-ai-prompting/` (GAP-50), pick a template from
`capabilities/vfx/generate/templates/`, and run the matching wrapper. The router
(`vfx/generate/route.ts`) will pick the model and emit a fallback chain so the planner
has options if the primary call is over budget.
