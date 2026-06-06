# `assemble/` — typed FFmpeg op layer

Borrows `mcp-video`'s *pattern* (typed ops, argv-safety, `pipeline()`, structured JSON) **without the
dependency**. Every op builds an **argv array** (never a shell string), validates paths, runs the full
FFmpeg, and returns `{ success, returncode, stderr, outputPath, durationS }`.
**Status: BUILT (P1D, 2026-05-27)** — tested in `_tests/p1d-assemble.test.ts`.

| File | Purpose | Backs |
|---|---|---|
| `ffmpeg-ops.ts` ✅ | Typed `trim`, `concat`, `crossfade`, `overlay`, `mux`, `replaceAudio`, `burnSubtitles`, `applyLut`, `applyHaldClut`, `normalizeLoudness`, `extractFrames`, `thumbnailGrid`, `drawtext`, `chromakey` + optional `-hwaccel cuda`. | P1D.1; GAP-29/30 |
| `pipeline.ts` ✅ | `pipeline()` — array of ops → sequential idempotent execution into `out/work/<project>/<stage>/`, with provenance. | P1D.2 |

**Footguns enforced (GAP-29):** every `trim` appends `setpts=PTS-STARTPTS`/`asetpts`;
`xfade`/`crossfade` assert + normalize matching fps/SAR/pixfmt/**timebase** (`settb`); `concat` demuxer
requires uniform codecs. *(AN §3.5; DR "typed FFmpeg MCP"; T4 §1.)*
