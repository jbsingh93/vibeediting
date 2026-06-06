/**
 * capabilities/vfx/compositor/scene.ts — typed scene config for the `VFXComposite` Remotion template
 * (plan P4V.10).
 *
 * The planner emits one of these objects per VFX scene; the renderer wraps it as `defaultProps` on a
 * Composition that uses `src/components/motion/VFXComposite`. Pure data (no React), so it can be
 * stored in the manifest, hashed for `GenerationCache` keys, and round-tripped through Zod (P3 pattern).
 */
import { z } from 'zod';

export const vfxLayerSchema = z.object({
  src: z.string().min(1),
  from: z.number().int().nonnegative().optional(),
  durationInFrames: z.number().int().positive().optional(),
});

export const vfxTitleSchema = z.object({
  text: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  fontSize: z.number().positive().optional(),
  safeRegion: z
    .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
    .optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

export const vfxCompositeSceneSchema = z.object({
  base: vfxLayerSchema,
  screenBlend: vfxLayerSchema.optional(),
  alphaOverlay: vfxLayerSchema.optional(),
  chromakeyOverlay: vfxLayerSchema.optional(),
  title: vfxTitleSchema.optional(),
});

export type VFXLayer = z.infer<typeof vfxLayerSchema>;
export type VFXTitle = z.infer<typeof vfxTitleSchema>;
export type VFXCompositeScene = z.infer<typeof vfxCompositeSceneSchema>;

/** Parse + validate a scene config (throws a useful Zod error on malformed input). */
export function parseVFXScene(input: unknown): VFXCompositeScene {
  return vfxCompositeSceneSchema.parse(input);
}
