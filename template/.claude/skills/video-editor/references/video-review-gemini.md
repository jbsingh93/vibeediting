# Video Review — Gemini "Eyes" (visual+audio understanding)

Whisper only **hears** the audio. This capability gives the editor **eyes**: Google
Gemini 3.1 Flash-Lite watches the actual pixels and returns a timestamped account of
what is happening on screen — including the silent / B-roll stretches Whisper is blind
to. Use it for two jobs:

1. **`describe`** — visual+audio timeline of a *source* clip. Run this during ingest so
   the cut/storyboard planning step knows what footage actually exists, not just what
   was said.
2. **`qa`** — QA pass on a *rendered* edit. Flags weird cuts, jarring transitions,
   animation glitches, text overflow, safe-zone violations, audio desync, pacing and
   branding issues — each with a timestamp, severity, and a concrete fix.

Capability CLI: `tsx capabilities/perception/gemini-video-review.ts`. Companion to
`tsx capabilities/ingest/transcribe.ts`.

## Setup

```bash
npm i @google/genai                  # already in package.json
# .env (gitignored):  GEMINI_API_KEY=...   → https://aistudio.google.com/apikey
```

The script loads `.env` itself, so you don't need to export the key. It accepts
`GEMINI_API_KEY` or `GOOGLE_API_KEY`.

## Usage

```bash
tsx capabilities/perception/gemini-video-review.ts <video> [options]
```

| Flag | Default | Notes |
|---|---|---|
| `--mode describe\|qa` | `describe` | `describe` = source eyes, `qa` = edit review |
| `--out <prefix>` | `<video>.review` | writes `<prefix>.json` + `<prefix>.md` |
| `--granularity scene\|second\|N` | `scene` | `scene` = compact timeline. `second`/`N` = **rich per-second schema** (scene/shot IDs, people, camera, transition, editor_metadata, narrative-clarity gate, editing_intelligence) |
| `--transcript <file>` | — | (rich describe) `captions.json`/`.srt`/`.txt` to **temporally anchor** the timeline (Whisper grounding). Words are used for timing only, never transcribed back |
| `--fps <n>` | `1` / `2`(qa) | raise for fast-cut footage; auto-raised by `--granularity` (second→4) |
| `--resolution low\|default\|high` | `default` | `low` for long videos (>20 min) — cheaper, ~3× more duration per context |
| `--model <id>` | `gemini-3.1-flash-lite` | or set `GEMINI_MODEL` |
| `--lang <code>` | `en` | language of the written report |
| `--start <s>` / `--end <s>` | — | analyze only a clip of the video |
| `--thinking minimal\|low\|medium\|high` | `low` (describe) / `medium` (qa) | reasoning effort |
| `--context "<text>"` | — | brief/intent so QA judges against the right target |
| `--keep` | off | keep the uploaded file (otherwise deleted after analysis) |

> **Timestamp accuracy:** Gemini's timestamps are 1-second buckets, not frame-accurate. For the exact frame to cut on, use **`cut-doctor.ts`** (below) — it grounds cut analysis in Whisper word-level timing. Gemini = understanding; cut-doctor = the surgical frame.

### Examples

```bash
# Eyes on a raw take before planning the cut (use the 720p proxy, not 4K)
tsx capabilities/perception/gemini-video-review.ts \
  out/01-ingest/proxy/take-720p.mp4 \
  --mode describe --out out/02-analyze/take.visual --fps 2

# QA a finished 9:16 ad before delivery
tsx capabilities/perception/gemini-video-review.ts \
  out/AdV1-loudnorm.mp4 \
  --mode qa --resolution low \
  --context "9:16 Meta Reel, English, AGM educator style, 30s, hook in first 3s"
```

## Output schemas

### `describe` → `<prefix>.json`

```jsonc
{
  "summary": "...",                 // 2–4 sentence overview
  "spokenLanguage": "en | mixed | none",
  "segments": [
    {
      "start": "00:00", "end": "00:04",
      "shotType": "talking-head | b-roll | screen-recording | motion-graphic | product-shot | text-card | transition | other",
      "visual": "what's literally on screen",
      "onScreenText": "verbatim visible text / captions / lower-thirds",
      "audio": "spoken gist + music/SFX/silence cues",
      "people": "who/what is visible",
      "notable": "brand elements, products, faces, transitions"
    }
  ],
  "keyVisualMoments": [{ "time": "00:03", "what": "good hook / thumbnail / cutaway" }]
}
```

### `qa` → `<prefix>.json`

```jsonc
{
  "verdict": "ship | fix-first | rework",
  "overallNotes": "one honest paragraph",
  "issues": [
    {
      "time": "00:12",
      "severity": "blocker | major | minor | nit",
      "category": "cut | transition | animation | graphics | safe-zone | text-error | audio | sync | pacing | branding",
      "problem": "what's wrong",
      "fix": "concrete actionable correction"
    }
  ],
  "strengths": ["..."]
}
```

The `.md` sibling renders the same data as a readable report (timeline table for
`describe`, severity-sorted issue table for `qa`).

