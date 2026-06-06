# `acquire/` — bring the outside world IN (web + media)

**Status: BUILT** — tested in `_tests/p1f-acquire.test.ts` (`gallery-dl` on-demand). Given a **URL + instruction** ("grab the text/images/video
from here and use it") or a **"make it like / inspired by this video"** brief, this capability
**downloads external text and media into the project** — with provenance — so compositions can
`staticFile()` them and `perception/reference-analyze` can deconstruct them.

> `ingest/` analyses files **already in the project**. `acquire/` is the one that reaches **out to
> the internet**. The agent's own `WebFetch`/`WebSearch` tools are for quick ad-hoc reads; these
> scripts **persist bytes into the project with provenance** so a build is reproducible.

This uses the proven **`yt-dlp`** engine pattern — but where typical ingest pipelines write
summaries and delete the media, **we keep the media and emit editing-ready outputs.**

| File | Purpose |
|---|---|
| `fetch-url.ts` ✅ | Page → readable **text** (Markdown: title, body, enumerated media URLs resolved vs base). Node `fetch` + pure `htmlToMarkdown()`; **escalate to the agent's `WebFetch`** for JS-heavy/blocked pages. → `out/work/<project>/acquire/<slug>.md` + provenance. |
| `download-media.py` ✅ | **`yt-dlp`** (venv): video/audio + subs + thumbnail + `*.info.json`; **merges with the full ffmpeg** via `ffmpeg_location`; `--cookies`, `--audio-only`, `--dry-run`. → `test-video/<project>/refs/` + provenance. |
| `download-asset.ts` ✅ | Direct binary fetch (image/video/audio/font/LUT); sha256 + content-type→ext fallback + `--max-mb`. → `public/<project>/refs/` (`--ship`) or `test-video/<project>/refs/`. |
| `provenance.ts` ✅ | `provenance.json` array — `{sourceUrl, title, author, fetchedAt, sha256, bytes, tool}`; TS + Python acquire both append here. Feeds the manifest. |
| `gallery-dl` (opt, on-demand) | Set/board/profile scrapes (moodboards). |

## Dependencies
- **`yt-dlp`** in the OPTIONAL shared `capabilities/.venv` — **loosely pinned (`>=`)**, the ONE dep we don't
  hard-pin (sites change weekly; it must update freely). Needs the full ffmpeg (shared resolver) to merge streams.
- Node built-in `fetch` for pages/assets (no extra dep); agent `WebFetch` as the hard-page fallback.
