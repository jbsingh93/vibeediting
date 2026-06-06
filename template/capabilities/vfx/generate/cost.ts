/**
 * capabilities/vfx/generate/cost.ts — derive a CostClaim from the GAP-50 cost matrix in models.json.
 *
 * The single source of truth for per-second prices is `_env/models.json` (each generativeVideo entry
 * carries either `costPerSecondUsd` or `costPerSecondCredits`). This module turns a brief + a chosen
 * model into the USD figure `APIBudgetGuard.canSpend()` expects.
 *
 * Runway credit→USD conversion: Runway's Standard plan = $15/month for 625 credits ⇒ 1 credit ≈ $0.024.
 * Conservatively we use $0.025/credit (rounded up) so the budget guard refuses borderline calls.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CostClaim, Provider } from './types';

const MODELS_PATH = path.join(__dirname, '..', '..', '_env', 'models.json');

/** USD per Runway credit — used to translate `costPerSecondCredits` into USD for the budget guard. */
export const USD_PER_RUNWAY_CREDIT = 0.025;

interface ModelEntry {
  id: string;
  provider: string;
  costPerSecondUsd?: number;
  costPerSecondCredits?: number;
}

function readModels(): Record<string, Record<string, ModelEntry>> {
  return JSON.parse(fs.readFileSync(MODELS_PATH, 'utf8'));
}

/** Find the generativeVideo entry whose `id` matches the requested model id. */
export function findGenerativeEntry(modelId: string): { key: string; entry: ModelEntry } {
  const models = readModels();
  const gv = (models.generativeVideo ?? {}) as Record<string, ModelEntry | unknown>;
  for (const [key, raw] of Object.entries(gv)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const entry = raw as ModelEntry;
    if (entry.id === modelId) return { key, entry };
  }
  throw new Error(`models.json has no generativeVideo entry for model id "${modelId}"`);
}

/**
 * Build a CostClaim for a (provider, modelId, durationSec) tuple, reading the per-second cost from
 * `models.json`. Throws when the entry is missing a cost — never silently estimates.
 */
export function claimCost(provider: Provider, modelId: string, durationSec: number): CostClaim {
  if (durationSec <= 0) throw new Error(`durationSec must be > 0 (got ${durationSec})`);
  const { key, entry } = findGenerativeEntry(modelId);
  if (entry.costPerSecondUsd != null) {
    return {
      costUsd: +(entry.costPerSecondUsd * durationSec).toFixed(4),
      isUsd: true,
      unitCost: entry.costPerSecondUsd,
      modelKey: `generativeVideo.${key}`,
    };
  }
  if (entry.costPerSecondCredits != null) {
    const usd = entry.costPerSecondCredits * USD_PER_RUNWAY_CREDIT * durationSec;
    return {
      costUsd: +usd.toFixed(4),
      isUsd: false,
      unitCost: entry.costPerSecondCredits,
      modelKey: `generativeVideo.${key}`,
    };
  }
  throw new Error(`generativeVideo.${key} has no cost (cost matrix incomplete) — provider=${provider}, model=${modelId}`);
}
