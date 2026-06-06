# CAPABILITIES.md — the complete map of what this project can (and cannot) do

> **Purpose of this file.** A single, root-level, always-current inventory of every capability engine in
> `capabilities/`, every shared Remotion motion atom in `src/components/motion/`, and the orchestration spine
> that ties them together — with each one's **exact invocation, inputs, outputs, and hard limits**. When you
> want to know "can this project do X?", look here first. Keep it in sync when a capability is added or changed.
>
> **Test gate:** `npm test` = the fast capability suite (no API budget spent), `npm run test:render`
> adds the slow render tier · `npm run lint` (strict tsc) green.

---

## 0. The two-layer architecture in one breath

- **Capabilities = the global, shared engines.** Built once, used by every video. Live in the top-level
  `capabilities/` tree. Each emits the **contract envelope** (a JSON result line on stdout) and writes
  intermediates to disposable `out/work/<project>/<stage>/`.
- **Skills = styles / recipes.** Thin compositions of capabilities for one *kind* of video. They hold **no
  engine logic**. `video-editor` is the **router/planner**: detect format+style → write the manifest →
  pick the style → dispatch capabilities → run the verifier. Your own saved templates appear here too
  (Save-as-Template writes a new skill).
- **Model IDs live in ONE file:** `capabilities/_env/models.json`. Edit `id` there to swap a model. (Most
  active scripts still hardcode their IDs today except Gemini via `GEMINI_MODEL`; wiring every script to read
  the registry is a planned refactor.)

### Status legend
| Mark | Meaning |
|---|---|
| ✅ **BUILT** | Implemented, tested, usable today |
| 🟡 **ON-DEMAND** | Engine exists but a dependency (Blender / paid API key / venv / browser) must be present to actually run |
| 🧭 **PLANNED** | Designed, not yet built |

---

## 1. `_env/` — environment, resolvers, contract ✅

The plumbing every other capability stands on. No video logic.

| File | What it is | Invoke | Notes / limits |
|---|---|---|---|
| `contract.ts` / `contract.py` | The capability **result envelope** + `workDir`/provenance/`modelId`/`runCapability`/`emit` helpers (TS + Python mirrors) | imported as a library | Envelope = `{success, capability, outputs[], metrics, warnings?, error?, startedAt, finishedAt, durationMs}` printed as the **last stdout line**. `run()` never throws. |
| `ffmpeg.ts` | **Single source of truth** for ffmpeg/ffprobe binary resolution + capability probe | `tsx capabilities/_env/ffmpeg.ts` (writes `ffmpeg-capabilities.json`); `--selftest` runs the acceptance ops | Resolution order: `VIBE_FFMPEG` → `.vibe/bin/` (provisioned by `vibe setup --ffmpeg`) → PATH. **Never** falls back to Remotion's stripped build. |
| `ffmpeg-capabilities.json` | Recorded proof of the build's filters/encoders | auto-generated per machine | **20 filters probed**: `loudnorm, alimiter, afade, highpass, lowpass, lut3d, haldclut, xfade, crop, scale, scdet, select, chromakey, zscale, tonemap, drawtext, sidechaincompress, colorbalance, colortemperature, eq`. **Required encoders**: `prores_ks, libvpx-vp9, libx264, aac`; hardware encoders (`h264_nvenc, hevc_nvenc, h264_videotoolbox, hevc_videotoolbox`) probed + recorded but OPTIONAL (presets fall back to libx264). |
| `models.json` | **THE model registry** — every model ID, in one place | edit `id` to swap | See §1.1 below. |
| `doctor.ts` | Preflight health check | `tsx capabilities/_env/doctor.ts [--json]` | RED (ffmpeg/ffprobe/broken venv/disk) exits non-zero; YELLOW (missing venv, playwright, MCP, chrome, blender, GPU, .env keys) are optional/on-demand. Does **not** test network. `--json` feeds the UI Health page. |
| `setup-venv.ts` | Create the OPTIONAL `capabilities/.venv` (Python 3.12 preferred), cross-platform | `tsx capabilities/_env/setup-venv.ts [--recreate]` (or `vibe setup --venv`) | Installs `requirements.txt`: pedalboard, pyloudnorm, soundfile, numpy, PIL, colour, cv2, librosa, yt-dlp. **Torch NOT installed** (no local VFX models). Without the venv: mastering/beat/VAD/yt-dlp degrade gracefully; ffmpeg-only loudnorm still ships audio. |

### 1.1 `models.json` — the model registry (verbatim roles)

**ACTIVE today**
- **Perception / visual cortex** → `gemini-3.1-flash-lite` (Google). Env override: `GEMINI_MODEL`.
  **Governing rule: NEVER substitute Gemini 2.5.**
- **Transcription / STT** → `whisper-1` (OpenAI). **The ONLY STT — no local/faster-whisper, no fallback.**
- **TTS** → `eleven_multilingual_v2` (default), `eleven_v3` (expressive, `--v3`). Voice = YOUR
  `brand/brand.json` → `voice.elevenlabsVoiceId` (ships empty — set your cloned/picked voice).
