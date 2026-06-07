---
name: template-distiller
description: Turns a finished video project or an agent conversation into a reusable STYLE SKILL of the user's own — the "Save as Template" engine. Use when the user asks to save a project/chat as a template, style, or preset, or when the UI posts a distill request.
---

<!-- VIBE:GENERATED {{VIBE_VERSION}} — edit freely; `vibe upgrade` never overwrites files you change. -->

# Template Distiller — turn finished work into a style of your own

You distill WHAT MADE A VIDEO WORK into a new style skill the user can reuse from the
wizard's Style step or by asking for it in chat. This is how users grow their own style
library instead of starting from craft-zero every time.

## Inputs you read (in this order)

1. **`projects/<project>/manifest.json`** — which stages ran, in what order, with which
   params; which version was approved (the approved version IS the taste signal).
2. **`projects/<project>/provenance.log`** — the exact capability calls + outputs that
   produced the approved deliverable (the real pipeline, not the planned one).
3. **The composition code** (`src/compositions/<comp>/` or wherever Root.tsx points) —
   pacing, scene structure, component usage, animation timing constants.
4. **The data sidecars in `public/<project>/`** — captions.json (emphasis + line-length
   decisions), audio-mix.json (duck depths, music gain), props.json / segments.json
   (cut rhythm, scene durations).
5. **`projects/<project>/chat.jsonl`** — the user's intent AND every correction they made.
   Corrections are the gold: each one becomes a rule so the next video starts where this
   one finished.
6. **`brand/brand.json`** — so the style references brand TOKENS (accent, sellStyle…),
   never hardcoded values.

For `source: 'chat'` distills (no finished video), steps 1–4 may be partial — distill the
brief, the decisions and the corrections from the chat alone, and say so in the skill.

## Output you write

Write **`SKILL.md`** where `<slug>` is the user's chosen name, lowercase-kebab (ask if not given):

- **From the cockpit** (the "Save as Template" button / a distill request): write to the **exact path
  the request names** — the cockpit stages it under `out/work/<project>/distill/<slug>/SKILL.md` and
  then places it into `.claude/skills/<slug>/` for you (the headless agent can't write into `.claude/`
  itself). Put any `references/` next to that staged `SKILL.md`. Do NOT try to write into `.claude/`.
- **Interactively** (your own Claude/Codex session): write straight to `.claude/skills/<slug>/SKILL.md`.

Frontmatter (REQUIRED — the wizard scans `.claude/skills/*/SKILL.md` for it):

```yaml
---
name: <slug>
description: <one line — when the agent should reach for this style>
vibe-style: true
vibe-style-label: "<Human Name>"
vibe-style-hint: "<one-line card subtitle for the wizard>"
vibe-style-formats: ["9:16-ad", "16:9-tutorial"]   # formats this style fits (subset of the wizard formats)
---
```

Body sections (all required; write rules, not history):

1. **Look & motion** — scene structure, pacing table (e.g. "hook ≤3s, beat every 2.5s"),
   the components/atoms used and HOW (props patterns, timing constants). Reference CODE
   patterns from the composition — **never copy content** (headlines, b-roll, data are
   100% per-video; reuse patterns, not material).
2. **Copy & captions** — register, line lengths, emphasis style, CTA pattern. Cite
   brand.json tokens (`tone.sellStyle`), never literal copy.
3. **Audio recipe** — VO style/voice source (brand.json voice), music character, duck
   depth, SFX density, the loudness target (−14 LUFS / −1 dBTP — always).
4. **Pipeline** — the capability sequence that produced the approved version (from
   provenance), as the default plan for this style.
5. **QA emphases** — which council lenses mattered (e.g. "transition strictness high,
   color drift was the recurring issue") so review goes straight at this style's risks.
6. **What the user corrected** — every chat correction, distilled to a DO/DON'T rule.
   This section is why the template gets BETTER with every project distilled into it.

Optional: `references/` for anything long (a pacing breakdown, an annotated scene table).

## Rules

- **No personal/project content in the skill**: no client names, no transcript quotes,
  no media paths from the source project. Patterns and rules only.
- Distilled skills are the USER'S files — do NOT add a `VIBE:GENERATED` marker, and never
  overwrite an existing user style without asking (offer `<slug>-2` or merging).
- After writing, confirm to the user: the new style appears in the wizard's Style step
  (the UI scans `.claude/skills/*/SKILL.md` for `vibe-style: true`) and can be requested
  in chat by name immediately.
- If the project lacks an approved version, say so and distill from the latest version +
  chat corrections instead (mark the skill "distilled pre-approval").
