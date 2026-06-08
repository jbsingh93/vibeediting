# The EDL cut model — `segments.json` (the light-NLE editor's source of truth)

> **Conditional read.** Load this whenever you build or edit a **real-footage cut** the user will
> fine-tune in the cockpit's light video editor (range-select, split/delete/reorder, b-roll insert,
> transitions, per-clip effects, range-scoped "Ask Editor Agent"). The cut is **data**, not TSX:
> `public/<project>/segments.json` is the single source of truth (D25/D32). The editor parses the
> CANONICAL schema only — an invented shape renders nothing.

The schema owner is `src/components/edl.ts` (`parseSegments`, `segmentsDocSchema`); the cockpit
server and client mirror it 1:1. Every field after the original `{ id, srcStart, srcEnd }` is
optional and backward-compatible: an older `segments.json` with no `transition`/`effects` still
loads and renders byte-identically.

```jsonc
{
  "fps": 30,
  "crossfadeFrames": 8,          // default per-edge dissolve length when a segment has no `transition`
  "src": "raw/main.mp4",         // fallback source (public/-rooted) for segments without their own `src`
  "segments": [
    {
      "id": "seg-1",
      "srcStart": 0.0,           // SECONDS into the source kept by this clip
      "srcEnd": 2.5,
      "src": "raw/broll.mp4",    // optional per-segment source (b-roll cutaway, single lane — D31)
      "cap": "subs",             // optional caption-set key → captions-<cap>.json
      "transition": {            // optional, on this clip's INCOMING edge (D26). OMIT for the default dissolve.
        "kind": "dissolve",      // cut | dissolve | fade | slide | wipe
        "durationFrames": 8,
        "direction": "l"         // slide/wipe only: l | r | u | d
      },
      "effects": [               // optional ordered stack on this clip (D27). OMIT for a plain clip.
        { "type": "transform", "scale": 1.1, "x": 0, "y": -20 },
        { "type": "opacity", "value": 0.9 },
        { "type": "speed", "rate": 1.5 },
        { "type": "colorCorrect", "brightness": 1.05, "contrast": 1.1, "saturation": 1.2 }
      ]
    }
  ],
  "emphasisWords": ["AI", "now"]
}
```

## Rules

- **Boundaries are seconds of SOURCE** (`srcStart`/`srcEnd`), snapped to word starts/ends from the
  transcript — never mid-word. The output timeline is derived (`placeEdl`), so deleting or reordering
  a clip **ripples automatically** and captions re-project onto the new cut for free.
- **Transitions own the cut, not a sidecar.** `transition` lives inside `segments.json` so one doc =
  one fork/version unit. Set it ONLY to override one edge; omit it everywhere else and the global
  `crossfadeFrames` dissolve applies. `cut` (or `durationFrames: 0`) = a hard cut. `slide`/`wipe`
  honor `direction`; `dissolve`/`fade` ignore it.
- **Effects render identically in preview and render.** `transform`/`opacity`/`speed`/`colorCorrect`
  are pure Remotion/CSS, so the cockpit preview and the headless render match. **`{ "type": "lut" }`
  is schema-valid but its renderer ships post-launch (VE.5.6) — don't emit `lut` yet.**
- **Speed is constant per clip** (`{ "type": "speed", "rate" }`); variable-speed ramps are out of
  scope (D33).
- **Single video lane (D31).** B-roll is a cutaway: insert a segment with its own `src`. True overlay
  / picture-in-picture is deferred — do not assume a second video lane exists.
- **One audio master, locked.** Audio stays in `audio-mix.json` (`masterLufs: -14`); never put audio
  in `segments.json`.

See also: [pipeline-edit-real-footage.md](pipeline-edit-real-footage.md) (the full ingest→cut→render
pipeline) and the cockpit contract in `.claude/agents/vibe-studio.md`.