- **Music** → `music_v1` (ElevenLabs). **SFX** → `eleven_text_to_sound_v2`.
- **Thumbnails** → `gpt-image-2-2026-04-21` (OpenAI). Env override: `OPENAI_IMAGE_MODEL`.

**PLANNED / on-demand (paid generative video trio ONLY)**
- **Veo** `veo-3.1-generate-preview` ($0.40/s, *selected*), `veo-3.1-fast-generate-preview` ($0.15/s draft).
- **Runway** `gen4.5` (12 cr/s), `gen4_turbo` (5 cr/s), `aleph` (15 cr/s, v2v).
- **Seedance** (via fal.ai) `…/seedance/v2/text-to-video` ($0.04/s), `…/seedance/v1-5-pro/…` (face fallback).
- **Color (planned)** `seunghyuns98/VideoColorGrading` — reference→`.cube` diffusion, on-demand.

**Tooling pins (not in models.json):** `playwright` >= 1.59 (devDep, on-demand), `@playwright/mcp` (pinned EXACT in `.mcp.json`).

**VFX policy:** NO local/free generative models. Paid cloud = Runway/Veo/Seedance only;
everything else is deterministic Remotion-native.

---

## 2. `ingest/` — get media + truth into the pipeline ✅

| File | Purpose | Invoke | Output | Can't |
|---|---|---|---|---|
| `probe.ts` | ffprobe metadata → `durationInFrames` | `tsx capabilities/ingest/probe.ts --in ASSET [--fps 60]` | metrics only (codec, w/h, fps, pixFmt, audio, **durationInFrames**) | no thumbnails; assumes constant fps |
| `transcribe.ts` | **OpenAI Whisper** word-level STT | `tsx capabilities/ingest/transcribe.ts --in AUDIO --out-prefix PREFIX [--lang xx]` | `<PREFIX>.captions.json` (Remotion `Caption[]`) + `.srt` | needs `OPENAI_API_KEY`; **whisper-1 only**, no local fallback; `--lang` = ISO-639-1 hint, omitted → auto-detect |
| `scene-detect.ts` | shot boundaries via ffmpeg `select=gt(scene,T)` | `tsx capabilities/ingest/scene-detect.ts --in VIDEO [--threshold 0.3] [--fps 60]` | cut list `{timeSec, frame}` | fixed threshold (no adaptive) |
| `vad-cut.py` | silence-trim + filler-flag + last-take dedup | `python capabilities/ingest/vad-cut.py --in MEDIA [--captions C.json] [--out O.mp4] [--lang en\|da] [--dedup]` | trimmed mp4 (if `--out`); filler/dup **metadata** | filler/dedup are **report-only** (silence is the only auto-cut); uses ffmpeg `silencedetect`, not Silero; filler lists per-language (en default, da shipped) |
| `beat-detect.py` | librosa BPM + beat/downbeat frames | `python capabilities/ingest/beat-detect.py --in A/V [--fps 60] [--beats-per-bar 4]` | `{bpm, beat_frames[], downbeat_frames[]}` | downbeats = every Nth beat (no dedicated model); render-tier test only |

---

## 3. `audio/` — real mastering, loudness, mix/duck ✅ (needs the optional venv)

