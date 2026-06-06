# JBS Vibe Editing — Architecture

The public design summary of the `vibeediting` package. (Pre-alpha: parts described here land
phase by phase — see the README status note.)

## The two trees

There are exactly two artifacts:

**A. The npm package** (`vibeediting`) — the `vibe` CLI, the UI server + prebuilt web client, the
agent-runner abstraction, the FFmpeg provisioner, and the **template payload** (a complete project
scaffold). Built with tsup (single ESM bundle), released with changesets + npm OIDC trusted
publishing.

**B. The user's project folder** (created by `vibe init my-videos`) — a complete, self-contained,
agent-readable video workspace: Remotion code, the full capability engine (visible files, not
hidden in node_modules), skills/agents for the user's agent CLI, brand config, and a `.env` for
provider keys. The user's own Claude Code (or Codex CLI) runs *in* this folder.

## The product surface is the UI

`vibe init` ends by starting a local web server and opening the browser. The UI is a tri-panel
cockpit — **Assets · Agent · Editor** — with an in-house fine-tune editor (word-level caption
chips, audio-mix sidecar, segment/scene blocks, schema-driven inspector) and inline preview via
`@remotion/player`. Remotion is the invisible, headless render engine; Remotion Studio is not part
of the product. The terminal appears exactly twice in the happy path: `npm install -g vibeediting`
and `vibe init`.

## The agent is the user's own

JBS Vibe Editing ships **no LLM SDK and holds no keys**. An `AgentRunner` abstraction shells out to
the agent CLI the user already has:

- **Claude Code (first-class):** spawned headless with streaming JSON events, session resume,
  a scoped tool firewall, and a cockpit contract that keeps every turn grounded in the project's
  brief, plan, and manifest.
- **Codex CLI (supported):** the same event contract via an adapter; persona and routing are
  injected through a generated `AGENTS.md`.

The agent drives a **capability engine** — typed, contract-emitting CLI scripts for ingest
(probe/transcribe/scene/beat/VAD), audio (mastering/loudness/duck-mix), color (LUT grade/correct),
assembly (typed FFmpeg ops + pipelines), perception (multi-specialist visual QA council,
reference-style analysis, cut surgery), generation (TTS/music/SFX/thumbnails), screen recording,
paid video generation (router with cost estimation, dry-run defaults, budget guard + generation
cache), orchestration (manifest with stage lifecycle + versioning, append-only provenance, split
verifier), and delivery (render presets, loudness normalization, Premiere XML / DaVinci EDL export).

## Quality gates

- **Split verifier:** objective technical meters (frame counts, LUFS/true-peak, luma, caption gaps)
  are authoritative; AI taste review is advisory and can never override a meter.
- **Plan = cost approval:** any plan that includes paid generation must state the estimated cost;
  approving the plan approves the spend. A budget guard and generation cache run underneath.
- **Provenance:** every capability appends to an append-only log; approved versions are never
  overwritten — revisions fork.

## Brand & templates are user-owned

- `brand/brand.json` ships as neutral boilerplate (colors, tone, language, voice ID empty until the
  user adds one) — editable in the UI or by the agent; components, the QA council's brand lens, and
  TTS all read it.
- **Save as Template:** any finished project or agent conversation can be distilled into the user's
  own style skill, which then appears in the new-video wizard next to the built-in style anchors.

## Platform strategy

One package, runtime platform detection (win32 / darwin / linux). Platform work happens at
`vibe init` / `vibe setup`: FFmpeg resolution (`VIBE_FFMPEG` env → project `.vibe/bin/` → PATH →
per-OS auto-download at the user's request, then a capability probe), optional Python venv for the
audio/analysis engines (graceful degradation without it), encoder fallback chains
(NVENC → VideoToolbox → libx264), and hardened child-process spawning on Windows.

## Repo layout

```
bin/vibe.ts            entry wrapper
src/cli.ts             commander dispatcher (typed exit codes 0–7, SIGINT → 6)
src/commands/          init · ui · doctor · setup · upgrade · run · new-comp
src/core/              errors, shared infra
src/agent/   (V1)      AgentRunner + Claude/Codex adapters
src/init/    (V3)      scaffolder + provisioners
src/server/  (V4)      Fastify UI server
ui-app/      (V4)      React client → prebuilt ui-dist/ ships in the package
template/    (V2–V3)   the complete project scaffold seeded by `vibe init`
tests/                 vitest unit + playwright e2e
```

## License

Source-available, free for personal & non-commercial use (PolyForm Noncommercial 1.0.0).
Commercial use requires a separate license. See LICENSE, NOTICE, and the README.
