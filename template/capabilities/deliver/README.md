# `deliver/` — final encode, loudness, variants

The last mile. The `.sh` scripts are ported to `.ts` on the full-ffmpeg resolver + contract envelope.
**Status: BUILT (P1E.3, 2026-05-27)** — smoke-tested via the offline-runnable paths.

| File | Purpose | Backs |
|---|---|---|
| `render-preset.ts` ✅ | Social/format preset→argv map (vertical-ad/square/portrait/youtube-1080/4k/reel/transparent-overlay) + `--dry-run`; local remotion CLI. | P1E.3 |
| `loudnorm.ts` ✅ | `-14 LUFS / -1 dBTP` delivery normalize (video copied), full-ffmpeg. | P1E.3 |
| `make-proxy.ts` ✅ | 720p proxy for Whisper/Gemini analysis. | P1E.3 |
| `check-disk-space.ts` ✅ | Pre-render free-space guard (`fs.statfsSync`). | P1E.3 |
| `export-premiere-xml.ts` ✅ | `segments.json` → **FCP7 XML (XMEML)** Premiere timeline w/ clips + range markers (+ CSV sibling). | P1H / GAP-68/69 |
| `export-davinci-edl.ts` ✅ | `segments.json` → **CMX3600 EDL** DaVinci timeline w/ clips + `* LOC:` color point markers. | P1I / GAP-70/71 |
| variant fan-out | One template → N aspect/length/locale variants via props + preset. | P3.5 |
| `export-otio` (opt, on-demand) | OTIO/DaVinci export + video-only "finish audio in a DAW" mode. | GAP-33 |

**I/O contract:** finished comp → graded/loudnormed deliverable in `out/` then `test-video/<project>/`;
all media gitignored. *(plan P1E.3, P3.5; CLAUDE.md delivery gate.)*

---

## `export-premiere-xml.ts` — the segments-JSON input contract (P1H / GAP-68/69)

Turns a list of timestamped segments into **FCP7 XML (XMEML)** — the only format modern Premiere Pro
imports **natively** carrying both timeline **clips** and **markers**. `File ▸ Import` the `.xml` and each
segment is a clip on V1 **and** a colored range marker ("fra xx:xx til xx:xx er dette xyz"). A `.csv` sibling
(`Timecode In, Timecode Out, Name, Comment, Colour`) is written alongside for editingtools.io / MarkerBox /
spreadsheet review. **Deterministic, dependency-free (`tsx` + the ffprobe resolver), no API spend.**

```bash
tsx capabilities/deliver/export-premiere-xml.ts \
  --in public/<project>/source.mp4 \
  --segments out/work/<project>/highlights/segments.json \
  --project <project> \
  [--out out/work/<project>/deliver/<slug>.premiere.xml] \
  [--name "Reels — bedste sekvenser"] \
  [--layout both|assembly|annotate]      # default: both
```

**The `segments.json` the planner emits (GAP-69 produces it; the exporter consumes it):**

```jsonc
{
  // "source" is OPTIONAL — omit it and the exporter auto-probes --in via ffprobe.
  "source": { "fps": 25, "width": 1920, "height": 1080, "durationFrames": 15000, "hasAudio": true /*, "ntsc": false */ },
  "segments": [
    {
      "startMs": 12000,                       // REQUIRED — ms; identical to ingest/transcribe Caption.startMs
      "endMs":   34000,                       //            and scene-detect timeSec*1000 (no re-timing here)
      "name":    "hook om X",                 // → clip name + marker <name>   ("…er dette xyz")
      "comment": "ages 18-35, reels fit 0.93", // optional → marker <comment> (auto-prefixed "fra <tc> til <tc> — ")
      "color":   "red"                        // optional — one of the 8 colors (default green); unknown → green
    }
  ]
}
```

- **Times are milliseconds** — the contract is byte-identical to the Whisper/scene-detect outputs already in
  the repo. The exporter never re-times; it maps `ms → integer frame` at the exact rational rate
  (`round(ms/1000 * fpsExact)`, where NTSC uses `fps*1000/1001`).
- **The 8 marker colors:** `green` (default) · `red` · `orange` · `yellow` · `white` · `blue` · `cyan` ·
  `magenta`. (Honest caveat: Premiere's FCP6-level importer **may drop marker color** on import — color is
  emitted anyway because DaVinci/other tools honor it. The range **span** is reliable; only the color is not.)
- **`--layout`:** `both` (default — clips laid end-to-end on V1 **and** range markers at the timeline
  positions) · `assembly` (clips only, no markers) · `annotate` (one full-length source clip + range markers
  at the **original source** positions, for review-on-original).
- **Output:** `out/work/<project>/deliver/<slug>.premiere.xml` + `.csv`. The style/agent copies the final
  `.xml` into `test-video/<project>/` (or hands the path to the editor) at delivery. Re-exporting with changed
  segments **auto-forks `-v2`** (GAP-55) — never overwrite an approved hand-off.
- The richer GAP-69 council JSON (`rank`, `virality_score`, `scores{}`, `segment_type`, …) is a **superset**:
  the exporter reads the fields it needs and ignores the rest. See
  the `video-editor` skill's best-segments-selection reference.

---

## `export-davinci-edl.ts` — the same `segments.json`, for DaVinci Resolve (P1I / GAP-70/71)

The **DaVinci-native sibling** of `export-premiere-xml`. Reads the **identical `segments.json`** and emits a
**CMX3600 EDL** — the only native, file-based, dependency-free Resolve import where marker **color** survives
(via `* LOC:` locator lines) and clips import. **Why not just reuse the Premiere `.xml`?** Resolve imports
the FCP7 XML's *clips* but **drops its timeline markers + color** — so the EDL is genuinely needed.

```bash
tsx capabilities/deliver/export-davinci-edl.ts \
  --in test-video/<project>/source.mp4 \
  --segments out/work/<project>/highlights/segments.json \
  --project <project> \
  [--out …/x.davinci.edl] [--name "Vibe Timeline"] [--start-tc 01:00:00:00] [--layout annotate|assembly]
```

- **`--layout annotate`** (default): one full-length event (the whole source) + one `* LOC:` marker per
  segment at its source→record position — the documented "import comments/markers into Resolve" pattern, best
  for marking up a video. **`assembly`**: each segment is its own contiguous clip-event with one marker.
- **Two-step Resolve import (document for the editor):** (1) `File ▸ Import Timeline ▸ Import AAF, EDL, XML…`
  for clips (**the media must already be in the Media Pool**); (2) right-click the timeline ▸
  **Timelines ▸ Import ▸ Timeline Markers from EDL…** (same `.edl`) for the markers. (3) Set the timeline's
  **Starting Timecode = `--start-tc`** (default `01:00:00:00`) or markers land an hour off. Resolve 18/19/20.
- **EDL limitations (baked in + honest):** **point markers only** (range markers flatten to the in-point);
  **single V track**; **≤999 events** (throws past); **ASCII-only** (Danish ø/æ/å auto-fold to o/ae/aa);
  color limited to the **8 portable keywords** (`WHITE RED GREEN BLUE CYAN MAGENTA YELLOW BLACK`;
  `orange`→`YELLOW`, unknown→`RED`); **no per-marker note field** → the idea + description fold into the
  locator label. For long notes / range markers / multitrack, FCPXML 1.9 is the planned richer secondary
  (GAP-71); the DaVinciResolveScript `AddMarker` API is the richest but needs Resolve running.
