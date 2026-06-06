/**
 * capabilities/vfx/generate/types.ts — shared shapes for the paid-cloud generator wrappers
 * (plan P4V.5; GAP-42/43/50). Runway · Veo · Seedance only — no local generator.
 *
 * All wrappers return the same envelope so the router + the verifier can treat the three providers
 * interchangeably. The router (`route.ts`) decides which provider/model to use; cost-claim happens
 * BEFORE any wrapper runs; the seed-aware cache key splits by provider (GAP-50).
 */

/** Which paid provider is doing the work. Pinned to the approved trio (no Kling/Pika/Luma/Sora). */
export type Provider = 'runway' | 'veo' | 'seedance';

/** The flavor of work. v2v = video-to-video (Aleph); t2v/i2v are the regular cases. */
export type Modality = 't2v' | 'i2v' | 'v2v';

/** Briefs from the planner — what the agent ASKS for, before we route. */
export interface GenerationBrief {
  /** Plain-English description of the desired clip (post-sanitization). */
  prompt: string;
  /** Optional reference images (paths). Used for identity-lock (Veo Ingredients, Runway References, Seedance @ImageN). */
  references?: string[];
  /** Optional reference video paths (Seedance @VideoN, Aleph input). */
  referenceVideos?: string[];
  /** Optional reference audio paths (Seedance @AudioN). */
  referenceAudios?: string[];
  /** Target clip duration in seconds (must fit within the model's max). */
  durationSec: number;
  /** Target frame aspect — provider may need to be told ('16:9' / '9:16' / '1:1'). */
  aspect: '16:9' | '9:16' | '1:1';
  /** Target output resolution short edge in pixels (e.g. 1080). */
  resolution: 720 | 1080 | 2160;
  /** True if the brief involves a realistic human face (= identity-locked → MUST NOT route to Seedance 2.0). */
  identityLocked?: boolean;
  /** True for v2v relight/restyle (= must route to Runway Aleph). */
  v2v?: boolean;
  /** True for "mood / textural / black bg" — the canonical Seedance 2.0 lane. */
  mood?: boolean;
  /** True if the brief wants to draft/iterate quickly (= prefer Runway Gen-4 Turbo before Gen-4.5). */
  rapidIteration?: boolean;
  /** True if camera motion is expected (sets cameraFixed:false on Seedance). */
  cameraMotion?: boolean;
  /** Optional explicit seed (Runway only — Veo/Seedance ignore it). */
  seed?: number;
}

/** The router's decision: pick a model + a fallback chain. Emitted into manifest.params before any call. */
export interface RoutingDecision {
  provider: Provider;
  model: string;
  /** Same shape as the chosen call; the router proposes alternatives if the primary fails / over budget. */
  fallbackChain: { provider: Provider; model: string; reason: string }[];
  reason: string;
}

/** Cost claim contract (called against `APIBudgetGuard.canSpend()` before any wrapper run). */
export interface CostClaim {
  /** Estimated USD cost of the request, derived from cost matrix in `models.json` + duration. */
  costUsd: number;
  /** True if credits/USD are direct; false if credit-based (Runway). */
  isUsd: boolean;
  /** Per-second unit cost, for transparency (USD/sec or credits/sec). */
  unitCost: number;
  /** Source — which models.json entry the claim came from. */
  modelKey: string;
}

/** The wrapper return: identical across providers so the orchestrator can treat them interchangeably. */
export interface GenerationResult {
  provider: Provider;
  model: string;
  outputPath: string;
  durationSec: number;
  aspect: GenerationBrief['aspect'];
  cacheKey: string;
  cacheHit: boolean;
  costUsd: number;
  prompt: string;
  finalPrompt: string;
  metadata: Record<string, unknown>;
}
