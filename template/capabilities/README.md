# `capabilities/` — global shared engines

This is the **global capability layer** of the video agent. Built once, called by
every skill. Skills (`.claude/skills/*`) are thin **styles/templates/approaches** that
*compose* these engines — they hold no duplicated engine logic.

> Two-layer overview: repo `CLAUDE.md` → "Two-layer architecture".
> The canonical inventory with exact CLIs + limits: repo root `CAPABILITIES.md`.

## The tree

| Folder | Engine | Status |
|---|---|---|
| `_env/` | ffmpeg resolver + probe, Python venv setup, `doctor` preflight, **`models.json`** (single model-ID source of truth), **`contract.ts`/`contract.py`** (the result envelope + work-dir + provenance) | **built** |
| `acquire/` | web/URL fetch (readable text + media), **`yt-dlp`** video/social download, direct asset download — bring external text/images/video/fonts **into the project** (provenance-logged) for use or as a reference | **built** |
| `screen-record/` | autonomous browser/computer screen capture: **Playwright MCP** EXPLORE/AUTHOR (a11y-tree, `--codegen`) → deterministic `record-session.ts` (`page.screencast` `onFrame` JPEG → ffmpeg stdin) → **clean constant-30fps H.264**; `gdigrab`/CDP fallbacks; cursor overlay + smooth motion + pacing; sandboxed-vs-desktop security | **built** — browser install on-demand |
| `ingest/` | ffprobe metadata, **OpenAI Whisper STT (`whisper-1`) — the only STT**, scene-detect, VAD/filler/last-take cut, beat-detect | **built** |
| `perception/` | Gemini "eyes" (`gemini-video-review`), `cut-doctor` (Whisper-grounded cut surgery), the Gemini **`gemini-council`** (7-specialist forced-evidence panel), **`reference-analyze`** (microscopic reference deconstruction → `style-spec.json`) | **built** |
| `audio/` | Pedalboard mastering chain (`master.py`), measured loudness + true-peak finalize (`loudness.py`), multi-stem mix + sidechain duck (`mix.py`), isolated wrapper | **built** (needs the optional venv) |
| `color/` | `lut3d` apply (`grade.ts`), house-LUT library, correction-vs-grade split (`correct.ts`), colorimetric stills (`grade.py`); (opt) ICCV reference→LUT | **built** — ML grade on-demand |
| `motion/` | deterministic Remotion VFX docs: the decision tree (`DETERMINISTIC-VFX-CHEATSHEET.md`) + **frame-seeked GSAP** (`GSAP-IN-REMOTION.md`); the atoms live in `src/components/motion/` | **built (docs)** |
| `3d/` | Blender headless shot service (Cycles/OPTIX) | **roadmap** (Blender not installed) |
| `vfx/` | AI VFX (**NO local/free models**): color-match (CPU) + PAID cloud generate (Runway/Veo/Seedance) + compositor; deterministic effects live in `motion/` | **built** — needs API keys to generate |
| `generate/` | ElevenLabs tts / music / sfx (your brand voice via `brand/brand.json`) + gpt-image-2 thumbnails | **built** |
| `assemble/` | typed FFmpeg op layer (`ffmpeg-ops.ts`, argv arrays, validated paths, JSON results) + `pipeline()` | **built** |
| `orchestrate/` | `manifest.json` contract, provenance log, split verifier, proxy, `APIBudgetGuard` + sha256 gen-cache | **built** |
| `deliver/` | render presets, loudnorm delivery, proxy, disk-guard, NLE exports (Premiere XML + DaVinci EDL) | **built** |

## The capability contract

Every capability is a small CLI that:
- resolves ffmpeg via `_env/ffmpeg` (the full provisioned build, never Remotion's restricted bundled one);
- reads any model ID from **`_env/models.json`** (never hardcodes);
- validates and never overwrites its inputs; writes to `out/work/<project>/<stage>/`;
- emits a structured JSON result envelope (`{ success, outputs[], metrics{}, ... }`) and appends to the project `provenance.log`.

## Runtime decision

`.ts` capabilities run via **`tsx`, pinned as a repo devDependency** (not `npx tsx`, which fetches
on every run and fails offline). Python capabilities run from the OPTIONAL **`capabilities/.venv`**
(see `_env/setup-venv.ts`).

## Platform constraints (baked in)

- **FFmpeg**: a FULL build resolved via `_env/ffmpeg.ts` (`VIBE_FFMPEG` → `.vibe/bin` → PATH; provision
  with `vibe setup --ffmpeg`). Verified to carry every filter/encoder we need — see `_env/ffmpeg-capabilities.json`.
- **`lut3d` colon footgun (Windows)**: prefer relative, drive-letter-free, forward-slash LUT paths (copy the LUT into `color/luts/` and run from there) over the `C\:/` escape.
- **GPU**: optional. Hardware encoders (NVENC/VideoToolbox) are probed and used when present; everything falls back to libx264. There are **no local VFX models** by policy: generative VFX is PAID cloud only (Runway/Veo/Seedance). A GPU matters only for on-demand Blender OPTIX + faster encodes.
- **Blender**: not installed — `3d/` is on-demand. `vfx/` carries **no local/torch models** (paid cloud generate + CPU color-match + Remotion compositor only).

---

## Licensing & secrets notes

- **Pedalboard is GPLv3** (statically links JUCE). Fine for personal use of this pipeline. If you
  ship this pipeline inside a closed-source product, the GPLv3 obligation must be addressed
  (relicense, or swap the mastering DSP). VST3 plugins can crash the host → mastering runs in an
  isolated subprocess.
- **Remotion license**: free for individuals and small teams, but **companies above the Remotion
  Company-License threshold must hold a paid license.** Verify your headcount/eligibility before
  relying on this commercially. See https://remotion.dev/license.
- **FFmpeg codec licensing**: full builds bundle GPL components (x264, x265). Output
  delivery (H.264/AAC) may carry patent-pool obligations depending on distribution scale — standard
  for any video tool; flagged here for completeness.
- **Secrets** live in `.env` (gitignored): `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`.
  Paid generative video adds `RUNWAY_API_SECRET` (Runway) and `FAL_KEY` (Seedance via fal.ai); Veo
  reuses `GEMINI_API_KEY`. (No local/free generators — policy.)
