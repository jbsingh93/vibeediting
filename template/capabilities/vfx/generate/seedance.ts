#!/usr/bin/env tsx
/**
 * capabilities/vfx/generate/seedance.ts — ByteDance Seedance 2.0 / 1.5 Pro via fal.ai (plan P4V.5.c; GAP-50).
 *
 * SDK: `@fal-ai/client`. Auth: env `FAL_KEY`. Polling: fal job-ID poll. Cheapest member of the trio.
 *
 * GAP-50 hard rules baked in:
 *   - `cameraFixed:false` MUST be injected if camera motion is expected (default is locked → silent failure).
 *   - Brand/text words STRIPPED from the prompt before sending (no negative-prompt field).
 *   - Multimodal inputs build `inputs[]` for @Image1/@Video1/@Audio1 token assignment.
 *   - SEEDANCE 2.0 BLOCKS REALISTIC HUMAN FACES — if `identityLocked` is true, refuse and signal upstream
 *     to fall back (the router already directs Veo for those briefs; this is the belt-and-braces guard).
 *   - SEED-LESS cache key (cache.ts).
 *
 * Dry-run + cache + budget guard mirror `veo.ts`/`runway.ts`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { hasEnv, requireInputFile, runCapability } from '../../_env/contract';
import { APIBudgetGuard, GenerationCache } from '../../orchestrate/budget-guard';
import { buildCacheKey } from './cache';
import { claimCost } from './cost';
import { stripBrandWordsForSeedance } from './sanitize';
import type { GenerationBrief, GenerationResult } from './types';

const DEFAULT_MODEL = 'fal-ai/bytedance/seedance/v2/text-to-video';
export const SEEDANCE_2_MODEL_IDS = new Set([
  'fal-ai/bytedance/seedance/v2/text-to-video',
  'fal-ai/bytedance/seedance/v2/image-to-video',
]);

export interface SeedanceInput {
  /** Token shape per GAP-50: `@Image1`, `@Video1`, `@Audio1` … */
  token: string;
  path: string;
  kind: 'image' | 'video' | 'audio';
}

export interface SeedancePayload {
  model: string;
  prompt: string;
  cameraFixed: boolean;
  aspect: GenerationBrief['aspect'];
  durationSec: number;
  inputs: SeedanceInput[];
  watermark: false;
}

/** Build the inputs[] mapping for Seedance multimodal refs. */
export function buildSeedanceInputs(brief: GenerationBrief): SeedanceInput[] {
  const inputs: SeedanceInput[] = [];
  (brief.references ?? []).forEach((p, i) => inputs.push({ token: `@Image${i + 1}`, path: p, kind: 'image' }));
  (brief.referenceVideos ?? []).forEach((p, i) => inputs.push({ token: `@Video${i + 1}`, path: p, kind: 'video' }));
  (brief.referenceAudios ?? []).forEach((p, i) => inputs.push({ token: `@Audio${i + 1}`, path: p, kind: 'audio' }));
  if (inputs.filter((i) => i.kind === 'image').length > 9)
    throw new Error('Seedance accepts at most 9 image refs');
  if (inputs.filter((i) => i.kind === 'video').length > 3)
    throw new Error('Seedance accepts at most 3 video refs');
  if (inputs.filter((i) => i.kind === 'audio').length > 3)
    throw new Error('Seedance accepts at most 3 audio refs');
  return inputs;
}

