# Finding the best sequences → `segments.json` → Premiere XML

> **Conditional read.** Load this when the brief is *"find the N best sequences for reels for
> <audience> on <platform> and output XML for Premiere"* (or any "find the best clips / export to
> Premiere" ask). It is the recipe for the **selection front-end** that feeds
> `deliver/export-premiere-xml.ts`. **There is NO new engine** — the router composes
> already-shipped capabilities into a `segments.json`.

## The flow (router composes existing capabilities — no new code)

1. **Probe + transcribe.** `tsx capabilities/ingest/probe.ts` (real duration/fps) →
   `tsx capabilities/ingest/transcribe.ts` (OpenAI `whisper-1`, **word-level** timing). The
   transcript word `startMs`/`endMs` are the *only* legal segment boundaries — snap every cut to a
   word start (in) and a word end (out), never mid-word.
2. **Surface objective signals FIRST** (the grounding layer): scene-cut density
   (`tsx capabilities/ingest/scene-detect.ts`), and RMS/loudness energy. These are computed before
   any model verdict so the model's picks can be *checked*, not trusted blind.
3. **Score candidate windows with the council.** `tsx capabilities/perception/gemini-council.ts
   --reel-segments` (the optional **reel-segment-selection lens**) reviews the proxy against the
   audience + platform, prompted via `master-gpt-prompter`, model `gemini-3.1-flash-lite`. It
   nominates windows and scores them on the rubric below. **A nomination with no cited evidence
   (MM:SS + transcript line) is rejected** — same forced-evidence rule as the rest of the council.
4. **Ground + rank.** Down-weight any nomination the objective signals contradict (a "viral" pick
   that is just loud/fast-talking with no payoff line; a window that straddles a hard scene cut; a
   window that violates the 9:16 bottom-480 px safe-zone). Keep the top N.
5. **Emit `segments.json`** (the schema below) and call `tsx capabilities/deliver/export-premiere-xml.ts
   --layout both`. You `File ▸ Import` the `.xml` into Premiere — each pick is a clip on V1 and a
   named range marker.

## The selection rubric (OpusClip-style, forced axes)

Score each candidate 0–1 on four axes; the headline `virality_score` (0–99) is their weighted blend:

| Axis | What it measures | Hard requirement |
|---|---|---|
| **hook** | Does it grab in **≤ 3 s**? | The segment **must start on a hook line** (question, bold claim, pattern-interrupt). |
| **flow** | Self-contained **setup → payoff**, no dangling reference | The segment **must end on a payoff**, not mid-thought. |
| **value** | Concrete takeaway / emotional beat | One clear idea per clip. |
| **trend** | Relevance to the **stated audience** + platform | Judged against the brief's `audience`, not generic virality. |

**Grounding rule (non-negotiable):** Gemini over-reads loudness/fast-talk as "viral." Before
trusting a high score, confirm it against RMS energy + a real payoff line in the transcript.
Objective signals win.

## Platform length windows (2026)

| Platform | Max | Sweet spot | Highest completion |
|---|---|---|---|
| **Instagram Reels** | 3 min | **15–30 s** | 7–15 s |
| **TikTok** | 10 min | **15–30 s** | — |
| **YouTube Shorts** | **3 min** | **20–45 s** | — |

All vertical: **1080×1920 / 9:16 / H.264**. Respect the **bottom-480 px** safe-zone (captions/CTA out of it).
Inject the target window into the council prompt so it doesn't nominate a 90 s clip for a 30 s slot.

## The richer `segments.json` the council emits

Keep **both** machine times (`_ms`); human/Premiere times can be derived by the exporter. The
exporter reads `startMs/endMs/name/comment/color` and ignores the rest.

```jsonc
{
  "source": { "fps": 25, "width": 1920, "height": 1080, "durationFrames": 15000, "hasAudio": true },
  "target": { "platform": "reels", "audience": "ai-learners", "language": "en", "length_window_s": [15, 90] },
  "segments": [
    {
      "rank": 1,
      "startMs": 412340, "endMs": 437880,
      "name": "The mistake everyone makes with AI agents",
      "comment": "hook+payoff; reels-fit 0.93",
      "color": "red",
      "virality_score": 78,
      "scores": { "hook": 0.9, "flow": 0.8, "value": 0.85, "trend": 0.6 },
      "confidence": 0.86,
      "segment_type": "hook+payoff",
      "reason": "Opens on a provocative question, lands a takeaway in 8s",
      "suggested_caption": "3 things to know before you build your first AI agent",
      "energy_rms_db": -12.4, "scene_changes": 1, "safe_region_ok": true, "warnings": []
    }
  ]
}
```

**Map `segment_type`/`rank` → marker `color`** at the call site so the editor reads the timeline at a glance,
e.g. **hook = red · insight = blue · cta = orange · b-roll = green**. The 8 colors are
`green · red · orange · yellow · white · blue · cyan · magenta` (green is the default; Premiere may drop
color on import — the range span always survives).

## Hand-off discipline

- Default `--layout both` (clips + markers). Use `annotate` when you want to review picks against the
  full original timeline; `assembly` when you only want the rough cut with no marker noise.
- Re-exporting with changed segments **auto-forks `-v2`**. Never overwrite an approved `.xml`.
- This capability is a **hand-off to a human/Premiere/DaVinci finish** — it matches the
  approval-gate philosophy. The exporter does not render or re-encode; it only describes the timeline.
