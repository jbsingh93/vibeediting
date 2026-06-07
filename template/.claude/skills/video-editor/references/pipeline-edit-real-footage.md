# Pipeline: Real Footage Edit + Motion Graphics Overlay

Subtractive editing pipeline. Loaded when brief mentions "edit this footage", "raw recording", or "cut these takes".

## Architecture: folder-contract I/O

Each phase reads from previous folder, writes to its own. Even in single-agent mode, enforce this discipline.

```
input/
  raw-footage/
    *.mp4              ← user drops 4K raw recordings here

01-ingest/
  → outputs:
    proxy/<file>-720p.mp4         (720p H.264 CRF 28 proxy)
    metadata/<file>.json          (duration, dims, fps, audio info)

02-analyze/
  inputs: 01-ingest/proxy/, 01-ingest/metadata/
  → outputs:
    analysis/<file>.vad.json       (Silero VAD speech segments)
    analysis/<file>.captions.json  (Whisper word-level transcript — ears)
    analysis/<file>.srt            (standard SRT)
    analysis/<file>.visual.json    (Gemini visual+audio timeline — eyes)
    analysis/<file>.visual.md      (human-readable visual timeline)

03-edit/
  inputs: 02-analyze/*
  → outputs:
    edit/cuts.json                 (kept segments, trimmed segments, retakes)
    edit/transcript-clean.srt      (post-cut timeline)
    edit/cut-review.html           (side-by-side script comparison)
    ⏸ PAUSE FOR HUMAN APPROVAL ⏸

04-storyboard/
  inputs: 03-edit/cuts.json, 03-edit/transcript-clean.srt
  → outputs:
    storyboard/plan.json           (motion graphic placements, B-roll cues)
    storyboard/preview.html        (human-reviewable storyboard)
    ⏸ PAUSE FOR HUMAN APPROVAL ⏸

05-compose/
  inputs: 01-ingest/proxy/, 03-edit/cuts.json, 04-storyboard/plan.json
  → outputs:
    composition/Main.tsx, composition/scenes/*.tsx (Remotion code)

06-render/
  inputs: 05-compose/*, original 4K raw (proxy swapped for original)
  → outputs:
    render/final-<date>.mp4

07-publish/
  inputs: 06-render/*
  → outputs:
    publish/<destination>-upload-id.txt
```

## Workflow

### Step 1: Brief intake

Confirm or ask for:
- Source file location
- Target output (paid ad / tutorial / talking-head with overlays)
- Aspect (9:16 / 16:9 / 1:1)
- Final duration target (raw is 30min, want 8min cut)
- Style anchor
- Cut autonomy: full auto vs human-review-each-cut

### Step 2: Phase 01 — Ingest

```bash
mkdir -p out/01-ingest/proxy out/01-ingest/metadata

# Probe
tsx capabilities/ingest/probe.ts input/raw-footage/take.mp4 > out/01-ingest/metadata/take.json

# Proxy
tsx capabilities/deliver/make-proxy.ts input/raw-footage/take.mp4 out/01-ingest/proxy/take-720p.mp4
```

> **HLG/HDR phone footage:** if the source is HEVC 10-bit HLG it will read gray/washed-out — tonemap
> to an SDR editmaster FIRST (see known-bugs-and-fixes.md) and ingest that.

### Step 3: Phase 02 — Analyze

```bash
mkdir -p out/02-analyze

# Whisper transcription — EARS (OpenAI whisper-1, word-level; STT is OpenAI cloud only)
tsx capabilities/ingest/transcribe.ts out/01-ingest/proxy/take-720p.mp4 out/02-analyze/take

# Gemini visual review — EYES (what's on screen, incl. silent/B-roll stretches)
# Send the 720p proxy, never 4K. Rich per-second map, anchored to the Whisper transcript.
tsx capabilities/perception/gemini-video-review.ts \
  out/01-ingest/proxy/take-720p.mp4 \
  --mode describe --granularity second \
  --transcript out/02-analyze/take.captions.json \
  --out out/02-analyze/take.visual

# Silero VAD for silence/speech segments (runs via the project venv — see capabilities/ingest/README.md)
python capabilities/ingest/vad-cut.py out/01-ingest/proxy/take-720p.mp4 out/02-analyze/take.vad.json
```

The storyboard step (Phase 04) now plans B-roll/overlay placements against the **visual**
timeline (`take.visual.json`), not just the transcript — e.g. cut away during a weak on-camera
moment, hold on a strong gesture, place a callout where the screen-recording shows the click.

### Step 4: Phase 03 — Edit

Apply cut decisions:

1. **Filler-word detection**: scan transcript with the per-language filler maps (en default, da available — see `references/captions.md`). Mark for cut.
2. **Last-take rule**: detect repeated phrases (similarity >0.85). Keep latest occurrence.
3. **Silence trimming**: VAD silences >300ms → trim to 200ms.
4. **Output `cuts.json`** with kept/trimmed segments.
5. **Generate side-by-side HTML** (`cut-review.html`) showing original transcript vs proposed clean transcript.
6. **Pause for user approval** before applying cuts.

> **Dissolve-overlap fault:** when defining segment boundaries for an 8-frame dissolve, end each
> segment ≥0.15 s into genuine silence (or merge segments) — a dissolve across two spoken words
> drowns the outgoing word (see known-bugs-and-fixes.md).

