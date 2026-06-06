# `perception/` — the agent's eyes & cut judgment

the project's edge.
**Status: BUILT (P1E, 2026-05-27)** — tested in `_tests/p1e-perception.test.ts`. Shared upload/poll/JSON
helper: `gemini-client.ts` (uploads ONCE, reused across specialist calls).

| File | Purpose | Backs |
|---|---|---|
| `gemini-video-review.ts` ✅ alias | Forwards argv to the canonical skill script (`_env/delegate.ts`) — preserved exactly; physical promote in P5.2. Model = **`gemini-3.1-flash-lite`**. | existing; AN §1.3 |
| `cut-doctor.ts` ✅ alias | Forwards argv to the canonical cut surgeon (bundled-ffmpeg + Gemini-fallback behavior preserved, GAP-3). | existing |
| `gemini-council.ts` ✅ | **7-specialist panel** (detail / transition / story→B-roll / brand-safe-zone / composition / A-V-sync / color). Forced-evidence calls (bans evidence-free "looks great", demands quadrant scan + MM:SS + severity); `ship` ⟺ all blockers == 0. `gemini-3.1-flash-lite`, many cheap calls. | GAP-45/47 |
| `reference-analyze.ts` ✅ | **Reference deconstruction** (GAP-48): measures objective signals (ASL/palette/loudness) then runs the **9-specialist** reference roster (tempo/ASL · cuts/transitions · color/grade · **fonts/typography** · overlays · motion/camera · sound/music · hook/structure · composition) → **`style-spec.json`** + `reference-report.md`. `--signals-only` runs the measured half offline. | GAP-48; P1E.4 |

**Governing rule:** the visual cortex is **`gemini-3.1-flash-lite`**, never Gemini 2.5. Flash-lite
over-reads → every "looks great" must cite timestamped, frame-region evidence or it is re-prompted;
objective meters still win where they exist. *(AN §1.3; plan P1E.1, GAP-38/45/47.)*
