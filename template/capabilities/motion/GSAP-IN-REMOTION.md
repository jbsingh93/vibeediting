# GSAP in Remotion — the complete guide (when + how)

> Deep-research reference for using **GSAP** as an animation capability inside our frame-driven
> Remotion pipeline. Distilled from GreenSock's official AI-agent skills
> (`github.com/greensock/gsap-skills`, MIT) + the GSAP v3 docs, then bridged to Remotion — the
> bridge layer is the part the upstream skills DON'T cover (they assume real-time web/scroll).
>
> Governing position in our stack: **GAP-46 deterministic-Remotion-first**. GSAP is a *tier-1,
> code-it* tool — reproducible, free, frame-accurate — NOT generative VFX. See `RESEARCH/capabilities/01-IMPLEMENTATION-PLAN.md` GAP-49.

---

## 0. TL;DR

GSAP works beautifully in Remotion **only if every timeline is built `paused` and seeked to the
current frame** — never left to run on its own real-time ticker. One small hook (`useGsapTimeline`)
encapsulates the rule. GSAP is now **100% free** (Webflow acquisition, incl. SplitText / MorphSVG /
DrawSVG — `npm install gsap`, no auth token). Use it for **multi-element choreography, per-character
text, and SVG morph/draw/motion-path**; keep Remotion's `interpolate`/`spring` for simple moves.

---

## 1. The HARD RULE (why naïve GSAP renders a frozen frame)

Remotion's contract: *"All animations in Remotion must be driven by the value returned by the
`useCurrentFrame()` hook."* GSAP, by default, drives its timeline from `performance.now()` — a
**real-time** clock. During a headless render Remotion advances time itself frame-by-frame, so a
GSAP animation left on autoplay either renders **frozen** (paused at t=0) or non-deterministically.

**The fix:** build the timeline **`paused: true`**, then on every frame call
`timeline.seek(frame / fps)`. GSAP's timeline is fully scrubbable (`.seek()`, `.time()`,
`.progress()`, `.totalProgress()`), so seeking puts it in perfect lockstep with the output.

---

## 2. The canonical integration — `useGsapTimeline`

```tsx
// src/components/motion/useGsapTimeline.ts  (the single, safe entry point)
import { useRef } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

gsap.registerPlugin(useGSAP);

/**
 * Build a PAUSED GSAP timeline once (scoped + auto-reverted by useGSAP), then seek it to the
 * current Remotion frame on every render. Timeline seconds == video seconds.
 */
export function useGsapTimeline(
  build: (tl: gsap.core.Timeline) => void,
  scope: React.RefObject<HTMLElement | null>,
) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tl = useRef<gsap.core.Timeline | null>(null);

  useGSAP(() => {
    tl.current = gsap.timeline({ paused: true });
    build(tl.current);
  }, { scope });            // empty deps → build ONCE; selectors scoped to `scope`

  tl.current?.seek(frame / fps);   // ← frame-drive it (deterministic)
  return tl;
}
```

```tsx
// usage in a composition
const scope = useRef<HTMLDivElement>(null);
useGsapTimeline((tl) => {
  tl.from('.title', { autoAlpha: 0, y: 40, duration: 0.8, ease: 'power3.out' })
    .from('.sub',   { autoAlpha: 0, y: 20, duration: 0.6 }, '<0.15')   // 0.15s after title starts
    .to('.badge',   { scale: 1, ease: 'back.out(1.7)', duration: 0.5 }, '-=0.2');
}, scope);
return <div ref={scope}> … </div>;
```

**Two ways to map time** — pick one:
- **By time** (default above): `tl.seek(frame / fps)` → 1 timeline second = 1 video second. Intuitive; the comp's `durationInFrames` should be ≥ `timeline.duration() * fps`.
- **By progress** (stretch a timeline to fill the comp): `tl.progress(frame / (durationInFrames - 1))`.

---

## 3. Determinism gotchas (Remotion-specific — memorize these)

- ✅ **Build once, seek per frame.** Never rebuild the timeline every frame (perf + flicker). `useGSAP` with an empty/managed dep array does this; `gsap.context()`+`ctx.revert()` in `useLayoutEffect` is the no-`@gsap/react` fallback.
- ✅ **Only `.seek()` — never `.play()`/`.pause()`/`.reverse()`** in a render. Playback control is for the live Player only, not the render.
- ❌ **No `Math.random()` / un-seeded `gsap.utils.random()`** inside the build — it changes per render → flicker. Precompute random values with a fixed seed and bake them in.
- ⚠️ **SplitText + fonts:** split happens once in `useGSAP`; if a custom font isn't loaded yet, line/word boxes differ → wrong layout in the render. Load fonts first (Remotion `@remotion/google-fonts` + `delayRender`/`continueRender`, or `document.fonts.ready`) **before** the comp mounts, or prefer `type: "words, chars"` (less line-dependent). `autoSplit:true` + `onSplit()` re-splits on font load.
- ⚠️ **`@gsap/react`'s `useGSAP`** is built for the browser lifecycle; in Remotion's render each frame re-renders the mounted component, so build-once + seek-in-body is correct. (Don't put the seek inside `useGSAP`'s callback — it would only run on (re)build.)
- ✅ **`autoAlpha` over `opacity`** for fades (sets `visibility` too); **transform aliases** (`x`,`y`,`scale`,`rotation`,`xPercent`) over raw CSS — same advice as web, and they're the compositor-friendly props.

