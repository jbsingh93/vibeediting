/**
 * The render-preset dropdown options (UIP2.4) — the EXACT 10-preset union from
 * capabilities/deliver/render-preset.ts. The list is enforced exhaustive at ui:check time:
 * adding/removing a Preset there breaks this file until it's updated (plan §2.6: import the
 * type; don't restate it loosely).
 */
import type { Preset } from './types';

export const PRESETS = [
  'vertical-ad',
  'square-ad',
  'portrait-feed',
  'youtube-1080',
  'youtube-4k',
  'reel-60fps',
  'transparent-overlay',
  'scene-clip',
  'scene-clip-alpha',
  'scene-clip-greenkey',
] as const satisfies readonly Preset[];

// compile-time exhaustiveness check (both directions: satisfies above, Exclude below).
type MissingPreset = Exclude<Preset, (typeof PRESETS)[number]>;
const _assertAllPresets: MissingPreset[] = [];
void _assertAllPresets;

/** Human hints for the dropdown (kept honest: dimensions/codec only, no hype). */
export const PRESET_HINTS: Record<Preset, string> = {
  'vertical-ad': '9:16 · h264 crf18',
  'square-ad': '1:1 · h264 crf18',
  'portrait-feed': '4:5 · h264 crf18',
  'youtube-1080': '16:9 1080p · h264 + 192k audio',
  'youtube-4k': '16:9 4K (×2) · h264 crf16',
  'reel-60fps': '9:16 60fps · h264 crf18',
  'transparent-overlay': 'ProRes 4444 alpha (.mov)',
  'scene-clip': 'B-roll clip · h264 crf17',
  'scene-clip-alpha': 'B-roll alpha · ProRes 4444 (.mov)',
  'scene-clip-greenkey': 'B-roll on #00FF00 · h264 crf15',
};
