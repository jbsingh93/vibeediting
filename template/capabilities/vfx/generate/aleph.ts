#!/usr/bin/env tsx
/**
 * capabilities/vfx/generate/aleph.ts — Runway Aleph (v2v) in-context edit / relight / restyle
 * (plan P4V.8; GAP-50).
 *
 * Use cases:
 *   - relight a poorly-lit clip ("Change only the sky to sunset orange")
 *   - selective subject restyle (add/remove element; ≤30 s / 10 cuts per request)
 *   - never "make it look better" (vague → garbage output)
 *
 * GAP-50 hard rules baked in:
 *   - Granular phrasing — caller MUST be specific.
 *   - "Preserve [subject], [camera], [composition]" clause is auto-appended via `enforcePreserveClause`.
 *   - 15 credits/s cost claim (read from `models.json` generativeVideo.runwayAleph).
 *   - Cache key includes `seed` (Aleph is a Runway model and DOES support `seed`).
 *   - Input video required (v2v); cap 30 s per call enforced.
 *
 * SDK: `@runwayml/sdk`. Auth: env `RUNWAY_API_SECRET`. Polling: `task.status` → `SUCCEEDED`.
 * Dry-run + cache + budget guard mirror `veo.ts`/`runway.ts`/`seedance.ts`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { hasEnv, requireInputFile, runCapability } from '../../_env/contract';
import { APIBudgetGuard, GenerationCache } from '../../orchestrate/budget-guard';
import { buildCacheKey } from './cache';
import { claimCost } from './cost';
import { enforcePreserveClause } from './sanitize';
import type { GenerationBrief, GenerationResult } from './types';

const ALEPH_MODEL_ID = 'aleph';
export const ALEPH_MAX_DURATION_SEC = 30;

export interface AlephPayload {
  model: string;
  inputVideo: string;
  promptText: string;
  ratio: '1280:720' | '720:1280' | '1024:1024';
  durationSec: number;
  seed?: number;
}

function ratioFor(aspect: GenerationBrief['aspect']): AlephPayload['ratio'] {
  if (aspect === '9:16') return '720:1280';
  if (aspect === '1:1') return '1024:1024';
  return '1280:720';
}

export function buildAlephPayload(brief: GenerationBrief, opts: { subject?: string } = {}): AlephPayload {
  if (!brief.referenceVideos || brief.referenceVideos.length === 0) {
    throw new Error('Aleph is v2v — brief.referenceVideos[0] is required (the clip to edit/relight)');
  }
  if (brief.durationSec > ALEPH_MAX_DURATION_SEC) {
    throw new Error(`Aleph caps at ${ALEPH_MAX_DURATION_SEC}s per request (got ${brief.durationSec}s)`);
  }
  const VAGUE = /\b(make it (?:\w+\s+){0,3}(?:better|nicer|cooler|prettier|cinematic)|improve|enhance|fix it|cinematic look)\b/i;
  if (VAGUE.test(brief.prompt)) {
    throw new Error(
      `Aleph prompt is too vague — GAP-50 requires granular phrasing like "Change only the sky to sunset orange". ` +
        `Got: "${brief.prompt}"`,
    );
  }
  const promptText = enforcePreserveClause(brief.prompt, opts.subject ?? 'subject');
  return {
    model: ALEPH_MODEL_ID,
    inputVideo: brief.referenceVideos[0],
    promptText,
    ratio: ratioFor(brief.aspect),
    durationSec: brief.durationSec,
    seed: brief.seed,
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export async function generateAleph(
  project: string,
  brief: GenerationBrief,
  opts: { out: string; subject?: string; dryRun?: boolean; budgetCapUsd?: number } = { out: '' },
): Promise<GenerationResult> {
  const payload = buildAlephPayload({ ...brief, v2v: true }, { subject: opts.subject });
  const cost = claimCost('runway', ALEPH_MODEL_ID, payload.durationSec);
  const cache = new GenerationCache(project);
  const key = buildCacheKey('runway', ALEPH_MODEL_ID, payload.promptText, { ...brief, v2v: true });
  const cached = cache.get(key);
  if (cached) {
    return {
      provider: 'runway',
      model: ALEPH_MODEL_ID,
      outputPath: cached,
      durationSec: payload.durationSec,
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
    if (!decision.allowed) throw new Error(`budget guard refused Aleph call: ${decision.reason}`);
  }

  const dryRun = opts.dryRun || !hasEnv('RUNWAY_API_SECRET');
  const out = path.resolve(opts.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  if (dryRun) {
    fs.writeFileSync(`${out}.aleph-dry-run.json`, JSON.stringify({ payload, costClaim: cost, cacheKey: key }, null, 2));
    return {
      provider: 'runway',
      model: ALEPH_MODEL_ID,
      outputPath: `${out}.aleph-dry-run.json`,
      durationSec: payload.durationSec,
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
    throw new Error(`Aleph wrapper needs @runwayml/sdk (run: npm i @runwayml/sdk). Cause: ${e?.message ?? e}`);
  });
  const RunwayML = mod.default ?? mod.RunwayML ?? mod;
  const client = new RunwayML({ apiKey: process.env.RUNWAY_API_SECRET });
  const task = await client.videoToVideo.create({
    model: ALEPH_MODEL_ID,
    videoUri: payload.inputVideo, // SDK may accept fs path or a presigned URL; adjust at wire time
    promptText: payload.promptText,
    ratio: payload.ratio,
    duration: payload.durationSec,
    seed: payload.seed,
  });
  let status = await client.tasks.retrieve(task.id);
  while (status.status === 'PENDING' || status.status === 'RUNNING') {
    await new Promise((r) => setTimeout(r, 5000));
    status = await client.tasks.retrieve(task.id);
  }
  if (status.status !== 'SUCCEEDED') {
    throw new Error(`Aleph task ${task.id} ended ${status.status}: ${status.failure ?? '(no detail)'}`);
  }
  const url: string | undefined = status.output?.[0];
  if (!url) throw new Error(`Aleph task ${task.id} succeeded with no output URL`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Aleph download failed: ${res.status} ${res.statusText}`);
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  cache.put(key, out);
  const guard2 = opts.budgetCapUsd != null ? new APIBudgetGuard(project, { maxCostUsd: opts.budgetCapUsd, maxRpm: 60 }) : null;
  guard2?.record('vfx/generate/aleph', ALEPH_MODEL_ID, cost.costUsd, key);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    provider: 'runway',
    model: ALEPH_MODEL_ID,
    outputPath: out,
    durationSec: payload.durationSec,
    aspect: brief.aspect,
    cacheKey: key,
    cacheHit: false,
    costUsd: cost.costUsd,
    prompt: brief.prompt,
    finalPrompt: payload.promptText,
    metadata: { payload, costClaim: cost, taskId: task.id },
  };
}

async function main(): Promise<void> {
  await runCapability('vfx/generate/aleph', async () => {
    const prompt = arg('prompt');
    if (!prompt) throw new Error('missing --prompt');
    const out = arg('out');
    if (!out) throw new Error('missing --out');
    const inputVideo = requireInputFile(arg('input-video') ?? arg('reference-video'), 'input video (v2v source)');
    const brief: GenerationBrief = {
      prompt,
      referenceVideos: [inputVideo],
      durationSec: parseFloat(arg('duration') ?? '5'),
      aspect: (arg('aspect') as GenerationBrief['aspect']) ?? '16:9',
      resolution: (parseInt(arg('resolution') ?? '1080', 10) as GenerationBrief['resolution']) ?? 1080,
      seed: arg('seed') ? parseInt(arg('seed') as string, 10) : undefined,
      v2v: true,
    };
    const r = await generateAleph(arg('project') ?? '_scratch', brief, {
      out,
      subject: arg('subject'),
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