---

## 4. Which GSAP features are USEFUL vs USELESS in a headless render

| Feature | In Remotion render? | Notes |
|---|---|---|
| Core tweens (`to/from/fromTo/set`) + **Timeline** | ✅ **Core use** | the whole point — choreography via `.seek()` |
| Eases (power/back/elastic/expo/sine…) + **CustomEase/CustomWiggle/CustomBounce** | ✅ | deterministic; richer than hand-rolled beziers |
| **SplitText** (chars/words/lines) | ✅ **High value** | per-unit text reveals — better than our hand-rolled `KineticCaptions` stagger (mind fonts, §3) |
| **DrawSVG** (stroke draw-on) | ✅ | line/underline/logo draw-on |
| **MorphSVG** (shape→shape) | ✅ | icon/shape morphs |
| **MotionPath** (move along path) | ✅ | object follows a curve |
| **ScrambleText** | ✅ | glitch/scramble text reveal |
| **Physics2D / PhysicsProps** | ✅ *if seeded* | deterministic given fixed params, no random |
| **Stagger**, labels, nested timelines, `gsap.matchMedia` | ✅ | matchMedia maps to per-format/aspect variants |
| **Flip** | ⚠️ careful | measures DOM states across renders — fragile frame-by-frame; usually avoid |
| **ScrollTrigger / ScrollSmoother / ScrollToPlugin** | ❌ **useless** | no scroll in a video render |
| **Draggable / Inertia / Observer** | ❌ useless | no pointer/gesture in a render |
| **GSDevTools** | ❌ never ship | dev scrubber UI only |
| **`gsap.quickTo()` (mouse follower)** | ❌ useless | real-time input only |

> The upstream `gsap-skills` over-index on ScrollTrigger/Draggable because they target real-time web.
> **For rendered video, ignore the ❌ rows.**

---

## 5. WHEN to reach for GSAP (decision tree — sits inside GAP-46)

1. **Simple fade / move / scale of 1–2 elements?** → **Remotion `interpolate`/`spring`** (zero dep, idiomatic). Don't GSAP a fade.
2. **Multi-element sequence with relative timing / stagger / labels?** → **GSAP Timeline.** This is its sweet spot and directly fixes our "hand-pinned frame offsets" pain (plan P3.1): write `"<0.15"`/`"-=0.2"`/labels instead of computing frame numbers.
3. **Per-character / word / line text animation?** → **GSAP SplitText.**
4. **SVG: draw a stroke, morph a shape, move along a path?** → **DrawSVG / MorphSVG / MotionPath.**
5. **A specific custom easing curve / wiggle / bounce?** → **CustomEase / CustomWiggle / CustomBounce.**
6. **Particles / 3D / shaders?** → **`@remotion/three` (R3F) / `@remotion/skia` / HtmlInCanvas GLSL**, NOT GSAP.
7. **Photoreal / organic footage that can't be coded?** → generative VFX tier (P4V.5), NOT GSAP.

GSAP and `anime.js` (also named in GAP-46) overlap; **prefer GSAP** — bigger plugin set, the SplitText/MorphSVG advantage, the official agent skills, and now zero cost.

---

## 6. Core best-practice cheat-sheet (from GreenSock's skills)

