/**
 * capabilities/generate/spend.ts — meter PAID generator spend into the same ledger + provenance the
 * cockpit reads (VT.4 F15). Until now only the vfx generators recorded to budget.json, so the cockpit
 * Budget & History tab read empty after real ElevenLabs / gpt-image spend. These helpers let the
 * audio + image generators record a cost CLAIM (consistent with vfx's pre-call claimCost — the ledger
 * has always held claims, not billed actuals) and append a durable provenance record.
 *
 * Cost claims are ESTIMATES (ElevenLabs bills in credits whose USD rate varies by plan; gpt-image
 * varies by size/quality) — read from `_env/models.json` cost fields. Metering is best-effort: a
 * failure here NEVER breaks a generation (the asset is already written).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { APIBudgetGuard } from '../orchestrate/budget-guard';
import { logProvenance } from '../orchestrate/provenance';

const MODELS_PATH = path.join(__dirname, '..', '_env', 'models.json');

/** Extract the project from a generator output path (public/<p>/…, out/work/<p>/…, out/<p>/…). */
export function inferProjectFromOut(outPath: string): string | null {
  const norm = outPath.replace(/\\/g, '/');
  const m = norm.match(/(?:^|\/)(?:public|out\/work|out)\/([^/]+)\//);
  return m ? m[1]! : null;
}

interface CostBlock { usdPer1kChars?: number; usdPerSecond?: number; usdFlat?: number; usdPerImage?: number }

/** Read a cost block from models.json by dotted path (e.g. 'voice.tts'); {} when absent. */
function costBlock(dotted: string): CostBlock {
  try {
    const models = JSON.parse(fs.readFileSync(MODELS_PATH, 'utf8')) as Record<string, unknown>;
    const node = dotted.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), models);
    return (node && typeof node === 'object' ? (node as { cost?: CostBlock }).cost ?? {} : {}) as CostBlock;
  } catch {
    return {};
  }
}

/** TTS claim: per-1k-chars rate × chars. Falls back to a small default when models.json lacks it. */
export function estimateTtsCostUsd(chars: number, modelKey = 'voice.tts'): number {
  const rate = costBlock(modelKey).usdPer1kChars ?? 0.18;
  return +((Math.max(0, chars) / 1000) * rate).toFixed(4);
}

/** Music claim: per-second rate × seconds. */
export function estimateMusicCostUsd(seconds: number, modelKey = 'voice.music'): number {
  const rate = costBlock(modelKey).usdPerSecond ?? 0.02;
  return +(Math.max(0, seconds) * rate).toFixed(4);
}

/** SFX claim: flat per call (short clips). */
export function estimateSfxCostUsd(modelKey = 'voice.sfx'): number {
  return +(costBlock(modelKey).usdFlat ?? 0.02).toFixed(4);
}

/** Image claim: per generated image × n. */
export function estimateImageCostUsd(n = 1, modelKey = 'image.thumbnail'): number {
  const per = costBlock(modelKey).usdPerImage ?? 0.2;
  return +(Math.max(1, n) * per).toFixed(4);
}

/**
 * Record a paid generation's cost claim to the project's budget ledger AND durable provenance.
 * No-ops (without throwing) when the project can't be inferred or anything fails — metering must
 * never break a successful generation. Returns the recorded costUsd (or 0 if skipped).
 */
export function recordGenerateSpend(opts: {
  outPath: string;
  capability: string;
  model: string;
  costUsd: number;
}): number {
  try {
    const project = inferProjectFromOut(opts.outPath);
    if (!project || !(opts.costUsd > 0)) return 0;
    // Unbounded guard instance: we only RECORD here (the plan-gate cost approval is the real ceiling).
    new APIBudgetGuard(project, { maxCostUsd: Number.POSITIVE_INFINITY, maxRpm: Number.POSITIVE_INFINITY }).record(
      opts.capability,
      opts.model,
      opts.costUsd,
    );
    logProvenance(project, opts.capability, {
      outputs: [opts.outPath],
      note: `paid generation — claim $${opts.costUsd.toFixed(4)} (${opts.model})`,
    });
    return opts.costUsd;
  } catch {
    return 0;
  }
}
