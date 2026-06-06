# `_env/` — environment, resolvers, preflight

Shared environment plumbing every other capability depends on. No video logic.

| File | Purpose | Status |
|---|---|---|
| `models.json` | **Single source of truth for every model ID** (active + planned). Change a model in one place. | ✅ done |
| `ffmpeg.ts` | Resolve the full FFmpeg/ffprobe build (`VIBE_FFMPEG` → `.vibe/bin` → PATH) + probe filters/encoders. `--selftest` runs the acceptance ops. | ✅ done |
| `ffmpeg-capabilities.json` | Recorded filter/encoder support of the resolved build (regenerated per machine by `vibe setup --ffmpeg` / the probe CLI). | ✅ done |
| `setup-venv.ts` | Create the OPTIONAL `capabilities/.venv` (Py 3.12 preferred) + install pinned `requirements.txt`, cross-platform. | ✅ done |
| `doctor.ts` | Green/yellow/red preflight: ffmpeg, ffprobe, node, venv imports, Blender, GPU, disk, `.env` keys. `--json` for the UI Health page. | ✅ done |
| `contract.ts` / `contract.py` | The capability result envelope + work-dir/provenance/model-registry helpers (TS + Python mirrors). | ✅ done |

**I/O contract:** resolvers return an absolute binary path + a capabilities object; `doctor` prints a
table and exits non-zero on any red.
