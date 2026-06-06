/**
 * capabilities/vfx/generate/cache.ts — seed-aware cache key (plan P4V.5.e; GAP-50).
 *
 * Only Runway exposes a deterministic `seed` parameter. Veo + Seedance do not. The cache key MUST
 * split by provider so a Veo or Seedance HIT still represents "we already generated SOMETHING for
 * this brief; reuse it OR force regen" (the brief identifies the request even without a seed).
 *
 *   Runway:  sha256({ prompt, model, seed, ref_image_sha256 })
 *   Veo:     sha256({ prompt, model, ref_image_sha256, durationSec, aspect, resolution })  (no seed)
 *   Seed.:   sha256({ prompt, model, ref_image_sha256, durationSec, aspect, resolution })  (no seed)
 *
 * Reuses the orchestrate `GenerationCache` for the on-disk index → identical requests reuse the
 * prior output instead of paying again.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import type { GenerationBrief, Provider } from './types';

function sha256Bytes(p: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

/** Stable sha256 of an *ordered* list of reference image paths (order matters — Veo Ingredients & Runway Refs). */
export function refImagesHash(paths: string[] | undefined): string | undefined {
  if (!paths || paths.length === 0) return undefined;
  const h = crypto.createHash('sha256');
  for (const p of paths) {
    if (!fs.existsSync(p)) throw new Error(`reference image not found for cache key: ${p}`);
    h.update(p);
    h.update(sha256Bytes(p));
  }
  return h.digest('hex');
}

/** GAP-50 seed-aware key. Runway includes `seed`; Veo + Seedance include `{aspect, durationSec, resolution}` instead. */
export function buildCacheKey(provider: Provider, modelId: string, prompt: string, brief: GenerationBrief): string {
  const refHash = refImagesHash(brief.references);
  let canonical: string;
  if (provider === 'runway') {
    canonical = JSON.stringify({
      provider,
      model: modelId,
      prompt,
      seed: brief.seed ?? null,
      ref_image_sha256: refHash ?? null,
    });
  } else {
    canonical = JSON.stringify({
      provider,
      model: modelId,
      prompt,
      ref_image_sha256: refHash ?? null,
      durationSec: brief.durationSec,
      aspect: brief.aspect,
      resolution: brief.resolution,
    });
  }
  return crypto.createHash('sha256').update(canonical).digest('hex');
}
