/**
 * capabilities/vfx/generate/sanitize.ts — output-sanitization helpers (plan P4V.5.f; GAP-50).
 *
 * Pre-empts the recurring Gemini-council blockers (GAP-45): watermarks, on-screen typos, "stock"
 * look, face morphing, identity drift, melted edges, extra fingers. Each provider has a different
 * surface:
 *
 *   Veo      — supports a `negative_prompt`. Our default list (extensible by callers).
 *   Runway   — does NOT take negatives; use positive phrasing instead: "clean frame, cinematic raw footage".
 *   Seedance — remove brand/text words FROM the prompt before sending (no negative-prompt field).
 *
 * Plus the Aleph rule (GAP-50): every Aleph (v2v) prompt MUST include a "Preserve [subject], [camera],
 * [composition]" clause — `enforcePreserveClause()` injects a default one if the caller omitted it.
 * And the Runway I2V rule: STRIP visual descriptors (subject/composition/color/lighting) — keep
 * motion-only text — `motionOnlyForRunwayI2V()` does that pass.
 *
 * YOUR brand words come from brand/brand.json → brandWords[] (the config boundary) and are
 * stripped from Seedance prompts too — the model would otherwise render them as literal text.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from '../../_env/contract';

export const DEFAULT_VEO_NEGATIVE = [
  'watermark',
  'text overlay',
  'subtitles',
  'logo',
  'stock footage',
  'face morphing',
  'identity drift',
  'extra fingers',
  'melted edges',
  'duplicate limbs',
  'compression artifacts',
  'low quality',
];

/** Append the house negative defaults onto a caller-supplied list, dedup, return comma-joined string. */
export function buildVeoNegativePrompt(extra: string[] = []): string {
  const merged = Array.from(new Set([...DEFAULT_VEO_NEGATIVE, ...extra.map((s) => s.trim()).filter(Boolean)]));
  return merged.join(', ');
}

/** Positive "no watermark / stock" phrasing for Runway (no negative-prompt support). */
export const RUNWAY_POSITIVE_CLEAN = 'clean frame, cinematic raw footage, no watermark, no on-screen text';

/** Words to remove from a Seedance prompt before sending (brand/text noise the model would render literally). */
export const SEEDANCE_STRIP_WORDS = [
  'watermark',
  'watermarks',
  'logo',
  'logos',
  'subtitle',
  'subtitles',
  'caption',
  'captions',
  'text overlay',
  'on-screen text',
  'brand',
  'branded',
];

/** YOUR brand words (brand/brand.json → brandWords[]) — empty list when unconfigured. */
export function brandWordsFromConfig(): string[] {
  try {
    const brand = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'brand', 'brand.json'), 'utf8')) as {
      brandWords?: unknown;
    };
    return Array.isArray(brand.brandWords) ? brand.brandWords.filter((w): w is string => typeof w === 'string' && !!w) : [];
  } catch {
    return [];
  }
}

/** Remove brand/text noise words from a Seedance prompt (case-insensitive, word-boundary aware). */
export function stripBrandWordsForSeedance(prompt: string, extra: string[] = []): string {
  const all = [...SEEDANCE_STRIP_WORDS, ...brandWordsFromConfig(), ...extra];
  let p = prompt;
  for (const w of all) {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'gi');
    p = p.replace(re, '');
  }
  return p.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
}

/**
 * Runway image-to-video rule (GAP-50): STRIP visual descriptors (subject / composition / color / lighting)
 * — keep ONLY motion phrases. Re-describing what's already in the reference image causes degraded motion.
 *
 * Heuristic: keep clauses that start with the camera/motion verbs the prompting guide lists.
 */
const RUNWAY_I2V_MOTION_VERBS = [
  'camera',
  'dolly',
  'pan',
  'tilt',
  'zoom',
  'orbit',
  'tracking',
  'push in',
  'pull out',
  'crane',
  'handheld',
  'rotates',
  'rotating',
  'walks',
  'walking',
  'runs',
  'running',
  'lifts',
  'falls',
  'drifts',
  'glides',
  'sweeps',
  'rises',
  'descends',
];

export function motionOnlyForRunwayI2V(prompt: string): string {
  const sentences = prompt.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) =>
    RUNWAY_I2V_MOTION_VERBS.some((v) => new RegExp(`\\b${v}\\b`, 'i').test(s)),
  );
  if (kept.length === 0) {
    // last-ditch: keep the longest sentence (better something than nothing) but flag in metadata upstream
    return prompt;
  }
  return kept.join(' ').trim();
}

/**
 * Aleph (v2v) rule (GAP-50): every prompt MUST include a "Preserve [subject], [camera], [composition]"
 * clause. If the caller's prompt already has the clause, leave it; otherwise append a sensible default
 * so unintended changes (subject swap, camera reframe) are explicitly forbidden.
 */
export function enforcePreserveClause(prompt: string, subject = 'subject'): string {
  if (/preserve\b.+(subject|camera|composition)/i.test(prompt)) return prompt;
  const clause = `Preserve ${subject}, camera, composition.`;
  return prompt.trim().endsWith('.') ? `${prompt} ${clause}` : `${prompt}. ${clause}`;
}
