# Template — mood / textural on black bg (Tier-2)

**Use when:** abstract / textural element (fire, smoke, ink drop, dust, light leaks, particle motes)
that gets composited over base footage via `mixBlendMode:'screen'` in Remotion.

**Router decision (GAP-50):** `Seedance 2.0` (cheapest, strongest camera language). Fallback: Veo 3.1 Fast.

**Hard rule (GAP-50):** `cameraFixed:false` MUST be set whenever the brief expects motion (default is `true` → locked frame → silent failure). The wrapper auto-injects this from `brief.cameraMotion=true`.

**Compositing rule:** generated clip arrives on near-black; Remotion comps with `mixBlendMode:'screen'`
so black drops out. No chromakey needed. (See `motion/` README for the React composite recipe.)

**Prompt template (paste into `--prompt`):**

```
{{element: thick warm-orange ember sparks}} drifting slowly across the frame, deep black background.
Macro lens, shallow depth of field. {{motion: rising slowly with subtle horizontal drift}}. Cinematic.
No text. No background detail — pure black. Audio: silent.
```

**Wrapper invocation:**
```
tsx capabilities/vfx/generate/seedance.ts \
  --prompt "<fill template>" \
  --duration 5 --aspect 16:9 --resolution 1080 \
  --camera-motion \
  --out out/work/<project>/vfx/embers-black-bg-v1.mp4
```

**Rules of record:** the matching wrapper header (§Seedance, "Camera language" + "cameraFixed".).
