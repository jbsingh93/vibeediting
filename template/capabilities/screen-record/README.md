# `screen-record/` — autonomous browser screen capture → clean constant-30 fps (GAP-60..67)

**Status: BUILT (P1G, 2026-06-02)** — tested in `_tests/p1g-screen-record.test.ts` (fast tier spends no
browser/network; the render tier stitches real JPEG frames through the live-pipe encoder and asserts CFR 30/1).

The agent **drives the browser itself** and **produces a finished clean 30 fps screencast** — no human at
the keyboard. This is the capture engine behind the `screencast` / `tutorial` / `product-demo` formats the
`video-editor` skill advertises but couldn't autonomously produce. `acquire/` (1F) downloads **existing**
media; `screen-record/` **generates new footage** by operating a browser.

## Two stages (mirror Blender's author→render, GAP-51)

1. **EXPLORE / AUTHOR — Playwright MCP** (`.mcp.json`, pinned `@playwright/mcp@0.0.75`). Interactive,
   accessibility-tree-driven (`browser_snapshot` ≈ 200–400 tokens, ref-based, deterministic — NOT
   screenshot/coordinate guessing). The agent discovers the flow, verifies selectors, plans pacing; with
   `--codegen typescript` the server emits a skeleton. **An approval gate (P2.6) sits here** — the human
   signs off the action plan before the (potentially long) recording run.
2. **DETERMINISTIC RECORD — `record-session.ts`** (standalone tsx, NO MCP in the loop). Replays the action
   plan with deliberate pacing + an injected visible cursor, capturing via the PRIMARY path below. Idempotent
   + re-runnable; this is what auto-fork-on-revision (P2.6b) versions.

## Capture-method decision (GAP-62) — the crux

| Path (`--capture`) | When | File |
|---|---|---|
| **`screencast`** (default) — `page.screencast({onFrame})` JPEG → ffmpeg stdin → H.264 CRF 18 | clean, sandboxed browser recordings **on a real display** | `record-session.ts` + `encode.ts` |
| **`screenshot`** — clock-paced CDP `captureScreenshot` loop → ffmpeg image2pipe | **robust anywhere** — each shot FORCES a composite, so it captures the moving cursor even when the browser renders **off-display** and `page.screencast`/the compositor is frame-throttled. The reliable path for cursor-heavy demos in headless/agent environments. | `record-session.ts` |
| **`gdigrab`** — `ffmpeg gdigrab` of the Chrome window (true CFR) | literal desktop capture · audio in same pass — only when the window is on the **capturable** desktop | `gdigrab.ps1` / record-session `--capture gdigrab` |
| raw CDP `Page.startScreencast` (`everyNthFrame`, `maxWidth`) | HiDPI downsample / knobs the high-level API lacks | `cdp-screencast.ts` |
| **REJECTED for delivery** — MCP `recordVideo` / `page.screencast({path})` WebM | review-only "what happened" artifact | — |

> **Capture cadence footgun (learned live):** `page.screencast` and CDP `startScreencast` only emit a frame on a **compositor commit**. When the headed browser renders without a real display vsync (CI/agent/offscreen sessions), the compositor only ticks on big damage (navigation/scroll) — so **pure cursor motion isn't captured** (you get ~2–6 fps of frozen frames). Use **`--capture screenshot`** there: a `page.screenshot()` loop forces a fresh paint per frame and captures the cursor smoothly (~25–30 fps → CFR-30). The visible cursor is the injected `cursor-overlay.js` overlay (Playwright synthetic input does NOT move the real OS cursor, so `gdigrab -draw_mouse` won't follow it).

> **Never ship the WebM.** It is hardcoded **VP8 @ 1 Mbit** (text smears at 1080p), **variable frame rate**
> (no fps control), **no audio**, and the `--save-video` CLI flag is **broken in 0.0.75**. Review-only.

## Files