| File | Purpose | Invoke | Notes / limits |
|---|---|---|---|
| `master.py` | Pedalboard **creative** chain (HPF → gate → de-mud → compress → presence → de-ess → reverb → makeup → optional VST3 → safety limiter) | `python capabilities/audio/master.py --in I.wav --out O.wav [--profile course-mic-lift\|studio\|voice\|music-bed] [--vst PATH --vst-param k=v]` | **Does NOT set the −14 LUFS ceiling** (run `loudness.py` after). VST3 only. Streams in 0.5 s blocks. |
| `loudness.py` | **True-peak finalize** to −14 LUFS / −1 dBTP (two-pass ffmpeg loudnorm + pyloudnorm verify) | `python capabilities/audio/loudness.py --in I.wav [--out O.wav] [--target -14] [--tp -1] [--measure-only]` | The authoritative loudness ceiling (Pedalboard's limiter is **not** true-peak). |
| `mix.py` | Multi-stem mixer with **sidechain duck** (music under VO) + fades → −14 LUFS | `python capabilities/audio/mix.py --vo VO.wav [--music M.wav] [--sfx S.wav@2.5 ...] --out O.wav [--duck-ratio 4] [--music-gain -6]` | VO-keyed duck only (SFX doesn't trigger). Reuses `loudness.py` to finalize. |
| `run-mastering.ts` | Orchestrates `master.py` → `loudness.py` in **isolated subprocesses** (VST crash safety) | `tsx capabilities/audio/run-mastering.ts --in I.wav --out O.wav [--profile ...]` | One VST per run; writes intermediate wav to disk. |

**Profiles:** `course-mic-lift` (aggressive lift for thin mic recordings), `studio` (gentle 2-person),
`voice` (generic VO, default), `music-bed` (minimal).

---

## 4. `color/` — grading + correction ✅

| File | Purpose | Invoke | Limits |
|---|---|---|---|
| `grade.ts` | Apply a **look LUT** via ffmpeg `lut3d` (fast, GPU-friendly) | `tsx capabilities/color/grade.ts --in I.mp4 --out O.mp4 --lut warm-cine [--intensity 1.0]` | can only **apply** `.cube`, not create. Windows `:` path footgun handled via `cwd`. |
| `correct.ts` | Technical **correction** (WB/exposure/contrast/sat/gamma + shadow/highlight RGB) | `tsx capabilities/color/correct.ts --in I.mp4 --out O.mp4 [--temperature 6500] [--brightness] [--contrast] [--saturation] [--gamma] [--shadows-r/-b --highlights-r/-b]` | global only (no per-region) |
| `grade.py` | LUT apply via `colour-science` (stills + slow per-frame video, fallback) | `python capabilities/color/grade.py --in I --out O --lut warm-cine [--intensity]` | video path ~1 fps; use `grade.ts` for scale |

**House LUTs (size-33, reproducible, no license):** `neutral-correct`, `warm-cine`, `teal-orange`,
`film-kodak2383`. External `.cube` of any size also works.

---

## 5. `assemble/` — typed ffmpeg argv ops ✅

`ffmpeg-ops.ts` exposes **14 typed ops** (argv arrays, no shell strings; each returns
`{success, op, returncode, outputPath, durationS, stderr}`):

`trim` · `concat` · `crossfade` (xfade+acrossfade, normalizes fps/SAR/pixfmt/timebase first) · `overlay` ·
`mux` · `replaceAudio` · `burnSubtitles` · `applyLut` · `applyHaldClut` · `normalizeLoudness` (single-pass) ·
`extractFrames` · `thumbnailGrid` · `drawtext` · `chromakey`.

`pipeline.ts` → `pipeline(initialInput, steps[], project, stage='assemble')` runs ops **sequentially**, stops
at first failure, writes each step to `out/work/<project>/<stage>/NN-<name>.<ext>`, logs provenance.
**Limits:** linear only (no branching/conditionals); optional `-hwaccel cuda` decode.

---

## 6. `perception/` — the agent's eyes & cut judgment ✅

| File | Purpose | Invoke | Output |
|---|---|---|---|
| `gemini-client.ts` | Shared Files-API helper (upload **once**, reuse across prompts) | library | `uploadAndWait`, `askJson`, `visualCortexModel`, `parseJsonLoose` |
| `gemini-council.ts` | **7-specialist panel** (each must cite `MM:SS.s` + frame-region; bare "looks great" rejected) | `tsx capabilities/perception/gemini-council.ts --in V [--context "..."] [--fps 3] [--resolution high] [--only detail,transition] [--screencast] [--lang en\|da]` | `${PREFIX}.json` with `aggregateVerdict ship\|fix\|incomplete` |
| `reference-analyze.ts` | **Mimic-this-video** deconstruction: objective signals (ASL, palette, LUFS) + **9-specialist** reference roster | `tsx capabilities/perception/reference-analyze.ts --in REF.mp4 [--signals-only]` | `style-spec.json` + `.md` |
| `gemini-video-review.ts` | Gemini "eyes" — timestamped visual describe (`--mode describe`, scene or per-second granularity) or QA pass (`--mode qa`) | `tsx capabilities/perception/gemini-video-review.ts VIDEO [--mode describe\|qa] [--granularity scene\|second] [--transcript C.json] [--context "…"] [--lang en\|da]` | `<prefix>.json` + `.md` |
| `cut-doctor.ts` | Whisper-grounded frame-accurate cut surgery (mid-word / mid-sentence / dangling-clause detection + surgical fix points) | `tsx capabilities/perception/cut-doctor.ts VIDEO [--transcript C.json] [--no-gemini]` | `<prefix>.cuts.json` + `.md` |

**Council specialists:** `detail` (artifacts), `transition` (cut rhythm), `story` (B-roll↔VO match), `brand`
(**reads YOUR `brand/brand.json`** — colors, tone, sell style + the 480 px safe-zone), `composition`, `avsync`, `color`. **+`screencast`**
sub-lens (cursor/secrets/chrome) auto-added on `--screencast` or a screencast/tutorial/demo context.
**+`reel-segment`** sub-lens (hook·flow·value·trend reel-clip nomination) auto-added on
`--reel-segments` or a "reels / best clips" context — feeds `export-premiere-xml`.
**Reference roster (9):** tempo, cuts, color, type, overlays, motion, sound, hook, composition.
**Hard rule:** the visual cortex over-reads — objective meters always win; ground its verdicts in stills/RMS.

---

## 7. `generate/` — ElevenLabs audio + thumbnails ✅

| File | Purpose | Invoke | Limits |
|---|---|---|---|
| `elevenlabs-tts.ts` | VO in YOUR brand voice | `tsx capabilities/generate/elevenlabs-tts.ts <text\|@file.txt> out.mp3 [--voice] [--model] [--v3] [--lang en] [--stability] [--similarity] [--style] [--speed] [--seed] [--list-voices]` | needs `ELEVENLABS_API_KEY`; default voice from `brand/brand.json` → `voice.elevenlabsVoiceId`; spends credits; **no caption, no loudnorm** (do those downstream) |
| `elevenlabs-music.ts` | Instrumental BGM | `tsx capabilities/generate/elevenlabs-music.ts <prompt\|@file> out.mp3 [--seconds 30] [--vocals] [--plan] [--seed]` | seed only on `--plan`; can't name real artists/songs; instrumental by default |
| `elevenlabs-sfx.ts` | Realistic SFX | `tsx capabilities/generate/elevenlabs-sfx.ts <text\|@file> out.mp3 [--seconds] [--influence 0.3] [--loop]` | `--loop` v2 only; manual volume placement |
| `thumbnail.ts` ✅ | **Video thumbnail:** frame screenshot + prompt → polished thumbnail via OpenAI `gpt-image-2-2026-04-21` (`images/edits`), in the **video's aspect ratio**, written **next to the video** as `<video_name> thumbnail.png` (+`.jpg` sibling when PNG >2 MB) | `tsx capabilities/generate/thumbnail.ts --video V.mp4 --prompt "<CHANGE block>" [--at 75\|1:15] [--aspect 3:4] [--n 1-4] [--quality low\|medium\|high] [--format png\|jpg] [--headline "TXT"] [--raw] [--moderation low] [--project] [--dry-run]` | needs `OPENAI_API_KEY`; ~$0.01-0.21/img + input tokens; **NEVER send `input_fidelity`** (gpt-image-2 rejects it — face preservation is automatic); non-ASCII glyphs garble in-model → overlay text in Remotion; model pinned via `models.json` `image.thumbnail` (env `OPENAI_IMAGE_MODEL`) |

**Thumbnail craft + prompting rules of record:** [`generate/THUMBNAIL-GUIDE.md`](capabilities/generate/THUMBNAIL-GUIDE.md)
(Change+Preserve scaffold, frame selection, 3-element/stamp-test CTR checklist, archetypes
Authority · Before/After · Diagram-Tease, platform facts — LinkedIn thumb MUST match the video's aspect; Shorts
swipe-feed ignores custom thumbs).

---

## 8. `acquire/` — bring the outside world in ✅

| File | Purpose | Invoke | Limits |
|---|---|---|---|
| `fetch-url.ts` | page → readable **Markdown** + media URLs + provenance (pure regex, no deps) | `tsx capabilities/acquire/fetch-url.ts --url URL [--project] [--out]` | **no JS rendering** (escalate to agent `WebFetch`); no deep crawl |
| `download-media.py` | **yt-dlp** video/audio + subs + thumb + `.info.json`, merged via full ffmpeg | `python capabilities/acquire/download-media.py --url URL --project N [--audio-only] [--format] [--subs en,..] [--cookies] [--dry-run]` | network-dependent; keeps media (lands in `test-video/<project>/refs/`); yt-dlp loosely pinned; needs the optional venv |
| `download-asset.ts` | direct binary fetch (img/video/audio/font/LUT) + sha256 + size guard | `tsx capabilities/acquire/download-asset.ts --url URL --project N [--ship] [--out] [--max-mb 200]` | single file; in-memory; 200 MB default cap; `--ship` → `public/<project>/refs/` else gitignored |
| `provenance.ts` | append-only `provenance.json` per project | library | append-only, no concurrency lock |

---

## 9. `screen-record/` — autonomous browser capture → clean 30 fps ✅ 🟡

The agent **drives the browser itself** and produces a finished screencast. Two stages:
**(1) EXPLORE/AUTHOR** via Playwright MCP (a11y-tree) with an **approval gate** →
**(2) DETERMINISTIC RECORD** via `record-session.ts` (no MCP in the loop). On-demand: `npm i -D playwright && npx playwright install chromium`.

### `record-session.ts` — CLI flags
`--plan PLAN.json` (req) · `--project` (req) · `--out` · `--fps 30` · `--width` · `--height` · `--dscf` ·
`--encoder libx264|h264_nvenc` · `--storage-state auth.json` · `--minterpolate` · `--no-cursor` ·
**`--capture screencast|screenshot|gdigrab`**.

### `actions.ts` — the RecordAction union (13 types)
`navigate{url,waitUntil}` · `click{selector,optional?,timeoutMs?}` · `clickAt{x,y}` · `moveTo{x,y,dwellMs?}` ·
`type{selector,text}` · `press{key}` · `hover{selector}` · `scroll{deltaY}` ·
`waitFor{selector?,state?}` · `wait{ms}` · `chapter{title,subtitle?,durationMs?}` ·
`caption{text,subtitle?,durationMs?}` · `clearCaption`.

### The three capture modes — when each works (the crux)
| Mode | Mechanism | Works | Fails |
|---|---|---|---|
| **`screencast`** (default) | `page.screencast({onFrame})` JPEG → ffmpeg stdin | clean sandboxed recording **on a real display** | **off-display compositor throttling**: in agent/headless sessions the compositor only commits on big damage (nav/scroll) → ~2–6 fps frozen frames, **pure cursor motion not captured** |
| **`screenshot`** (robust) | clock-paced `page.screenshot()` loop forces a paint per frame → image2pipe | **everywhere** — the reliable path for cursor-heavy demos in an agent env (~25–30 fps → CFR-30) | higher CPU per frame |
| **`gdigrab`** (literal desktop, Windows-only) | ffmpeg `gdigrab` of the window (true CFR + audio + real cursor) | only when the window is on the **capturable** desktop | **can't see the off-display Playwright Chrome**; films the ENTIRE screen → **security surface** |

> **Learned live:** cursor-heavy demos need `--capture screenshot`. Also: the visible cursor is the injected
> `assets/cursor-overlay.js` overlay (Playwright synthetic input does **not** move the OS cursor); the overlay
> must lazily `ensure()` its node + keep-alive interval because a `document_start` append to `<html>` gets
> wiped by the parser. **Never ship the MCP/`recordVideo` WebM** (VP8 1 Mbit, VFR, no audio, broken flag).

### Supporting files
- `encode.ts` ✅ — pure ffmpeg-argv builders (image2pipe uses `-use_wallclock_as_timestamps 1` + `fps=30`;
  JPEG range fix `scale=in_range=pc:out_range=tv`) + `spawnLivePipeEncoder`/`runEncode`/`buildConcatManifest`.
- `pacing.ts` ✅ — `DEFAULT_PACING`: afterLoad 400 / preClick 500 / postClick 800 / moveSteps 28 /
  typeDelay 80 / read 2500 / scrollDelta 70 / scrollTick 40 / chapter 2000 ms.
- `guards.ts` ✅ — `assertSafeOutputPath` (out/ ∣ test-video/ ∣ public/ only), `determinismInitScript`,
  `stealthInitScript` (real SERPs), `framePumpInitScript`, `titleLockInitScript`, `redactAuthRef`.
- `cdp-screencast.ts` ✅ — FALLBACK B (raw CDP `startScreencast` + frame ACK + timestamp concat).
- `gdigrab.ps1` ✅ — FALLBACK A (Windows-only, path-guarded desktop capture).
- `verify-screencast.ts` ✅ — technical meters: CFR, frame-count ±1, resolution, `yuv420p`, non-frozen.

### Security hard rules
Prefer sandboxed capture when secrets risk exists · never record a real signed-in account (`--isolated` +
secret `auth.json`) · never type real credentials on-camera · outputs path-guarded to gitignored dirs.

---

## 10. `motion/` — deterministic Remotion VFX (docs) ✅

The **default, free, code-it** VFX layer. All motion **must be frame-driven** by `useCurrentFrame()`.

- `DETERMINISTIC-VFX-CHEATSHEET.md` — the decision tree: **code it in Remotion first** (interpolate/
  spring → GSAP timeline → @remotion/* → Three/Skia/GLSL) → only if organic & uncodeable, generate **just**
  that element on black and composite → fully-generative plate is the last resort.
- `GSAP-IN-REMOTION.md` — the hard rule: GSAP timelines are `paused:true` and **seeked to `frame/fps`** every
  frame; never `.play()`. ✅ Tweens, Timeline, CustomEase, SplitText, DrawSVG, MorphSVG, MotionPath.
  ❌ ScrollTrigger, Draggable, Observer (no scroll/pointer at render). Free since the Webflow acquisition.
- **NOT supported (won't render):** Framer Motion, react-spring, Reanimated, Tailwind `animate-*`,
  CSS `transition`, un-seeded GSAP.

The reusable atoms themselves live in `src/components/motion/` — see §13.

---

## 11. `vfx/` — paid AI-VFX layer ✅ 🟡 (needs API keys to actually generate)

**Policy:** deterministic Remotion-native **first**; paid cloud generation only when organic & uncodeable;
**Runway / Veo / Seedance ONLY** (no Kling/Pika/Luma/Sora, no local models).

### `generate/` — the paid router + wrappers
- `route.ts` ✅ — **pure** router → `RoutingDecision` + fallback chain:
  1. **v2v relight/restyle** → Runway **Aleph** (no fallback).
  2. **identity-locked face** → **Veo 3.1** (NEVER Seedance — hard rule) → Seedance 1.5 Pro → Gen-4.5.
  3. **mood/textural on black bg** → **Seedance 2.0** (cheapest) → Veo Fast → Gen-4 Turbo.
  4. **rapid iteration** → Runway **Gen-4 Turbo** → Veo Fast → Seedance 2.0.
  5. **default realistic plate** → **Veo 3.1** → Veo Fast → Gen-4.5.
- `runway.ts` ✅ 🟡 — Gen-4.5 / Gen-4 Turbo / Aleph. `RUNWAY_API_SECRET`. I2V strips visual descriptors
  (motion-only); **seed is the only deterministic knob**. `--dry-run` safe. `--budget-cap USD`.
- `veo.ts` ✅ 🟡 — Veo 3.1 (std/fast). `GEMINI_API_KEY` (billing). Negative-prompt defaults, timestamp
  prompting `[MM:SS-MM:SS]`, Extend (~140 s), audio. **Seed-less** cache key.
- `seedance.ts` ✅ 🟡 — via fal.ai (`FAL_KEY`). `cameraFixed:false` REQUIRED for motion; **refuses
  `identityLocked` (face block)**; multimodal `@Image/@Video/@Audio` refs. Seed-less.
- `cost.ts` / `cache.ts` / `sanitize.ts` / `types.ts` ✅ — cost claim (Runway 1 cr≈$0.025), **seed-aware**
  cache key (Runway includes seed; Veo/Seedance don't), prompt sanitization (negative defaults + YOUR
  `brand/brand.json` `brandWords[]` stripped before Seedance), shared shapes.
- `templates/*.md` — prompt templates: identity-multishot, 9:16 vertical establishing plate, mood-texture black-bg,
  talking-head cutaway, v2v relight.

### `color-match/` ✅ — `match.ts` wraps Python `transfer.py`: **Reinhard LAB** transfer (CPU, not ML) so a
generated clip sits in the base plate's grade. `--ema`, `--alpha-passthrough`.

### `compositor/` ✅ — `scene.ts` (Zod `vfxCompositeSceneSchema`) + `composite.ts` pure-ffmpeg fallback
(base → screen-blend → chromakey overlay → alpha overlay) for one-off composites without a Remotion render.

---

## 12. `3d/` — headless Blender 🧭 (NOT installed)

Planned only (lowest leverage / highest friction). **Two-stage when built:** (1) author the
`.blend` interactively via `ahujasid/blender-mcp` on Claude Desktop → (2) render headless
`blender -b -P render-shot.py` to **PNG-RGBA 16-bit sequence** (never `.mp4`), composite as a Remotion
alpha overlay. Cycles+OPTIX is the deterministic engine (EEVEE-Next is interactive-only headless on Windows).
Use the real Blender binary, not the `bpy` PyPI wheel. Format anchors only: title cards, logo stings,
product mockups, parallax UI planes.

---

## 13. `orchestrate/` — the spine ✅

| File | Purpose | Key surface |
|---|---|---|
| `manifest.schema.ts` | Zod contract | **STAGE_NAMES** = `acquire, screen-record, ingest, audio, color, motion, 3d, vfx, generate, assemble, deliver`. Stage lifecycle `pending→running→complete\|failed\|blocked` (**complete is terminal**). |
| `manifest.ts` | atomic read/update + transitions | `createManifest`, `startStage`, `completeStage` (forks **v{K+1}** on a new `params_hash` — approved v1 never overwritten), `failStage`, `approveStage`, `approveVersion`, `rollupStatus`. Lives git-tracked at `projects/<project>/` (override `VIBE_PROJECTS_DIR`). |
| `provenance.ts` | durable NDJSON audit trail | `logProvenance` / `readProvenance`; two logs (disposable per-run + durable git-tracked). |
| `verify.ts` | **SPLIT verifier / delivery gate** | `tsx capabilities/orchestrate/verify.ts --in V [--fps] [--target-lufs -14] [--target-tp -1] [--captions] [--context] [--eyes\|--no-eyes] [--screencast]`. **Technical gate (authoritative):** frame-count ±1, loudness ±1 LUFS / TP≤+0.5, not-black (luma≥6), caption gaps, screencast meters. **Taste gate (advisory):** Gemini council. **Objective always wins; council `ship` never overrides a failed meter; taste-only blocker → escalate to human.** Verdict: `ship\|fix\|rework\|escalate`. |
| `proxy.ts` | proxy-first draft | `makeProxy` → 480p **keeping source fps** (xfade timing stays valid). |
| `budget-guard.ts` | cost + cache controls | `APIBudgetGuard` (`maxCostUsd`/`maxRpm`, persisted ledger) + `GenerationCache` (sha256 → output path). |

**Plan-gate convention (the manifest has no `plan` stage).** The conceptual "Plan gate"
from the cockpit is expressed on the existing schema, not a new stage: the
router parks the human-readable plan / scene table in the manifest **`notes`** (markdown) and sets
**`inputs.plan_gate_stage`** to the gated `StageName` it will block on (**default `motion`**). The UI
renders `notes` at the "Plan" position and its Approve calls `approveStage(inputs.plan_gate_stage)`.
The agent persona (`.claude/agents/vibe-studio.md`) follows this so the GUI and the agent agree on
which blocked stage represents "the plan is waiting for sign-off."

**Cockpit sidecar conventions (creation modes · brief · upload).** Three durable,
ui-adjacent files live beside the manifest under `projects/<project>/`:

- **`brief.md`** — the human-readable USER BRIEF (distinct from `notes`, which stays the agent's
  PLAN). Written by the UI's create route (both modes: the wizard composes it from the inputs;
  agent mode writes a stub), edited by the user (Brief tab, optimistic-sha PUT) and by the agent
  (ordinary `Write`; re-read before rewriting). `inputs.mode === 'agent'` marks an agent-mode
  project: `inputs` carries only `{mode, lang, plan_gate_stage}` — the brief comes from the chat.
- **`asset-meta.json`** — `{ overrides: { "<relPath>": "<category>" } }`, the ui-server-owned
  category-override sidecar (NOT provenance; capabilities never write it). Asset categories are
  filename-derived (`vo-*`→vo, `bgm-*`→music, `sfx-*`→sfx, other audio → the `audio` fallback);
  the override wins after the filename pass.
- **Uploads** — the UI streams user files into `public/<project>/` (sanitized lowercase-kebab,
  non-ASCII transliterated, `-2`/`-3` suffix on collision, never overwritten) and runs NOTHING
  automatically: no probe, no transcribe, no proxy, no provenance entry. Capability runs stay the
  only provenance writers.

---

## 14. `src/components/motion/` — reusable Remotion atoms ✅

All exported from `index.ts`; styles compose by **name + props**. All frame-driven.

| Atom | What | Key props |
|---|---|---|
| `CountUp` | integer counter | `to`, `from`, `durationInFrames`, `locale` (default 'en-US'), `prefix/suffix` |
| `FadeInOut` | opacity envelope (+ optional slide) | `inStart/inDuration`, `outStart/outDuration`, `translateY` |
| `PopText` | spring scale-pop text (brand defaults) | `text`, `delay`, `fontSize`, `stroke` |
| `Wiggle` | deterministic sine wiggle | `frequency`, `amplitude`, `axis` |
| `CTAButton` | branded pill CTA + bobbing arrow | `text`, `arrow` ('down'/'right'/'none'), `delay` |
| `LowerThird` | talking-head banner (ribbon + slide-in) | `title`, `subtitle`, `bottom`, `left`, `accent` |
| `LogoSting` | full-bleed brand lockup | `title`, `tagline`, `delay`, `background` |
| `SafeZone` | visualizer **and** constraint container | `safeRegion`, `show`, defaults: 9:16 = minus bottom 480 px; 16:9/1:1 = right-rail |
| `SceneClip` | B-roll/scene wrapper for delivery presets | `background` ('transparent'/'green-key-friendly'/'opaque'), `palette` (req for green-key), `safeRegion` |
| `TransitionScenes` | wrapper over `@remotion/transitions` | `scenes[]` (fade/slide/wipe), springTiming default |
| `GsapSplitText` | per-char/word reveal | `text`, `split`, `staggerSec`, `delaySec` |
| `useGsapTimeline` / `useGsapTimelineProgress` | frame-seeked GSAP hooks | `(build, scope) → ref`; progress variant stretches 0→1 over comp |
| `VFXComposite` / `VFXImageOverlay` | the compositor template (base → screen-blend → alpha → chromakey → title) | `base` (req), `screenBlend`, `alphaOverlay`, `chromakeyOverlay`, `title` |
| `greenKeyGuard` | palette validator | bans any color within ±25 % of `#00FF00` |

---

## 15. `deliver/` — final encode, loudness, variants ✅

| File | Purpose | Invoke |
|---|---|---|
| `render-preset.ts` | named render presets → Remotion argv | `tsx capabilities/deliver/render-preset.ts --preset P --comp CompId [--out] [--props F] [--dry-run]` |
| `loudnorm.ts` | single-pass −14 LUFS / −1 dBTP on a finished mp4 (video copied, audio AAC 192k, +faststart) | `tsx capabilities/deliver/loudnorm.ts --in I.mp4 [--out] [--i -14] [--tp -1] [--lra 11]` |
| `make-proxy.ts` | 720p analysis proxy (CRF 28, veryfast) | `tsx capabilities/deliver/make-proxy.ts --in I.mp4 --out P.mp4 [--height 720] [--crf 28]` |
| `check-disk-space.ts` | pre-render disk guard (exit 1 if low) | `tsx capabilities/deliver/check-disk-space.ts [--path out] [--min-gb 5]` |
| `export-premiere-xml.ts` | `segments.json` → **FCP7 XML (XMEML)** Premiere timeline w/ clips + range markers (+ CSV) | `tsx capabilities/deliver/export-premiere-xml.ts --in SRC --segments SEG.json --project N [--out] [--name] [--layout both\|assembly\|annotate]` |
| `export-davinci-edl.ts` | `segments.json` → **CMX3600 EDL** DaVinci timeline w/ clips + `* LOC:` color point markers | `tsx capabilities/deliver/export-davinci-edl.ts --in SRC --segments SEG.json --project N [--out] [--name] [--start-tc 01:00:00:00] [--layout annotate\|assembly]` |

**Render presets (10):** `vertical-ad`, `square-ad`, `portrait-feed`, `reel-60fps` (all 9:16/1:1 h264 CRF 18) ·
`youtube-1080` (1920×1080, AAC 192k, conc 8) · `youtube-4k` (`--scale=2`, CRF 16, conc 8) ·
`transparent-overlay` (ProRes 4444, `yuva444p10le`, `.mov`) · `scene-clip` (1080p opaque CRF 17) ·
`scene-clip-alpha` (ProRes 4444 `.mov`) · `scene-clip-greenkey` (CRF 15 on flat `#00FF00`).
**Limit:** single render per call (variant fan-out is per-call); fps locked at the composition.

### `export-premiere-xml` — NLE hand-off

The **AI-found best sequences → human Premiere/DaVinci finish** bridge. Deterministic, dependency-free
(`tsx` + the ffprobe resolver), **no API spend**. Consumes a `segments.json`
(`{startMs, endMs, name, comment?, color?}[]`, times in **ms** matching Whisper/scene-detect; optional
`source` block else auto-probed); emits **FCP7 XML (XMEML)** — the only format modern Premiere imports
**natively** carrying both timeline clips AND markers — plus a `.csv` sibling.

- **`--layout both`** (default): each segment is a `<clipitem>` laid end-to-end on V1 (+A1 if audio) **and**
  a sequence-level **range marker** at the timeline position (comment carries the source TC). `assembly` =
  clips only; `annotate` = one full-length clip + markers at the **original source** positions.
- **8 marker colors:** green (default) · red · orange · yellow · white · blue · cyan · magenta. *Honest
  caveat:* Premiere's FCP6-level importer **may drop marker color** (DaVinci honors it) — the range span is
  reliable, the color is not.
- **Frame math:** `round(ms/1000 × fpsExact)` at the exact rational rate (NTSC = `fps×1000/1001`); `<timebase>`
  = rounded int + `<ntsc>`; sequence timecode pinned to **frame 0 / NDF** (the 01:00:00:00-offset guard).
  `<pathurl>` = `file://localhost/…` absolute + URL-encoded, declared **once**. **The "find N best sequences"
  front-end is NOT a new engine** — the router composes Whisper + the `gemini-council --reel-segments` lens
  into the JSON (see the `video-editor` skill's best-segments-selection reference).
- **Output:** `out/work/<project>/deliver/<slug>.premiere.xml` + `.csv`; re-export with changed segments
  **auto-forks `-v2`**. **Limit:** single source file per export; OTIO/FCPXML are the noted (not
  adopted) alternatives.

### `export-davinci-edl` — DaVinci Resolve hand-off

Same `segments.json`, for **DaVinci Resolve**. Emits a **CMX3600 EDL** — the only native, file-based,
dependency-free Resolve import where marker **color** survives (via `* LOC:` lines) and clips import.
**Key fact:** our Premiere FCP7 XML imports *clips* into Resolve but **drops its markers + color**, so the EDL
is genuinely needed (not a reuse). Reuses the XML exporter's pure helpers + the identical segments contract.

- **`--layout annotate`** (default): one full-length event + one `* LOC:` marker per segment (the documented
  "import markers/comments into Resolve" pattern — best for marking up a video). `assembly`: one contiguous
  clip-event per segment + one marker each.
- **Two-step import:** (1) `File ▸ Import Timeline` (clips; media must be in the Media Pool); (2) right-click
  timeline ▸ **Timelines ▸ Import ▸ Timeline Markers from EDL** (same `.edl`); (3) set the timeline Starting
  Timecode = `--start-tc` (default `01:00:00:00`) or markers offset by an hour. Resolve 18/19/20.
- **EDL limits (honest):** point markers only (range→in-point), single V track, ≤999 events (throws past),
  **ASCII-only** (ø/æ/å→o/ae/aa auto-fold), 8-color set (`orange`→`YELLOW`, unknown→`RED`), no per-marker note field
  (idea+description fold into the locator label). FCPXML 1.9 (notes/range, no color) + shared-helpers
  refactor = a noted follow-on; DaVinciResolveScript `AddMarker` = the richest but needs Resolve running.
  **Output:** `out/work/<project>/deliver/<slug>.davinci.edl`.

---

## 16. Tests & verification

- **`npm test`** → `tsx capabilities/_tests/run.ts` — the fast suite across 21 files (foundations,
  contract, every capability engine, orchestration, templates, VFX).
  **No API budget spent** — media synthesized with ffmpeg; paid paths exercised via offline structure + dry-run.
- **`npm run test:render`** → adds the demo-comp still render + librosa beat-detect.
- **`npm run lint`** → strict `tsc` (`noUnusedLocals`). Bespoke harness
  (`harness.ts`: `test/assert/assertEqual/assertIncludes/assertThrows/runAll`).

---

## 17. Cross-cutting hard rules (the easy-to-miss ones)

1. **STT = OpenAI `whisper-1` only.** No local/faster-whisper, ever.
2. **Visual cortex = `gemini-3.1-flash-lite`.** Never Gemini 2.5. It over-reads — ground its verdicts in
   stills/RMS, objective meters win.
3. **Master to −14 LUFS / −1 dBTP** before delivery.
4. **9:16:** keep captions/CTA out of the **bottom 480 px**.
5. **Frame-driven motion only** (`useCurrentFrame`); GSAP must be a `paused` timeline seeked to `frame/fps`.
6. **`<OffthreadVideo>`** (not `<Video>`) for MP4; `objectFit:'cover'` to crop.
7. **Probe before importing**; drive every duration from `useVideoConfig().fps`; set `durationInFrames` from
   the real probed duration.
8. **Full ffmpeg via the shared resolver** (`VIBE_FFMPEG` → `.vibe/bin` → PATH; Windows `lut3d` `:` path
   footgun → escape drive or use `cwd`). Remotion's internal renderer uses its own bundled ffmpeg — fine.
9. **Generative video = paid cloud only** (Runway/Veo/Seedance); apply the deterministic-Remotion-first
   hierarchy before reaching for it. Seedance blocks realistic faces → Veo. Only Runway exposes a `seed`.
10. **Copy follows YOUR brand tone** (`brand/brand.json` → `tone.sellStyle`) — the council's brand
    specialist enforces it.
11. **Project-first folders:** `public/<project>/`, `src/<project>/`, `test-video/<project>/`. `out/` is
    disposable; media gitignored, captions/JSON tracked.
12. **Revisions auto-fork to v{K+1}** — never overwrite an approved version.

---

*Keep this file honest. When you build, alias, or retire a capability — or learn a new limit the hard way —
edit the matching row here in the same change.*