### Step 5: Phase 04 — Storyboard

Plan motion-graphic + B-roll placements over the cut timeline:

```json
{
  "scenes": [
    {
      "id": "intro",
      "timeRange": [0, 12],
      "type": "talking-head",
      "overlays": [
        { "type": "lower-third", "from": 3, "to": 9,
          "props": { "name": "Presenter Name", "title": "Founder" } },
        { "type": "callout-arrow", "from": 7, "to": 10,
          "props": { "target": "screen-area-top-right" } }
      ],
      "broll": [],
      "music": { "track": "uplifting-corp.mp3", "volume": 0.2 }
    },
    {
      "id": "demo-1",
      "timeRange": [12, 45],
      "type": "screencast",
      "overlays": [
        { "type": "callout-circle", "from": 18, "to": 22,
          "props": { "x": 540, "y": 380, "radius": 80 } }
      ],
      "broll": [{ "src": "broll/demo-output.mp4", "from": 35, "to": 45 }]
    }
  ]
}
```

Render `storyboard/preview.html` with each scene as a card showing key frame + overlays. Pause for user approval.

### Step 6: Phase 05 — Compose

Generate Remotion composition from approved storyboard:

```bash
vibe new-comp EditedTake-2026-05-14 <duration> <w> <h> <fps>
```

For each scene in storyboard:
- `<OffthreadVideo src={proxyPath} trimBefore={...} trimAfter={...} />`
- Layer overlays (`<LowerThird>`, `<CalloutArrow>`, etc.) per storyboard plan
- Layer music with sidechain ducking based on VAD segments (audio fades asymmetric vs the video dissolve — see audio-mixing.md)

### Step 7: Phase 06 — Render

Swap proxy for original 4K source at render time:

```tsx
// In composition: read SOURCE_PATH from env or props
const sourceVideo = process.env.RENDER_MODE === 'final'
  ? staticFile('raw/take.mp4')
  : staticFile('proxy/take-720p.mp4');

<OffthreadVideo src={sourceVideo} ... />
```

Render with appropriate preset:

```bash
tsx capabilities/deliver/render-preset.ts youtube-1080 EditedTake-2026-05-14
```

> **xfade footgun:** normalize timebases before any `xfade`, and cap parallel NVENC jobs at ~3
> (see known-bugs-and-fixes.md).

Run in background.

### Step 8: Loudnorm + publish

```bash
tsx capabilities/deliver/loudnorm.ts out/EditedTake-2026-05-14.mp4
# Output: out/EditedTake-2026-05-14-loudnorm.mp4 ready for upload
# (two-pass + alimiter for AAC true-peak — see audio-mixing.md)
```

### Step 8.5: Visual QA gate (before publish)

Run Gemini over the finished render to catch what a frame-by-frame human review would —
weird cuts, jarring transitions, animation glitches, text overflow, safe-zone violations,
audio desync, branding drift:

```bash
# Editorial QA (cuts, transitions, animation, graphics, audio, branding)
tsx capabilities/perception/gemini-video-review.ts \
  out/EditedTake-2026-05-14-loudnorm.mp4 \
  --mode qa --context "16:9 YouTube tutorial, English, AGM educator style"

# Frame-accurate cut surgery (Whisper-grounded — catches mid-sentence / cut-before-payoff)
tsx capabilities/perception/cut-doctor.ts \
  out/EditedTake-2026-05-14-loudnorm.mp4 \
  --lang en --out out/cuts/EditedTake-2026-05-14
# Read *-loudnorm.review.md AND EditedTake-2026-05-14.cuts.md
```

Fix every `blocker`/`major` issue and every flagged cut, then re-render before publishing.
`minor`/`nit` are judgment calls.

### Step 9: BIT integration

Ask the user: "Did the auto-cuts match your taste? What edge cases need a hard rule?"

## Key rules for this pipeline

1. **Never let AI cut transcripts unsupervised** for high-stakes deliverables. Always render `cut-review.html` for human approval.
2. **Proxy file discipline**: APIs read 720p proxy, final render reads original 4K. Don't send 4K to Whisper/Gemini.
3. **Last-take rule**: keep second of any repeated phrase.
4. **0.2s default word-gap** between sentences after silence trimming.
5. **Folder-contract I/O**: phase outputs in numbered folders so each phase is restartable.
6. **Storyboard JSON intermediate**: motion-graphic placements must be reviewed before render commit.

## When to use this pipeline vs others

- **Use this pipeline**: when you have raw footage and want subtractive editing + motion-graphic overlays.
- **Use `pipeline-paid-ad.md` instead**: if the source is mostly text/AI-generated, no raw footage.
- **Use `pipeline-tutorial.md` instead**: if the raw footage is structured talking-head with clear chapters and you want light editing + B-roll, not subtractive cutting.

## Subagent decomposition (deferred)

For now, run all phases in one Claude session. When daily volume justifies, decompose into subagents:

- `editor-strategist` — directs the cut narrative
- `editor-cutter` — applies last-take + filler removal
- `creative-director` — designs storyboard
- `composer` — generates Remotion code
- `publisher` — handles output delivery

Each subagent reads from previous phase folder, writes to its own. Add to `.claude/agents/` when ready.