| File | Purpose | Backs |
|---|---|---|
| `record-session.ts` ✅ | PRIMARY deterministic driver: headed Chrome + cursor + determinism init → `page.screencast` onFrame → live-pipe encode → CFR-30 mp4; emits contract envelope + provenance (target URLs, script sha256, viewport/dscf/fps). | P1G.3 |
| `encode.ts` ✅ | The **stitch** (GAP-63). Pure ffmpeg-argv builders for each recipe (image2pipe / concat / webm / minterpolate / lanczos / NVENC) + `spawnLivePipeEncoder` + `runEncode`. `fps=30 -vsync cfr` forces constant rate. | P1G.4 |
| `actions.ts` ✅ | The record-plan action model (`RecordAction`/`RecordPlan`), `validatePlan`, and the paced `runAction` replay (smooth glide / wheel-loop scroll / per-key typing / chapter cards). Shared by both drivers. | P1G.3 |
| `pacing.ts` ✅ | `DEFAULT_PACING` table + smooth-motion helpers (`smoothClick*`, `smoothScroll`, `smoothType`). | P1G.2 |
| `assets/cursor-overlay.js` ✅ | The `pointer-events:none`, `z-index:max` DOM cursor following mouse events, with a `MutationObserver` SPA re-attach. Loaded via MCP `--init-script` (explore) AND `addInitScript` (record). | P1G.2 |
| `guards.ts` ✅ | Path-guard (`assertSafeOutputPath` → only `out/`/`test-video/`/`public/`), `determinismInitScript` (frozen `Date`/seeded `Math.random`), `redactAuthRef`. | P1G.6 |
| `cdp-screencast.ts` ✅ | FALLBACK B — raw CDP with `screencastFrameAck` flow control + `metadata.timestamp` concat-manifest assembly. | P1G.5 |
| `gdigrab.ps1` ✅ | FALLBACK A — Windows desktop capture (CFR + audio + real cursor); path-guarded. | P1G.5 |
| `verify-screencast.ts` ✅ | The screencast TECHNICAL assertions (CFR / frame-count / resolution / yuv420p / non-frozen) — fed into `orchestrate/verify.ts` (GAP-66). | P1G.7 |

## Watchability rules (GAP-64) — a robotic capture is NOT a deliverable

- **Visible cursor** that **glides** (`mouse.move(x,y,{steps:28})`), never teleports. Cursor is invisible in
  Playwright captures by default → the overlay is mandatory.
- **Smooth scroll** = a wheel LOOP (`wheel(0,70)` + 40 ms), not `PageDown`.
- **Deliberate pacing**: 400 ms after load, 500 ms pre-click settle, 800 ms post-click, per-key typing delay,
  read dwell, chapter cards. All in `pacing.ts::DEFAULT_PACING` (override per-brief via the plan's `pacing`).
- **Determinism**: frozen clock + seeded RNG (`determinismInitScript`), `locale:'en-US'` + UTC (override via `plan.target.locale`/`timezoneId`),
  `--storage-state` for pre-auth, `route` mocks for dynamic data.

## Security + privacy (GAP-65) — HARD RULES

- **Prefer the SANDBOXED capture** (`page.screencast`/CDP) over `gdigrab` **whenever secrets risk exists** —
  the in-browser screencast cannot see OS UAC dialogs, notifications, other windows, the desktop; `gdigrab`
  films the ENTIRE screen.
- **Never record a real signed-in personal account** — use `--isolated` + a purpose-seeded `auth.json`
  (gitignored, treated as a secret, never in `public/`).
- **Never type real credentials on-camera** — throwaway/demo accounts; `route`-mock auth; redact tokens.
- Outputs are **path-guarded** to `out/` / `test-video/` (gitignored) or an explicit `public/<project>/` — never
  a synced personal folder.

## Output contract

Frames + raw → `out/work/<project>/screen-record/`; the finished CFR-30 clip → `public/<project>/<slug>.mp4`
(end-to-end Remotion comp via `<OffthreadVideo>`) **or** `out/<project>/scenes/<NN>-<slug>{-vK}.mp4` (external
NLE edit, reusing the GAP-53 scene-clip convention). The clip then feeds `ingest/probe.ts` (→ `durationInFrames`),
captions via Whisper + `KineticCaptions`, and any VO is loudnorm'd to −14 LUFS / −1 dBTP at delivery.

## Dependencies (Windows-native, NO Python)

- **`playwright`** pinned in `package.json` devDeps (`1.59.0` — the `page.screencast` version). **On-demand**:
  `npm i -D playwright && npx playwright install chromium`. `doctor` yellows (not reds) when absent.
- **`@playwright/mcp@0.0.75`** pinned EXACT in `.mcp.json` (never `@latest` — it iterates daily).
- The full **`C:\ffmpeg`** (shared resolver) for every stitch. Capture is **headed system Chrome**
  (`channel:'chrome'`) — HiDPI via `deviceScaleFactor:2` → lanczos-downsampled to 1080p.

## Routed by the `screencast-demo` style (P5.5) + router flow (P5.6)
The `video-editor` router: (1) drives the EXPLORE stage, (2) writes the action plan into the manifest and
**stops at the approval gate**, (3) on approval runs `record-session.ts` (picking the capture path per GAP-62),
(4) hands the clip to end-to-end Remotion or `out/<project>/scenes/`, (5) gates delivery through the split
verifier's screencast meters + sub-lens. Revisions auto-fork to v2.
