# `perception/` — the agent's eyes & cut judgment

the project's edge.
**Status: BUILT (P1E, 2026-05-27)** — tested in `_tests/p1e-perception.test.ts`. Shared upload/poll/JSON
helper: `gemini-client.ts` (uploads ONCE, reused across specialist calls).

| File | Purpose | Backs |
|---|---|---|
| `gemini-video-review.ts` ✅ alias | Forwards argv to the canonical skill script (`_env/delegate.ts`) — preserved exactly; physical promote in P5.2. Model = **`gemini-3.1-flash-lite`**. | existing; AN §1.3 |
| `cut-doctor.ts` ✅ alias | Forwards argv to the canonical cut surgeon (bundled-ffmpeg + Gemini-fallback behavior preserved, GAP-3). | existing |
| `specialists.ts` ✅ SSOT | **The specialist-panel registry** — ONE roster of 10 world-class single-domain experts (`sound · cut · broll-concept · story · composition · color · detail · performance · typography · brand`), each with a perceive + judge prompt, per-specialist `thinking_level`/`media_resolution`, and prompt-repetition. `buildPrompt(s, mode, ctx)` assembles the potent XML prompt; rule IDs (A1–B5) resolve against `.claude/skills/video-editor/references/editing-protocol.md`. Consumed by BOTH councils. | panel design |
| `perception-council.ts` ✅ | **The PERCEIVE council = the CONCEPTUALIZE phase.** Fans the perceive roster out over SOURCE footage (replacing the monolithic `describe`) and FUSES the maps into `<prefix>.conceptualization.md` — spine · concept-visual beats (the teach-test) · b-roll opportunities · cut/cover map · emphasis words — the plan-ready synthesis the editor builds the storyboard from. | conceptualize |
| `gemini-council.ts` ✅ | **The JUDGE council** — runs the panel (judge mode) on a RENDERED edit, grading each protocol rule. Forced-evidence calls (bans evidence-free "looks great", quadrant scan + MM:SS + severity, `unsure`→meter); `ship` ⟺ all blockers == 0. Registry-driven; per-specialist sampling. `gemini-3.1-flash-lite`, many cheap calls. | GAP-45/47 |
| `reference-analyze.ts` ✅ | **Reference deconstruction** (GAP-48): measures objective signals (ASL/palette/loudness) then runs the **9-specialist** reference roster (tempo/ASL · cuts/transitions · color/grade · **fonts/typography** · overlays · motion/camera · sound/music · hook/structure · composition) → **`style-spec.json`** + `reference-report.md`. `--signals-only` runs the measured half offline. | GAP-48; P1E.4 |

**Governing rule:** the visual cortex is **`gemini-3.1-flash-lite`**, never Gemini 2.5. Flash-lite
over-reads → every "looks great" must cite timestamped, frame-region evidence or it is re-prompted;
objective meters still win where they exist. *(AN §1.3; plan P1E.1, GAP-38/45/47.)*