export function buildSeedancePayload(brief: GenerationBrief, modelId: string): SeedancePayload {
  // GAP-50 hard rule: refuse identity-locked face briefs on Seedance 2.0 (the model BLOCKS realistic faces)
  if (brief.identityLocked && SEEDANCE_2_MODEL_IDS.has(modelId)) {
    throw new Error(
      `Seedance 2.0 BLOCKS realistic human faces — router must escalate identity-locked briefs to Veo 3.1 ` +
        `(or Seedance 1.5 Pro for lip-sync). modelId="${modelId}", brief.identityLocked=true.`,
    );
  }
  return {
    model: modelId,
    prompt: stripBrandWordsForSeedance(brief.prompt),
    cameraFixed: brief.cameraMotion ? false : true,
    aspect: brief.aspect,
    durationSec: brief.durationSec,
    inputs: buildSeedanceInputs(brief),
    watermark: false,
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export async function generateSeedance(
  project: string,
  brief: GenerationBrief,
  opts: { modelId?: string; out: string; dryRun?: boolean; budgetCapUsd?: number } = { out: '' },
): Promise<GenerationResult> {
  const modelId = opts.modelId ?? DEFAULT_MODEL;
  const payload = buildSeedancePayload(brief, modelId); // throws on identity-locked face into v2
  const cost = claimCost('seedance', modelId, brief.durationSec);
  const cache = new GenerationCache(project);
  const key = buildCacheKey('seedance', modelId, payload.prompt, brief);
  const cached = cache.get(key);
  if (cached) {
    return {
      provider: 'seedance',
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
    if (!decision.allowed) throw new Error(`budget guard refused Seedance call: ${decision.reason}`);
  }

  const dryRun = opts.dryRun || !hasEnv('FAL_KEY');
  const out = path.resolve(opts.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  if (dryRun) {
    fs.writeFileSync(`${out}.seedance-dry-run.json`, JSON.stringify({ payload, costClaim: cost, cacheKey: key }, null, 2));
    return {
      provider: 'seedance',
      model: modelId,
      outputPath: `${out}.seedance-dry-run.json`,
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

  /* eslint-disable @typescript-eslint/no-explicit-any */
  // @ts-expect-error — on-demand SDK; install `npm i @fal-ai/client` when first used.
  const mod: any = await import('@fal-ai/client').catch((e) => {
    throw new Error(`Seedance wrapper needs @fal-ai/client (run: npm i @fal-ai/client). Cause: ${e?.message ?? e}`);
  });
  mod.fal.config({ credentials: process.env.FAL_KEY });

  const submitInput: Record<string, unknown> = {
    prompt: payload.prompt,
    camera_fixed: payload.cameraFixed,
    aspect_ratio: payload.aspect,
    duration: payload.durationSec,
    watermark: payload.watermark,
  };
  // Bind multimodal refs (URL or DataURI — for now, pass file paths through fal's storage helper)
  for (const inp of payload.inputs) {
    const file = await mod.fal.storage.upload(fs.readFileSync(inp.path));
    submitInput[`${inp.kind}_${inp.token.toLowerCase().replace('@', '')}`] = file;
  }
  const job = await mod.fal.queue.submit(modelId, { input: submitInput });
  let res = await mod.fal.queue.status(modelId, { requestId: job.request_id });
  while (res.status === 'IN_QUEUE' || res.status === 'IN_PROGRESS') {
    await new Promise((r) => setTimeout(r, 5000));
    res = await mod.fal.queue.status(modelId, { requestId: job.request_id });
  }
  const final = await mod.fal.queue.result(modelId, { requestId: job.request_id });
  const url: string | undefined = final.data?.video?.url ?? final.data?.url;
  if (!url) throw new Error(`Seedance succeeded with no video URL — payload: ${JSON.stringify(final.data)}`);
  const dl = await fetch(url);
  if (!dl.ok) throw new Error(`Seedance download failed: ${dl.status} ${dl.statusText}`);
  fs.writeFileSync(out, Buffer.from(await dl.arrayBuffer()));
  cache.put(key, out);
  const guard2 = opts.budgetCapUsd != null ? new APIBudgetGuard(project, { maxCostUsd: opts.budgetCapUsd, maxRpm: 60 }) : null;
  guard2?.record('vfx/generate/seedance', modelId, cost.costUsd, key);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    provider: 'seedance',
    model: modelId,
    outputPath: out,
    durationSec: brief.durationSec,
    aspect: brief.aspect,
    cacheKey: key,
    cacheHit: false,
    costUsd: cost.costUsd,
    prompt: brief.prompt,
    finalPrompt: payload.prompt,
    metadata: { payload, costClaim: cost, requestId: job.request_id },
  };
}

async function main(): Promise<void> {
  await runCapability('vfx/generate/seedance', async () => {
    const prompt = arg('prompt');
    if (!prompt) throw new Error('missing --prompt');
    const out = arg('out');
    if (!out) throw new Error('missing --out');
    const brief: GenerationBrief = {
      prompt,
      references: arg('reference') ? [requireInputFile(arg('reference'), 'reference image')] : undefined,
      referenceVideos: arg('reference-video') ? [requireInputFile(arg('reference-video'), 'reference video')] : undefined,
      durationSec: parseFloat(arg('duration') ?? '5'),
      aspect: (arg('aspect') as GenerationBrief['aspect']) ?? '16:9',
      resolution: (parseInt(arg('resolution') ?? '1080', 10) as GenerationBrief['resolution']) ?? 1080,
      cameraMotion: flag('camera-motion'),
      identityLocked: flag('identity-locked'),
    };
    const r = await generateSeedance(arg('project') ?? '_scratch', brief, {
      modelId: arg('model'),
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
