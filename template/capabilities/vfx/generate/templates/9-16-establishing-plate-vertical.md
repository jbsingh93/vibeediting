# Template — 9:16 vertical ad establishing plate

**Use when:** a vertical (9:16) ad needs an establishing/B-roll plate (street, café, office, nature).

**Router decision (GAP-50):** `Veo 3.1 Standard` — native 9:16 + audio + Extend (chain to ~140 s without manual stitching).
Fallback: Runway Gen-4.5 (if grade/realism > audio sync).

**Hard rule:** captions + CTA OUT of the bottom 480 px (the 9:16 platform-UI safe zone).

**Prompt order:** `Camera/Cinematography → Primary Action → Environment → Lighting → Style → Audio`.

**Prompt template (paste into `--prompt`):**

```
[00:00-00:04] Wide establishing shot, locked-off tripod, 35mm lens look. {{location_description}} at
{{time_of_day}}. {{primary_motion: light wind, people walking past, drifting clouds}}. {{lighting:
soft late-afternoon sun, warm key, cool shadows}}. Naturalistic. Documentary. No on-screen
text. Audio: ambient {{location}} bed only — wind, distant traffic, footsteps.

[00:04-00:08] Slow dolly-in (~3%). Same composition + lighting. Audio: same bed.
```

**Veo Extend (>8 s sequences):** chain shots in one prompt with timestamp blocks; Veo joins clips
to ~140 s natively. Prefer Extend over `assemble/concat` for continuous sequences.

**Wrapper invocation:**
```
tsx capabilities/vfx/generate/veo.ts \
  --prompt "<fill template>" \
  --duration 8 --aspect 9:16 --resolution 1080 \
  --negative "watermark,subtitles,stock footage,low quality" \
  --out out/work/<project>/vfx/establishing-9x16-v1.mp4
```

**Rules of record:** the Veo wrapper header (`veo.ts`) — "Timestamp prompting" + "Extend".
