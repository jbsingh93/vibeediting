<!-- VIBE:GENERATED {{VIBE_VERSION}} — seeded by `vibe init`. Edit freely; `vibe upgrade` never overwrites files you change. -->

# CLAUDE.md — {{PROJECT_NAME}}

This is a **JBS Vibe Editing** project: a self-contained, agent-driven video workspace.
Remotion is the (headless) render engine; a battle-tested capability engine does the media
work; YOU (the agent) are the editor. The user normally drives everything through the
cockpit UI (`vibe ui`) — chat, plan gates, fine-tune editor, delivery.

## The one rule above all

**Route through the skill.** `.claude/skills/video-editor/SKILL.md` is the binding
workflow (hard rules, per-format pipelines, QA gates). Read it before building anything.
When you act as the cockpit agent, `.claude/agents/vibe-studio.md` is your persona and
the cockpit contract is non-negotiable.

## Commands

```bash
npm run lint          # tsc --noEmit (strict) — keep it green
npm test              # the capability engine's regression suite (fast, no API spend)
npm run test:render   # + render-tier checks (slow)
npm run build         # remotion bundle

vibe ui               # the cockpit (the user's surface)
vibe doctor           # health: ffmpeg, venv, keys, agents — run when anything misbehaves
vibe setup --ffmpeg|--venv   # re-provision
vibe run <capability> [args] # tsx capabilities/<capability>.ts with .env loaded
vibe new-comp <Name>  # scaffold a composition + register in Root.tsx
vibe upgrade          # re-sync engine/skill files from a newer vibeediting version
```

Capability CLIs run directly too: `tsx capabilities/<folder>/<script>.ts --help`.

## Hard rules (engine policy — never override)

1. **STT = OpenAI `whisper-1` only** (`capabilities/ingest/transcribe.ts`). Never local whisper.
2. **Visual cortex = `gemini-3.1-flash-lite`** (models pinned in `capabilities/_env/models.json`). Never Gemini 2.5.
3. **Deliver at −14 LUFS / −1 dBTP** (`capabilities/deliver/loudnorm.ts` post-render — always).
4. **All motion frame-driven** (`useCurrentFrame()` + `interpolate`/`spring`). CSS transitions/animations and Tailwind `animate-*` are FORBIDDEN (they don't render). GSAP only as a paused timeline `.seek(frame/fps)` — see `capabilities/motion/GSAP-IN-REMOTION.md`.
5. **ffmpeg via the resolver only** (`capabilities/_env/ffmpeg.ts`: `VIBE_FFMPEG` → `.vibe/bin/` → PATH). Never Remotion's bundled ffmpeg, never a hardcoded path.
6. **Manifests fork, never clobber:** `complete` is terminal; revisions auto-fork `v{K+1}`; an approved version is never overwritten (`capabilities/orchestrate/manifest.ts`).
7. **Split verifier is the delivery gate** (`capabilities/orchestrate/verify.ts`): objective meters (frames, LUFS, true-peak, luma, caption gaps) are authoritative; AI taste review advises, never excuses.
8. **9:16 safe zone:** captions/CTA stay OUT of the bottom 480 px (`<SafeZone>` enforces).
9. **Plan = cost approval:** any plan including paid generation (ElevenLabs, gpt-image, Veo/Runway/Seedance) MUST state `Estimated cost: $X.XX (provider, model, seconds)` — approval of the plan is approval of the spend.
10. **No Remotion Studio.** Preview happens in the cockpit Player (`vibe ui`); quick checks via `npx remotion still`. Never launch `remotion studio`.
11. **Render via presets** (`capabilities/deliver/render-preset.ts`), never a bare `npx remotion render`.

## Folder conventions

| Path | What | Lifetime |
|---|---|---|
| `capabilities/` | The engine: typed CLIs for ingest/audio/color/assemble/perception/generate/acquire/screen-record/vfx/orchestrate/deliver. Index: **`CAPABILITIES.md`** (the wiki). | upgradeable via `vibe upgrade` |
| `src/components/` | Brand-aware components + motion atoms (canonical — compose by name, never copy) | upgradeable |
| `src/compositions/<name>/` | One folder per video composition; register in `src/Root.tsx` | yours |
| `brand/` | `brand.json` (colors/tone/voice/brandWords) + `fonts.json` + `brand-voice.md` — THE config boundary | yours |
| `projects/<p>/` | manifest.json, brief.md, provenance.log, chat.jsonl per video project — durable, git-tracked | yours |
| `public/<p>/` | per-project assets (VO `vo-*`, music `bgm-*`, SFX `sfx-*`, captions/props JSON) — the comps' staticFile root | yours (media gitignored) |
| `out/work/<p>/` | disposable intermediates + renders | regenerable |
| `deliver/` | final deliverables | yours |
| `.vibe/` | provisioned ffmpeg, agent settings, init state | machine-specific |

## Environment

- Provider keys live in `.env` (OPENAI_API_KEY, GEMINI_API_KEY, ELEVENLABS_API_KEY; optional RUNWAY_API_SECRET, FAL_KEY). The UI's API-Keys page edits it; never print key values.
- The Python venv (`capabilities/.venv`) is OPTIONAL — without it, audio mastering/beat/VAD/yt-dlp degrade gracefully (ffmpeg-only loudnorm still delivers). `vibe setup --venv` creates it.
- Windows: lut3d filter paths need `:` escaping (handled inside the capability CLIs — don't hand-roll ffmpeg filtergraphs when an op exists in `capabilities/assemble/ffmpeg-ops.ts`).

## The cockpit contract (when driven from the UI)

The UI renders exactly four truths — a "finished" video that skips them is NOT finished:
`projects/<p>/brief.md` (the brief) · `manifest.notes` (the plan) · recorded stages
(`startStage`/`completeStage`) · editable data in `public/<p>/` (captions/segments/audio-mix/props
JSON — timelines are data-driven, never hardcoded in TSX). Full text: `.claude/agents/vibe-studio.md`.