- **camelCase** vars (`backgroundColor`, `rotationX`). Relative values: `x: "+=20"`, `rotation: "-=30"`.
- **Transforms:** `x/y/z`, `xPercent/yPercent`, `scale/scaleX/scaleY`, `rotation/rotationX/rotationY`, `skewX/skewY`, `transformOrigin`. Directional rotation suffixes: `"-170_short"`, `"+=30_cw"`, `_ccw`.
- **`autoAlpha`** for fades; **`clearProps`** to hand control back to CSS after a tween.
- **`immediateRender` footgun:** `from()`/`fromTo()` default `immediateRender:true`. When stacking multiple `from`/`fromTo` on the **same property of the same element**, set `immediateRender:false` on the later ones or the start state gets overwritten and the second animation won't show.
- **Timeline position parameter:** absolute `3` · relative `"+=0.5"`/`"-=0.2"` · label `"intro"`/`"intro+=0.3"` · `"<"` (start of previous) · `">"` (end of previous) · `"<0.2"` (0.2s after previous start). **Use labels + relative positions, never hardcoded delays.**
- **`defaults`** on the timeline constructor so children inherit `duration`/`ease`: `gsap.timeline({ paused:true, defaults:{ duration:0.6, ease:"power2.out" }})`.
- **Stagger:** `stagger: 0.08` or `{ each:0.06, from:"center"|"edges"|"random"|"start"|"end" }`.
- **`gsap.matchMedia`** → map to our **variant fan-out** (different motion per aspect/format), and to `prefers-reduced-motion` for the Player.
- **Register plugins once** at module top: `gsap.registerPlugin(SplitText, DrawSVGPlugin, MorphSVGPlugin, useGSAP)`.

### Easing → feel (for motion graphics)
- `power1–power4.out` — standard entrances (default `power1.out`); higher = snappier settle.
- `power2/3.inOut` — smooth move-and-settle between positions.
- `back.out(1.7)` — overshoot pop (badges, CTAs, logo stings).
- `elastic.out(1, 0.3)` — springy bounce (playful accents — use sparingly).
- `expo.out` — fast start, long glide (premium/Apple-keynote feel).
- `circ.inOut` — mechanical, even.
- `none` — linear (tickers, constant motion, scrubbing UI).
- `steps(n)` — choppy/stop-motion.
- `CustomEase.create("x","M0,0 …")` — exact bespoke curve (paste cubic-bezier or SVG path).

---

## 7. Use-cases (where this earns its keep)

- **Kinetic captions / title reveals:** SplitText `chars`/`words` + stagger → cleaner than the hand-rolled spring loop in `src/components/KineticCaptions.tsx`.
- **Multi-scene choreography:** one labelled timeline replaces dozens of hand-pinned `from`/`interpolate` frame numbers (the classic hand-pinned-comp failure mode) → timeline-as-data instead.
- **Logo stings / lower-thirds:** `back.out` pops, DrawSVG underline draw-on, MorphSVG icon swaps.
- **Data-viz / explainer:** MotionPath dots along a route; staggered bar/number reveals.
- **Brand accents:** ScrambleText reveals, CustomWiggle emphasis.

---

## 8. Prompt patterns (use the `master-gpt-prompter` skill, GAP-47)

When asking the agent (or yourself) to author a GSAP build, specify these so the output is
deterministic + render-safe. Template:

```
Build a PAUSED GSAP timeline for a Remotion scene (it will be seeked by frame, never played).
- Scope: all selectors under the `scope` ref (class names: .title, .sub, .cta).
- Sequence (durations in SECONDS, use the position parameter + labels, not hardcoded delays):
  1) .title  — from autoAlpha 0, y 40, 0.8s, power3.out
  2) .sub    — from autoAlpha 0, y 20, 0.6s, starting 0.15s after the title starts ("<0.15")
  3) .cta    — scale pop, back.out(1.7), 0.5s, 0.2s before previous ends ("-=0.2")
- Use transform aliases + autoAlpha. No Math.random, no ScrollTrigger/Draggable, no .play().
- Return only the timeline build function `(tl) => { ... }` for useGsapTimeline.
```

For **reference-mimicry** (GAP-48): feed the `style-spec.json` (ASL, transition list, easing feel)
into the prompt so the GSAP timeline reproduces the reference's tempo/easing.

---

## 9. Install & licensing

- **Free for everyone** since Webflow's acquisition — every plugin incl. SplitText/MorphSVG/DrawSVG. No `.npmrc`, no auth token, no private registry. *(gsap-skills `llms.txt` / `gsap-plugins`.)*
- `npm install gsap @gsap/react` (pin at the core version like our other deps). Import plugins from `gsap/SplitText`, `gsap/DrawSVGPlugin`, `gsap/MorphSVGPlugin`, etc.
- **Authoritative API source:** vendor or consult GreenSock's skills — `npx skills add https://github.com/greensock/gsap-skills` (MIT), or read them on GitHub. This guide is the **Remotion bridge** on top of them.

---

## 10. Sources
- GreenSock official agent skills (MIT): `github.com/greensock/gsap-skills` — `gsap-core`, `gsap-timeline`, `gsap-react`, `gsap-plugins`, `gsap-performance`, `llms.txt`.
- `gsap.com/docs/v3/` — Timeline, Eases, `useGSAP`/React, SplitText, MorphSVG, DrawSVG, MotionPath.
- Remotion: `useCurrentFrame()` + third-party integration (frame-seek other animation libs).
