/**
 * capabilities/vfx/generate/route.ts — paid-cloud generator router (plan P4V.5.a; GAP-42/50).
 *
 * Given a GenerationBrief, picks the (provider, model) and a fallback chain per the GAP-50 rules:
 *
 *   1. v2v / relight / restyle              → Runway Aleph (purpose-built). No fallback within the trio.
 *   2. identityLocked (realistic human face)
 *        → Veo 3.1 Standard (Ingredients to Video). Fallback: Seedance 1.5 Pro (lip-sync) → Runway Gen-4.5
 *          NEVER Seedance 2.0 (blocks realistic faces, hard safety rule).
 *   3. mood / textural (Tier-2 black bg)    → Seedance 2.0 (cheapest + strongest camera language).
 *                                             Fallback: Veo 3.1 Fast → Runway Gen-4 Turbo.
 *   4. rapidIteration (draft motion)         → Runway Gen-4 Turbo (5 credits/s — 2.5–3× faster).
 *                                             Fallback: Veo 3.1 Fast → Seedance 2.0 (if mood).
 *   5. default (16:9 / 9:16 realistic plate) → Veo 3.1 Standard.
 *                                             Fallback: Veo 3.1 Fast → Runway Gen-4.5.
 *
 * Pure function — fully unit-testable without spinning up any SDK. The wrapper layer is what actually
 * spends money.
 */
import type { GenerationBrief, Provider, RoutingDecision } from './types';

const VEO_STANDARD = 'veo-3.1-generate-preview';
const VEO_FAST = 'veo-3.1-fast-generate-preview';
const RUNWAY_GEN_4_5 = 'gen4.5';
const RUNWAY_GEN_4_TURBO = 'gen4_turbo';
const RUNWAY_ALEPH = 'aleph';
const SEEDANCE_2 = 'fal-ai/bytedance/seedance/v2/text-to-video';
const SEEDANCE_1_5_PRO = 'fal-ai/bytedance/seedance/v1-5-pro/text-to-video';

function entry(provider: Provider, model: string, reason: string) {
  return { provider, model, reason };
}

export function route(brief: GenerationBrief): RoutingDecision {
  // Rule 1 — v2v ALWAYS goes to Aleph (no other trio member does v2v relight)
  if (brief.v2v) {
    return {
      provider: 'runway',
      model: RUNWAY_ALEPH,
      reason: 'v2v relight/restyle → Runway Aleph (purpose-built; GAP-50)',
      fallbackChain: [],
    };
  }

  // Rule 2 — identity-locked → MUST avoid Seedance 2.0 (which blocks realistic faces, GAP-50 hard rule)
  if (brief.identityLocked) {
    return {
      provider: 'veo',
      model: VEO_STANDARD,
      reason: 'identity-locked face → Veo 3.1 Standard (Ingredients to Video; NEVER Seedance 2.0)',
      fallbackChain: [
        entry('seedance', SEEDANCE_1_5_PRO, 'Seedance 1.5 Pro for lip-sync if Veo over budget (verify pricing)'),
        entry('runway', RUNWAY_GEN_4_5, 'Runway Gen-4.5 + Gen-4 References (contact-sheet identity-lock)'),
      ],
    };
  }

  // Rule 3 — mood / textural (Tier-2 black bg) → Seedance 2.0 (cheapest)
  if (brief.mood) {
    return {
      provider: 'seedance',
      model: SEEDANCE_2,
      reason: 'mood/textural on black bg → Seedance 2.0 (cheapest + strongest camera language)',
      fallbackChain: [
        entry('veo', VEO_FAST, 'Veo 3.1 Fast macro if Seedance unavailable / face slipped through'),
        entry('runway', RUNWAY_GEN_4_TURBO, 'Runway Gen-4 Turbo as the rapid-iter fallback'),
      ],
    };
  }

  // Rule 4 — rapid iteration → Gen-4 Turbo (5 credits/s, ~40% of 4.5)
  if (brief.rapidIteration) {
    return {
      provider: 'runway',
      model: RUNWAY_GEN_4_TURBO,
      reason: 'rapid-iteration draft → Runway Gen-4 Turbo (5 credits/s, 2.5–3× faster)',
      fallbackChain: [
        entry('veo', VEO_FAST, 'Veo 3.1 Fast for cheaper realism draft'),
        entry('seedance', SEEDANCE_2, 'Seedance 2.0 if the brief drifts toward mood/textural'),
      ],
    };
  }

  // Rule 5 — default realistic plate → Veo 3.1 Standard
  return {
    provider: 'veo',
    model: VEO_STANDARD,
    reason: 'default realistic plate → Veo 3.1 Standard (native 9:16 + audio + Extend)',
    fallbackChain: [
      entry('veo', VEO_FAST, 'Veo 3.1 Fast for the draft pass'),
      entry('runway', RUNWAY_GEN_4_5, 'Runway Gen-4.5 if Veo realism falls short'),
    ],
  };
}
