# `_tests/` — capability regression suite (the "media gate")

The repo has no unit-test framework by design; `npm run lint` (eslint + tsc) is the *code* gate.
This is the **media/behavior gate** the plan calls for (X.1, P5.1, P6.3): fast smoke + regression
checks that fail if a future change breaks a shipped capability. Zero dependencies — bespoke harness
run under the pinned `tsx`.

```bash
npm test            # fast suite: P0 foundations + P0.9 contract + P1 engines + P2 orchestration + P3 templates + P4V vfx
npm run test:render # + slow tier: DemoWelcome still-render + librosa beat-detect (numba JIT)
```

**No API budget is spent in `npm test`** — every behavioral test synthesizes media with ffmpeg (`fixtures.ts`) or uses pure functions; paid/network paths (OpenAI/Gemini/ElevenLabs/yt-dlp/HTTP) are real but exercised only via offline structural checks + dry-runs. Live API smoke is a future opt-in (network flag).

| File | Guards | Key regressions caught |
|---|---|---|
| `p0.1-ffmpeg.test.ts` | P0.1 | resolver falls back to PATH; a required filter/encoder disappears; loudnorm/lut3d/scene-detect break |
| `p0.2-venv.test.ts` | P0.2 | venv missing; an import breaks; a pinned version drifts from `requirements.txt` |
| `p0.3-doctor.test.ts` | P0.3 | doctor goes RED (any core check fails) |
| `p0.4-remotion.test.ts` | P0.4 | a `@remotion/*` version drifts off `4.0.461`; a platform-specific native gets pinned; tsx/zod undeclared |
| `p0.5-captions.test.ts` | P0.5 | `parseCaptions` rejects real captions / accepts garbage; emphasis matching regresses |
| `p0.6-scaffold.test.ts` | P0.6 | a capability folder/README/_env artifact vanishes; **visual cortex ≠ gemini-3.1-flash-lite (GAP-38)** |
| `p0.7-docs.test.ts` | P0.7/P0.8 | CAPABILITIES.md wiki structure (§0–§17) or the license note gets deleted |
| `p0.9-contract.test.ts` | P0.9 | the capability envelope / workDir / provenance / `modelId` (whisper-1 + flash-lite) contract breaks |
| `p1a-audio.test.ts` | P1A | master chain loses dynamics; loudness misses -14±1 / -1 dBTP; mix duck/finalize regresses |
| `p1b-color.test.ts` | P1B | a house LUT corrupts (≠ size-33); grade.ts/correct.ts/grade.py stop applying |
| `p1c-ingest.test.ts` | P1C | probe frame math; scene-cut miss; VAD silence/filler/dedup; **a local-STT import sneaks in** |
| `p1d-assemble.test.ts` | P1D | the 4-op pipeline breaks; loses idempotency; trim PTS reset regresses |
| `p1e-perception.test.ts` | P1E | council roster ≠ 7 / prompts stop forcing evidence; reference roster ≠ 9; flash-lite guard |
| `p1f-acquire.test.ts` | P1F | HTML→md extraction; filename/hash; provenance array; **yt-dlp loses the full-ffmpeg merge** |
| `p2-orchestrate.test.ts` | P2 | manifest defaults/validation; lifecycle + **`complete` never overwritten**; rollup/retry; durable provenance append-only; **split-verifier `decide()` table** (lenient `ship` can't override a meter; taste→escalate); `technicalGate` + `verify.ts` envelope; proxy keeps fps (GAP-24); approval gate holds→approves; **end-to-end manifest-driven run**; budget cap/rpm/cache |
| `p0-render.test.ts` | P0.4/P0.5 | (render tier) a composition no longer mounts/renders |
| `p1c-beat.test.ts` | P1C.5 | (render tier) librosa beat detection regresses |

`fixtures.ts` synthesizes + caches the small media the P1 tests share (`out/work/_tests/`).
**Convention:** one `pN.M-*.test.ts` per task; register it in `run.ts`. Tests must be type-clean
(`tsc` compiles them). Assertions live in `harness.ts` (`test`, `assert`, `assertEqual`,
`assertIncludes`, `assertThrows`, `runAll`).
