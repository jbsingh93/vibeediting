#!/usr/bin/env tsx
/**
 * capabilities/vfx/generate/runway.ts — Runway Gen-4.5 / Gen-4 Turbo / (Aleph in `aleph.ts`) wrapper.
 *
 * SDK: `@runwayml/sdk`. Auth: env `RUNWAY_API_SECRET`. Polling: `task.status` → `SUCCEEDED`.
 * Result URLs: `result.expiresAt` — DOWNLOAD IMMEDIATELY to `out/work/<project>/vfx/`.
 *
 * GAP-50 hard rules baked in:
 *   - Image-to-video → STRIP visual descriptors from the prompt; keep only motion phrases (`motionOnlyForRunwayI2V`).
 *   - No `negative_prompt` field; instead append the positive `RUNWAY_POSITIVE_CLEAN` phrasing.
 *   - `seed` is the only deterministic knob in the trio — cache key includes it explicitly (cache.ts).
 *
 * Dry-run + cache + budget guard semantics mirror `veo.ts`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { hasEnv, requireInputFile, runCapability } from '../../_env/contract';
import { APIBudgetGuard, GenerationCache } from '../../orchestrate/budget-guard';
import { buildCacheKey } from './cache';
import { claimCost } from './cost';
import { RUNWAY_POSITIVE_CLEAN, motionOnlyForRunwayI2V } from './sanitize';
import type { GenerationBrief, GenerationResult, Modality } from './types';

const DEFAULT_MODEL = 'gen4.5';

export interface RunwayPayload {
  model: string;
  modality: Modality;
  promptText: string;
  promptImage?: string;
  seed?: number;
  ratio: '1280:720' | '720:1280' | '1024:1024';
  duration: number;
}

function ratioFor(aspect: GenerationBrief['aspect']): RunwayPayload['ratio'] {
  if (aspect === '9:16') return '720:1280';
  if (aspect === '1:1') return '1024:1024';
  return '1280:720';
}

export function buildRunwayPayload(
  brief: GenerationBrief,
  modelId: string,
  opts: { modality?: Modality } = {},
): RunwayPayload {
  const modality = opts.modality ?? (brief.references && brief.references.length > 0 ? 'i2v' : 't2v');
  // GAP-50: i2v → motion-only prompt; t2v → append positive "clean frame" phrasing
  let promptText = brief.prompt;
  if (modality === 'i2v') {
    promptText = motionOnlyForRunwayI2V(brief.prompt);
  } else {
    promptText = `${brief.prompt.trim()}. ${RUNWAY_POSITIVE_CLEAN}`;
  }
  return {
    model: modelId,
    modality,
    promptText,
    promptImage: brief.references?.[0],
    seed: brief.seed,
    ratio: ratioFor(brief.aspect),
    duration: brief.durationSec,
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export async function generateRunway(
  project: string,
  brief: GenerationBrief,
  opts: { modelId?: string; modality?: Modality; out: string; dryRun?: boolean; budgetCapUsd?: number } = { out: '' },
): Promise<GenerationResult> {
  const modelId = opts.modelId ?? DEFAULT_MODEL;
  const payload = buildRunwayPayload(brief, modelId, { modality: opts.modality });
  const cost = claimCost('runway', modelId, brief.durationSec);
  const cache = new GenerationCache(project);
  const key = buildCacheKey('runway', modelId, payload.promptText, brief);
  const cached = cache.get(key);
  if (cached) {
    return {
      provider: 'runway',
      model: modelId,
      outputPath: cached,
      durationSec: brief.durationSec,
      aspect: brief.aspect,
      cacheKey: key,
      cacheHit: true,
      costUsd: 0,
      prompt: brief.prompt,
      finalPrompt: payload.promptText,
      metadata: { payload, costClaim: cost, cached: true },
    };
  }

  if (opts.budgetCapUsd != null) {
    const guard = new APIBudgetGuard(project, { maxCostUsd: opts.budgetCapUsd, maxRpm: 60 });
    const decision = guard.canSpend(cost.costUsd);
    if (!decision.allowed) throw new Error(`budget guard refused Runway call: ${decision.reason}`);
  }

  const dryRun = opts.dryRun || !hasEnv('RUNWAY_API_SECRET');
  const out = path.resolve(opts.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  if (dryRun) {
    fs.writeFileSync(`${out}.runway-dry-run.json`, JSON.stringify({ payload, costClaim: cost, cacheKey: key }, null, 2));
    return {
      provider: 'runway',
      model: modelId,
      outputPath: `${out}.runway-dry-run.json`,
      durationSec: brief.durationSec,
      aspect: brief.aspect,
      cacheKey: key,
      cacheHit: false,
      costUsd: 0,
      prompt: brief.prompt,
      finalPrompt: payload.promptText,
      metadata: { payload, costClaim: cost, dryRun: true },
    };
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  // @ts-expect-error — on-demand SDK; install `npm i @runwayml/sdk` when first used.
  const mod: any = await import('@runwayml/sdk').catch((e) => {
    throw new Error(`Runway wrapper needs @runwayml/sdk (run: npm i @runwayml/sdk). Cause: ${e?.message ?? e}`);
  });
  const RunwayML = mod.default ?? mod.RunwayML ?? mod;
  const client = new RunwayML({ apiKey: process.env.RUNWAY_API_SECRET });

  let task: any;
  if (payload.modality === 'i2v') {
    task = await client.imageToVideo.create({
      model: modelId,
      promptImage: payload.promptImage,
      promptText: payload.promptText,
      ratio: payload.ratio,
      duration: payload.duration,
      seed: payload.seed,
    });
  } else {
    task = await client.textToVideo.create({
      model: modelId,
      promptText: payload.promptText,
      ratio: payload.ratio,
      duration: payload.duration,
      seed: payload.seed,
    });
  }

  let status = await client.tasks.retrieve(task.id);
  while (status.status === 'PENDING' || status.status === 'RUNNING') {
    await new Promise((r) => setTimeout(r, 5000));
    status = await client.tasks.retrieve(task.id);
  }
  if (status.status !== 'SUCCEEDED') {
    throw new Error(`Runway task ${task.id} ended ${status.status}: ${status.failure ?? '(no detail)'}`);
  }
  const url: string | undefined = status.output?.[0];
  if (!url) throw new Error(`Runway task ${task.id} succeeded with no output URL`);
  // Download IMMEDIATELY (result URL expires per `result.expiresAt`)
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Runway download failed: ${res.status} ${res.statusText}`);
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  cache.put(key, out);
  const guard2 = opts.budgetCapUsd != null ? new APIBudgetGuard(project, { maxCostUsd: opts.budgetCapUsd, maxRpm: 60 }) : null;
  guard2?.record('vfx/generate/runway', modelId, cost.costUsd, key);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    provider: 'runway',
    model: modelId,
    outputPath: out,
    durationSec: brief.durationSec,
    aspect: brief.aspect,
    cacheKey: key,
    cacheHit: false,
    costUsd: cost.costUsd,
    prompt: brief.prompt,
    finalPrompt: payload.promptText,
    metadata: { payload, costClaim: cost, taskId: task.id, expiresAt: status.expiresAt },
  };
}

async function main(): Promise<void> {
  await runCapability('vfx/generate/runway', async () => {
    const prompt = arg('prompt');
    if (!prompt) throw new Error('missing --prompt');
    const out = arg('out');
    if (!out) throw new Error('missing --out');
    const brief: GenerationBrief = {
      prompt,
      references: arg('reference') ? [requireInputFile(arg('reference'), 'reference image')] : undefined,
      durationSec: parseFloat(arg('duration') ?? '5'),
      aspect: (arg('aspect') as GenerationBrief['aspect']) ?? '16:9',
      resolution: (parseInt(arg('resolution') ?? '1080', 10) as GenerationBrief['resolution']) ?? 1080,
      seed: arg('seed') ? parseInt(arg('seed') as string, 10) : undefined,
    };
    const r = await generateRunway(arg('project') ?? '_scratch', brief, {
      modelId: arg('model'),
      modality: arg('modality') as Modality | undefined,
      out,
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
