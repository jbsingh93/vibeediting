# `orchestrate/` — the spine (manifest · provenance · verifier)

Makes four clever scripts feel like one machine: single planner → specialized executors → hard file
contract → verifier (the convergent research architecture). **Status: BUILT (P2, 2026-05-27)** —
contract-aligned and regression-tested in `_tests/p2-orchestrate.test.ts`.

| File | Purpose | Backs |
|---|---|---|
| `manifest.schema.ts` ✅ | Zod 4 schema (snake_case, AG §5.3): `{project_id, version, status, inputs, stages{…:{status,params,outputs,attempts,approved}}, approvals_required[], retry_policy{max_retries,backoff}}`. `parseManifest`/`emptyManifest`. | P2.1 |
| `manifest.ts` ✅ | Read/update helpers; validated transitions `pending→running→complete\|failed\|blocked`; **`complete` is terminal — never overwrites outputs**; atomic `.tmp`+rename; rollup status; retry/backoff; **P2.6 approval gate** (`completeStage` holds outputs at `blocked` until `approveStage`). | P2.2 / P2.6 |
| `provenance.ts` ✅ | Durable, git-tracked, append-only NDJSON log: timestamp, capability+args, output path + sha256 + bytes. (Distinct from the disposable work-tree log `contract.appendProvenance` writes per-run; same record shape.) | P2.3 |
| `verify.ts` ✅ | **Split verifier.** (1) Technical gate — objective signals (frame-count==round(dur×fps)±1, LUFS/true-peak via `audio/loudness.py`, near-black `signalstats`, caption gaps) are *authoritative*. (2) Taste gate — the `gemini-council` EYES (opt-in `--eyes`); resolution = **human escalation**, not auto-discount. Pure `decide()` codifies "a lenient `ship` never overrides a meter". Returns `{verdict: ship\|fix\|rework\|escalate, stage_to_retry, reasons[]}`. | P2.4; GAP-22/36 |
| `proxy.ts` ✅ | Proxy-first two-pass: 480p draft that **keeps source fps** (GAP-24 — drops only resolution so xfade timing stays valid). Distinct from `deliver/make-proxy.ts` (720p analysis proxy). | P2.5 |
| `budget-guard.ts` ✅ | `APIBudgetGuard` (hard `max_cost_usd` + rolling `max_rpm`, persisted ledger that holds across runs) + sha256 `GenerationCache` (`{prompt,model,seed,ref_hash}`) for the on-demand paid VFX (P4V). | GAP-43 |

**State location (GAP-9):** `projects/<project>/manifest.json` + `provenance.log` are git-tracked (like
captions); `out/work/<project>/<stage>/` is disposable. Override the projects root with
**`VIBE_PROJECTS_DIR`** (the test suite points it at `out/work` so it never writes into git).
*(AG §5; CP §5; DR "Agent architecture".)*
