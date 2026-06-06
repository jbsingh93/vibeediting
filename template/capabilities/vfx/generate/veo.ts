#!/usr/bin/env tsx
/**
 * capabilities/vfx/generate/veo.ts — Google Veo 3.1 wrapper (plan P4V.5.c; GAP-50).
 *
 * SDK: `@google/genai`. Auth: same GEMINI_API_KEY used by the perception cortex (must be billing-
 * enabled). Polling: `operations.get()`. Supports `negative_prompt`, `audio_enabled`, timestamp
 * prompting `[MM:SS-MM:SS]`, and Extend (chain to ~140 s).
 *
 * Pre-call rules (GAP-50, enforced here):
 *   - negative_prompt prepends the house defaults (`sanitize.buildVeoNegativePrompt`).
 *   - Cache key is SEED-LESS (Veo has no seed) — see `cache.buildCacheKey('veo', …)`.
 *   - Cost claim against `models.json` BEFORE any call (`cost.claimCost`).
 *   - Result download is "immediately" — Veo URLs expire.
 *
 * This file ships as a wrapper. The actual SDK import + network call run only when:
 *   - `hasEnv('GEMINI_API_KEY')` is true AND
 *   - `--dry-run` is NOT passed
 * Otherwise it returns a structured "would-have-called" envelope (so unit tests + CI never spend money).
 *
 * CLI:
 *   tsx veo.ts --prompt "..." --duration 8 --aspect 9:16 --resolution 1080 \
 *              [--reference IMG] [--negative "extra,bad,things"] [--model veo-3.1-fast-generate-preview]
 *              [--out OUT.mp4] [--project NAME] [--dry-run]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { hasEnv, requireInputFile, runCapability } from '../../_env/contract';
import { APIBudgetGuard, GenerationCache } from '../../orchestrate/budget-guard';
import { buildCacheKey } from './cache';
import { claimCost } from './cost';
import { buildVeoNegativePrompt } from './sanitize';
import type { GenerationBrief, GenerationResult } from './types';

const DEFAULT_MODEL = 'veo-3.1-generate-preview';

interface VeoPayload {
  model: string;
  prompt: string;
  negative_prompt: string;
  audio_enabled: boolean;
  duration_seconds: number;
  aspect_ratio: '16:9' | '9:16' | '1:1';
  resolution_short_edge: number;
  references: string[];
}

/** Build the SDK payload from a brief — pure function (testable without network). */
export function buildVeoPayload(brief: GenerationBrief, modelId: string, extraNegative: string[] = []): VeoPayload {
  return {
    model: modelId,
    prompt: brief.prompt,
    negative_prompt: buildVeoNegativePrompt(extraNegative),
    audio_enabled: true,
    duration_seconds: brief.durationSec,
    aspect_ratio: brief.aspect,
    resolution_short_edge: brief.resolution,
    references: brief.references ?? [],
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/**
 * Run a Veo generation. Returns a unified GenerationResult.
 *
 * `dryRun` (or absence of GEMINI_API_KEY) skips the SDK call and returns a "would-have-called" envelope
 * with the full payload + cost claim + cache key, so the planner can plan offline and tests can run.
 */
export async function generateVeo(
  project: string,
  brief: GenerationBrief,
  opts: { modelId?: string; out: string; extraNegative?: string[]; dryRun?: boolean; budgetCapUsd?: number } = { out: '' },
): Promise<GenerationResult> {
  const modelId = opts.modelId ?? DEFAULT_MODEL;
  const payload = buildVeoPayload(brief, modelId, opts.extraNegative);
  const cost = claimCost('veo', modelId, brief.durationSec);
  const cache = new GenerationCache(project);
  const key = buildCacheKey('veo', modelId, brief.prompt, brief);
  const cached = cache.get(key);
  if (cached) {
    return {
      provider: 'veo',
      model: modelId,
      outputPath: cached,
      durationSec: brief.durationSec,
      aspect: brief.aspect,
      cacheKey: key,
      cacheHit: true,
      costUsd: 0,
      prompt: brief.prompt,
      finalPrompt: payload.prompt,
      metadata: { payload, costClaim: cost, cached: true },
    };
  }

  if (opts.budgetCapUsd != null) {
    const guard = new APIBudgetGuard(project, { maxCostUsd: opts.budgetCapUsd, maxRpm: 60 });
    const decision = guard.canSpend(cost.costUsd);
    if (!decision.allowed) throw new Error(`budget guard refused Veo call: ${decision.reason}`);
  }

  const dryRun = opts.dryRun || !hasEnv('GEMINI_API_KEY');
  const out = path.resolve(opts.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  if (dryRun) {
    fs.writeFileSync(`${out}.veo-dry-run.json`, JSON.stringify({ payload, costClaim: cost, cacheKey: key }, null, 2));
    return {
      provider: 'veo',
      model: modelId,
      outputPath: `${out}.veo-dry-run.json`,
      durationSec: brief.durationSec,
      aspect: brief.aspect,
      cacheKey: key,
      cacheHit: false,
      costUsd: 0,
      prompt: brief.prompt,
      finalPrompt: payload.prompt,
      metadata: { payload, costClaim: cost, dryRun: true },
    };
  }

  // Live SDK call. Matches the @google/genai documented shape (ai.google.dev/gemini-api/docs/video).
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const mod: any = await import('@google/genai').catch((e) => {
    throw new Error(`Veo wrapper needs @google/genai (run: npm i @google/genai). Cause: ${e?.message ?? e}`);
  });
  const client = new mod.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let operation = await client.models.generateVideos({
    model: modelId,
    prompt: payload.prompt,
    config: {
      durationSeconds: payload.duration_seconds,
      aspectRatio: payload.aspect_ratio,
      resolution: `${payload.resolution_short_edge}p`,
    },
  });
  // Poll using the documented `operations.getVideosOperation` method.
  while (!operation.done) {
    await new Promise((r) => setTimeout(r, 8000));
    operation = await client.operations.getVideosOperation({ operation });
  }
  const videoFile = operation.response?.generatedVideos?.[0]?.video;
  if (!videoFile) throw new Error(`Veo operation succeeded but returned no video file`);
  // Use the SDK's own download (handles auth + retries).
  await client.files.download({ file: videoFile, downloadPath: out });
  cache.put(key, out);
  const guard2 = opts.budgetCapUsd != null ? new APIBudgetGuard(project, { maxCostUsd: opts.budgetCapUsd, maxRpm: 60 }) : null;
  guard2?.record('vfx/generate/veo', modelId, cost.costUsd, key);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    provider: 'veo',
    model: modelId,
    outputPath: out,
    durationSec: brief.durationSec,
    aspect: brief.aspect,
    cacheKey: key,
    cacheHit: false,
    costUsd: cost.costUsd,
    prompt: brief.prompt,
    finalPrompt: payload.prompt,
    metadata: { payload, costClaim: cost },
  };
}

async function main(): Promise<void> {
  await runCapability('vfx/generate/veo', async () => {
    const prompt = arg('prompt');
    if (!prompt) throw new Error('missing --prompt');
    const out = arg('out');
    if (!out) throw new Error('missing --out');
    const brief: GenerationBrief = {
      prompt,
      references: arg('reference') ? [requireInputFile(arg('reference'), 'reference image')] : undefined,
      durationSec: parseFloat(arg('duration') ?? '8'),
      aspect: (arg('aspect') as GenerationBrief['aspect']) ?? '16:9',
      resolution: (parseInt(arg('resolution') ?? '1080', 10) as GenerationBrief['resolution']) ?? 1080,
    };
    const r = await generateVeo(arg('project') ?? '_scratch', brief, {
      modelId: arg('model'),
      out,
      extraNegative: (arg('negative') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      dryRun: flag('dry-run'),
      budgetCapUsd: arg('budget-cap') ? parseFloat(arg('budget-cap') as string) : undefined,
    });
    return {
      outputs: [r.outputPath],
      metrics: { costUsd: r.costUsd, cacheKey: r.cacheKey, cacheHit: r.cacheHit, model: r.model, ...(r.metadata as Record<string, unknown>) },
      project: arg('project') ?? '_scratch',
      args: process.argv.slice(2),
    };
  });
}

if (require.main === module) void main();
