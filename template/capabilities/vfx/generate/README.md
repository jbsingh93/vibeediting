# `vfx/generate/` — paid-cloud generative-video wrappers (P4V.5 / GAP-42/43/50)

Three wrappers + Aleph (v2v): **Runway · Veo · Seedance** — the only paid generators this project uses
(no Kling/Pika/Luma/Sora; no local/free generator). Each speaks the shared `GenerationBrief` →
`GenerationResult` contract from `types.ts` so the orchestrator can treat them interchangeably.

| File | Provider | Auth | What it builds |
|---|---|---|---|
| [`route.ts`](./route.ts) | — | — | GAP-50 decision matrix (pure function) |
| [`cost.ts`](./cost.ts) | — | — | CostClaim from `_env/models.json` cost matrix |
| [`cache.ts`](./cache.ts) | — | — | seed-aware sha256 cache key (Runway has seed; Veo/Seedance don't) |
| [`sanitize.ts`](./sanitize.ts) | — | — | Veo negatives, Runway positive phrasing, Seedance brand-strip, Aleph preserve-clause, Runway-I2V motion-only |
| [`veo.ts`](./veo.ts) | Google Veo 3.1 | `GEMINI_API_KEY` | `@google/genai` SDK; `operations.get()` poll; download immediately |
| [`runway.ts`](./runway.ts) | Runway Gen-4.5 / Gen-4 Turbo | `RUNWAY_API_SECRET` | `@runwayml/sdk`; `task.status` poll; download immediately (expires) |
| [`seedance.ts`](./seedance.ts) | Seedance 2.0 (fal.ai) | `FAL_KEY` | `@fal-ai/client`; queue poll; multimodal `inputs[]` |
| [`aleph.ts`](./aleph.ts) | Runway Aleph (v2v) | `RUNWAY_API_SECRET` | Granular phrasing + preserve-clause + ≤30 s cap |
| [`templates/`](./templates/) | — | — | Per-use-case prompt templates (talking-head, 9:16 plate, mood/textural, v2v relight, identity multishot) |

**Hard rules baked in (GAP-50):**
- **`cameraFixed:false`** auto-injected on Seedance when `brief.cameraMotion=true`.
- **Identity-locked briefs are REFUSED on Seedance 2.0** (blocks realistic faces) — router escalates to Veo 3.1.
- **Runway image-to-video** strips visual descriptors (motion-only text) — `motionOnlyForRunwayI2V()`.
- **Aleph prompts** must be granular + include "Preserve [subject], [camera], [composition]" — wrapper appends + refuses vague briefs.
- **Cache key splits by provider:** Runway includes `seed`; Veo + Seedance use `{prompt, model, ref_hash, durationSec, aspect, resolution}` (seed-less).
- **Result URLs expire** — every wrapper downloads immediately to `out/work/<project>/vfx/`.

**Dry-run mode:** if `--dry-run` is passed OR the auth env var is absent, the wrapper writes a JSON
sidecar with the full payload + cost claim + cache key (no spend, no network). This is what unit tests
run against, and how the planner inspects a call BEFORE asking the human to approve it.