### rich `describe --granularity second` → `<prefix>.json`

A dense, machine-readable per-second map for the editing agent — one entry per second,
contiguous, plus `video_summary`, `scenes[]`, and an `editing_intelligence` block:

```jsonc
{
  "video_summary": { "total_duration_seconds": 42, "dominant_format": "...", "pacing": "...", "estimated_shot_count": 2 },
  "timeline": [
    { "timestamp": "00:16", "scene_id": 1, "shot_id": 1,
      "visual_description": "...", "people": [{ "expression": "...", "gesture": "...", "mouth_movement": "speaking" }],
      "camera": { "shot_type": "CU", "movement": "static" }, "on_screen_text": "I built this with AI",
      "transition_at_this_second": "none",
      "editor_metadata": { "segment_purpose": "exposition", "b_roll_candidate": false, "cut_candidate": false, "emphasis": false, "visual_audio_sync": "speaking_to_camera" },
      "narrative_clarity": { "is_context_supported": true, "missing_context_reason": "" } }
  ],
  "scenes": [ { "scene_id": 1, "timestamp_start": "00:00", "timestamp_end": "00:16", "scene_summary": "..." } ],
  "editing_intelligence": {
    "strongest_hook_moments": [...], "recommended_cut_segments": [...],
    "b_roll_overlay_opportunities": [...], "potential_short_form_clips": [...],
    "continuity_or_quality_issues": [...],
    "narrative_coherence_analysis": { "is_flow_intuitive": true, "problematic_transitions": ["MM:SS-MM:SS — reason"] }
  }
}
```

The `narrative_clarity.is_context_supported` gate flags a **Narrative Continuity Error** when a
verbal setup ("I built this thing") pays off only visually / after a cut. Pair with
`--transcript` to anchor the per-second timing to Whisper. Use `cut-doctor` (below) for the
frame-accurate cut point.

---

## cut-doctor.ts — frame-accurate cut surgery

`tsx capabilities/perception/cut-doctor.ts` is the surgical companion. Gemini alone judges
continuity from its own imperfect audio read and rationalizes mid-sentence cuts as "clean."
cut-doctor grounds the verdict in **Whisper** (exact words + ms + sentence boundaries), so it
catches what Gemini misses.

**Fusion:** Whisper (ground-truth ears) → cut discovery (a full ffmpeg if `FFMPEG_PATH` points at
one, else Gemini ±0.5s) → **deterministic classification** (mid-word / mid-sentence / dangling-clause
/ clean, from Whisper timing — robust to fuzzy cut location since sentence spans are seconds long) →
Gemini visual layer (before/after + jarring-vs-intentional), grounded by the transcript.

```bash
tsx capabilities/perception/cut-doctor.ts <video> --lang en --out out/cuts/<name>
#   --transcript captions.json   reuse an existing Whisper transcript (skip re-transcribing)
#   --project-fps 30             timeline fps for the recommended-cut frame number
#   --no-gemini                  deterministic-only (needs a filter-capable ffmpeg for discovery)
```

Output `<name>.cuts.json` + `.cuts.md` flags every problematic cut with the spoken context, an
objective class, **and a frame-accurate recommended cut point** (e.g. *"hold the outgoing clip to
00:18.7 / frame 562"*). Requires `OPENAI_API_KEY` (Whisper) + `GEMINI_API_KEY`.

> **Note on ffmpeg:** Remotion's bundled ffmpeg is a stripped, filter-less build (audio extraction
> works, scene-detection filters do not). cut-doctor auto-resolves it for audio and falls back to
> Gemini for cut discovery. The deterministic verdict + fix point come from Whisper either way.

## How it fits the pipelines

- **Real-footage edit** (`pipeline-edit-real-footage.md`): Phase 02-analyze runs Whisper
  **and** `--mode describe` on each proxy. The storyboard step then plans B-roll/overlays
  against *visual* reality (e.g. "good cutaway at 00:18", "speaker looks off-camera 00:31").
- **Any pipeline, before delivery:** run `--mode qa` on the loudnorm'd final render. Treat
  `blocker`/`major` issues as a gate — fix and re-render before delivering.

## Cost & accuracy notes

- Gemini bills ~300 tokens/sec of video at default resolution, ~100 tokens/sec at `low`.
  For long tutorials, use `--resolution low`.
- **Proxy discipline (hard rule from the edit pipeline):** never send 4K. Gemini only needs
  to *see* the footage — feed it the 720p proxy. Files >2 GB are rejected (Files API limit);
  the script errors out and tells you to proxy.
- Timestamps are `MM:SS`, so this is reliable for clips up to ~1 hour. For longer masters,
  analyze in chunks with `--start`/`--end`.
- Uploaded files auto-expire after 48h on Google's side; the script deletes them right after
  analysis unless you pass `--keep`.
- Visual timestamps from Gemini are approximate (frame-sampled at `--fps`). For frame-accurate
  caption sync, still use Whisper word timestamps — Gemini is for *understanding*, not sync.
