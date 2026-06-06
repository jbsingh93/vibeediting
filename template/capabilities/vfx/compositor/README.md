# `vfx/compositor/` — VFXComposite scene config + ffmpeg fallback (P4V.10)

| File | What |
|---|---|
| [`scene.ts`](./scene.ts) | Zod schema for a `VFXComposite` scene (base + screenBlend + alphaOverlay + chromakeyOverlay + title). Round-trips through the manifest. |
| [`composite.ts`](./composite.ts) | Pure-ffmpeg fallback when a quick composite is needed without spinning up Remotion. Uses `assemble/ffmpeg-ops` (`chromakey` + `overlay` + blend=screen). |

**Primary path:** the `src/components/motion/VFXComposite` React template (frame-driven, GAP-46). The
planner emits a `VFXCompositeScene` JSON, registers it as a Remotion `<Composition>` with
`defaultProps`, and renders via `motion/render`. Use `composite.ts` only for one-off ffmpeg-only
composites the orchestrator wants without a React render.

**Alpha encoding standard (GAP-41):** every overlay this compositor consumes is expected to be RGBA
already (ProRes 4444 `yuva444p10le` or VP9 `yuva420p -auto-alt-ref 0`). If your source is green-bg,
key it FIRST with `assemble/chromakey` (this compositor does that automatically for the
`--chromakey-overlay` flag).
