# `motion/` — Remotion render + deterministic GPU VFX

The 2D compositor layer and the **default** VFX path (try this before any paid generation, GAP-46).

| Planned file | Purpose | Backs |
|---|---|---|
| `render.ts` | Typed-template Remotion render/still via Node APIs (`imageFormat:'png'` per-render for alpha — never the global jpeg config, GAP-11). | P3 |
| `gpu/` | HtmlInCanvas GLSL (glitch/RGB-split/CRT), `@remotion/motion-blur`, `@remotion/three` (R3F particles), `@remotion/skia`. Needs `setChromiumOpenGlRenderer('angle')` + `--gl=angle`. | P4V.4; HV §6 |
| [`DETERMINISTIC-VFX-CHEATSHEET.md`](./DETERMINISTIC-VFX-CHEATSHEET.md) | The **GAP-46 decision tree** + effect-catalog (what to reach for, in priority order) before any paid generation. Single source of truth for the native-VFX hierarchy. | P4V.4; GAP-46 |
| `src/components/motion/VFXComposite.tsx` | The canonical compositor template (base + screenBlend + alphaOverlay + chromakeyOverlay + 2D title), with a matching Zod scene schema at `capabilities/vfx/compositor/scene.ts`. | P4V.10 |
| `useGsapTimeline.ts` + GSAP atoms | **GSAP engine (GAP-49):** build a `paused` timeline, `.seek(frame/fps)` each frame. Timelines + stagger + labels, **SplitText** (per-char/word text), **MorphSVG/DrawSVG/MotionPath** (SVG), CustomEase/Wiggle/Bounce. ScrollTrigger/Draggable/Observer/GSDevTools are render-useless and excluded. Free since the Webflow acquisition. **Full guide: [`GSAP-IN-REMOTION.md`](./GSAP-IN-REMOTION.md).** | P3.3; GAP-49 |

**HARD RULE (Remotion):** *every* animation must be driven by `useCurrentFrame()`. Tailwind
`animate-*` / CSS `transition` / real-time anime.js/GSAP do NOT render — they must be frame-driven.
**GSAP** is allowed only as a `paused` timeline seeked to `frame/fps` (`useGsapTimeline`, GAP-49 — see
[`GSAP-IN-REMOTION.md`](./GSAP-IN-REMOTION.md)). NOT supported: Framer Motion, react-spring (use
`spring()`), Reanimated. Install `@remotion/*` add-ons at the **core version** (GAP-13). *(GAP-46/49; remotion.dev/docs/{third-party,tailwind,api}.)*
