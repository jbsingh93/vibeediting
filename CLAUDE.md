# CLAUDE.md — working ON the vibeediting package

This is the development guide for the **npm package repo** (`vibeediting`, bin `vibe`).
It is NOT the guide that ships to users — that one is generated into their project by `vibe init`.

## What this repo is

JBS Vibe Editing: an AI video-editing tool installed from npm. `vibe init` scaffolds a complete,
self-contained video project (Remotion code + capability engine + skills/agents for the user's own
Claude Code or Codex CLI) and auto-starts a local web UI. See `ARCHITECTURE.md` for the design.

## Build contract

- `DEV-DOCS/` (gitignored, local-only) is the binding build contract: product decisions (D1–D24),
  source inventories, the phased implementation plan (doc 10) and the living checklist (doc 11).
  **Update doc 11 every build session.** If `DEV-DOCS/` is absent in your checkout, ask the author.
- Implementation phases: V0 foundation → V1 agent runner → V2 engine port → V3 template/scaffolder
  → V4 UI port → V5 proofs → V6 docs → V7 legal/release → V8 launch.

## Commands

```bash
npm run build        # tsup → dist/bin/vibe.js (ESM, shebang)
npm run ui:build     # vite → ui-dist/ (the prebuilt cockpit client; committed + shipped)
npm run dev -- <args>   # run the CLI from source (tsx)
npm run typecheck    # tsc --noEmit (package, NodeNext) + tsc -p ui-app (client, bundler)
npm run test:run     # vitest: package unit + server integration
npm run test:ui      # vitest: ui-app pure-logic tests (vitest.ui.config.ts)
npm run test:e2e     # Playwright against a real `vibe ui` (mock agent + fake render)
npm run lint         # eslint flat config
```

## Hard rules

1. **Never claim "open source".** The license is PolyForm Noncommercial 1.0.0 — say
   "source-available, free for personal & non-commercial use".
2. **No personal/private context may enter this tree** — no real names (beyond the author's
   copyright/authorship lines), private brand values, voice IDs, client data, or absolute paths
   from anyone's machine. A strip-pass grep + gitleaks gate runs before every release.
3. **Typed exit codes** (`src/core/errors.ts`): 0 ok · 1 user · 2 agent · 3 network · 4 contract ·
   5 fs · 6 cancelled · 7 budget. SIGINT exits 6.
4. **`files` whitelist is the publish boundary** — only `dist`, `ui-dist`, `template`, README,
   LICENSE, NOTICE, CHANGELOG ship. CI guards the tarball.
5. **No LLM SDK dependencies.** All model access happens either via the user's agent CLI
   (claude/codex, shelled out) or via the capability engines' direct provider calls in the
   scaffolded project — never from this package's own dependencies.
6. **No Remotion Studio anywhere** — the in-house editor is the product surface; Remotion is the
   headless render engine in the scaffolded project.
7. Tests travel with code; a phase isn't done until its gate (doc 10) passes.

## Releasing (manual — no CI)

The package is live on npm (`vibeediting`, first published at 0.1.0). Releases are done
**manually from a maintainer's machine** — GitHub Actions is intentionally NOT in the loop:

```bash
npm version patch        # or minor / major — bumps package.json + creates the git tag
npm publish              # prepublishOnly runs build + ui:build, then publishes
git push --follow-tags   # push the version commit + tag
```

- `npm login` first if needed; `npm publish` will prompt for a 2FA OTP.
- `publishConfig` is `{ "access": "public" }` only — **no `provenance` key**. Provenance
  needs a CI/OIDC environment, so it stays off for local publishes; do not re-add it for
  manual releases (it makes `npm publish` fail outside CI).
- Before publishing, run the full gate: `npm run typecheck && npm run lint && npm run
  test:run`, plus the live user-simulation smoke below. The `files` whitelist (hard rule 4)
  is the publish boundary — sanity-check `npm pack --dry-run` for stray files/secrets.

**Hint — re-arming automated CI later (if it becomes relevant):** an OIDC Trusted Publisher
is already configured on npmjs.com (publisher GitHub Actions, repo `jbsingh93/vibeediting`,
workflow `release.yml`, action `npm publish`), and `.github/workflows/release.yml` holds a
ready changesets-based pipeline — currently **DISARMED** (`workflow_dispatch` only). To go
automated, restore its `push: branches: [main]` trigger and make sure GitHub Actions billing
is active; then releases flow through `npm run changeset` → a "Version Packages" PR → merge →
auto-publish with provenance. No tokens or other changes required.

## Verification — live user-simulation smoke is mandatory

Typecheck + build + unit tests are necessary but **not sufficient**. Before closing any phase-gate
row, and after every meaningful change to `src/` or `template/`, also verify the way a real user
experiences the tool (DEV-DOCS doc 12 is the authoritative reference, incl. the test-folder path):

1. `npm run build; npm pack; npm i -g .\vibeediting-<version>.tgz` — install from the **tarball**
   (never `npm link` / `npm run dev` for this purpose: only the tarball crosses the real `files`
   publish boundary, so packaging bugs surface here instead of after release).
2. Run the installed `vibe` (`doctor`, `init`, `ui`, …) from the **external test folder** defined
   in DEV-DOCS doc 12 — **never from this repo** (scaffold pollution, project-mount confusion,
   dev-tree paths masking what actually shipped). The path stays out of this file by hard rule 2.
3. UI surfaces additionally get a **live Playwright (MCP) walk** against the real `vibe ui` server
   on a project scaffolded in that test folder from the installed tarball — clicks, forms, agent
   stream, screenshots; findings triaged to `DEV-DOCS/notes/live-qa/`. Blockers/majors block the row.
4. Smokes/walks that need real media use the standing **`raw-footage/` fixtures inside that test
   folder** (`1.mp4`: 1080p HEVC 30 fps, ~7.5 s — properties + usage rules in doc 12 §3a). Copy a
   fixture into the smoke project; never point committed code or tests at it (hard rule 2 — repo
   tests use synthetic media), and never delete `raw-footage/` during cleanup.

## Layout

- `bin/vibe.ts` → `src/cli.ts` (commander dispatcher) → `src/commands/*`
- `src/core/` — errors, shared infrastructure
- `src/agent/` — AgentRunner (Claude + Codex adapters, AgentEvent union, chat/session persistence)
- `src/server/` — the cockpit Fastify server; serves ONE user project (context.ts) + the prebuilt
  client. Engine contracts (manifest/envelope/presets) are LOCAL MIRRORS of the template's —
  the on-disk JSON is the contract; if the template shape changes, change both sides.
- `template/` (from V2/V3) — the project scaffold copied by `vibe init`
- `ui-app/` (from V4) — React client source; prebuilt to `ui-dist/` (committed, shipped). Its
  engine types are local mirrors too — never import template/capabilities into the browser graph.
- `tests/unit`, `tests/integration` (server-*.test.ts boot buildApp against a temp project),
  `tests/e2e` (Playwright, 3-server topology: main/offline/empty) — vitest + playwright
