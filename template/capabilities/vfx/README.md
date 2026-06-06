# `vfx/` — AI VFX layer (P4V; on-demand)

**POLICY: NO local/free VFX models.** All local matting, upscale, depth,
optical-flow, inpaint models — and the local-free Wan generator — are **removed** (the **6 GB RTX
3060 Laptop** can't run them anyway; no PyTorch/CUDA VFX env). VFX is exactly two layers:

1. **Deterministic Remotion-native effects FIRST** — the default for all graphic/typographic/UI/light/
   particle/transition work. Free, frame-accurate, reproducible. **Lives in `motion/`, not here.**
   The decision tree + effect catalog is at
   [`motion/DETERMINISTIC-VFX-CHEATSHEET.md`](../motion/DETERMINISTIC-VFX-CHEATSHEET.md).
2. **PAID cloud generation — Runway, Veo, Seedance ONLY** — for photoreal/organic content that
   genuinely can't be coded. Cost + approval gated by the P2 `orchestrate/budget-guard.ts`
   (`APIBudgetGuard` + sha256 `GenerationCache`).

| Dir | Built? | What |
|---|---|---|
| [`generate/`](./generate/) | ✅ P4V.5 + P4V.8 | Paid-cloud wrappers — Runway (`runway.ts`, `aleph.ts`) · Veo (`veo.ts`) · Seedance (`seedance.ts`). Router (`route.ts`), cost claim (`cost.ts`), seed-aware cache (`cache.ts`), sanitizers (`sanitize.ts`), per-use-case prompt templates (`templates/`). |
| [`color-match/`](./color-match/) | ✅ P4V.11 | Reinhard LAB statistical transfer + temporal EMA + alpha-preserving variant. **CPU algorithm, not an ML model.** Makes a paid-generated clip sit in the base plate's grade. |
| [`compositor/`](./compositor/) | ✅ P4V.10 | Typed VFXComposite scene config (Zod) for the Remotion template at `src/components/motion/VFXComposite.tsx` + a pure-ffmpeg fallback (`composite.ts`) for one-off composites. |

**Alpha encoding (GAP-41, still relevant for `chromakey`/paid-clip compositing):** VP9
`-c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0`, or ProRes 4444 `yuva444p10le`, or PNG-RGBA seq —
never cv2 `VideoWriter`. *(plan Phase 4V; HV §1; VX §3–4.)*

**Prompting rules of record:** `RESEARCH/capabilities/video-ai-prompting/` (GAP-50). Every paid call
goes through these. The cost matrix lives in `_env/models.json` (`generativeVideo.*`).
