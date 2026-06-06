import React from 'react';
import { AbsoluteFill } from 'remotion';
import { SafeZone, type SafeRegion } from './SafeZone';
import { assertGreenKeyFriendly } from './greenKeyGuard';

/** Background mode for an external-NLE scene-clip (plan P3.3b / GAP-56). */
export type SceneBackground = 'transparent' | 'green-key-friendly' | 'opaque';

type Props = {
  /**
   * Region (0–1 frame fractions) to constrain the scene content into. Defaults to the
   * aspect-aware right-rail (16:9) / bottom-480-excluded (9:16) per `SafeZone.defaultSafeRegion`.
   */
  safeRegion?: SafeRegion;
  /**
   * `'transparent'` (default) — render-time alpha (pair with the `scene-clip-alpha` ProRes 4444 preset).
   * `'green-key-friendly'` — solid `#00FF00` plate behind the children, paired with the `scene-clip-greenkey`
   *    delivery preset; the scene's color `palette` is asserted away from the chroma-key danger zone.
   * `'opaque'` — solid near-black (`#0E0E11`) plate; pair with `scene-clip` H.264.
   */
  background?: SceneBackground;
  /**
   * Required when `background === 'green-key-friendly'`: every brand-token color the scene will paint.
   * `SceneClip` runs `assertGreenKeyFriendly()` on this list at compose time, so a green-near color
   * fails fast instead of producing an unkeyable clip. (Re-asserted by the verifier color specialist
   * at delivery — GAP-45.)
   */
  palette?: ReadonlyArray<string>;
  /** Optional explicit override of the opaque background color. Default: `#0E0E11` (near-black). */
  opaqueColor?: string;
  /** Visualize the safeRegion (passes through to `SafeZone` — off in production renders). */
  showSafeZone?: boolean;
  children?: React.ReactNode;
};

/**
 * `SceneClip` — the canonical wrapper for a Remotion scene that will be rendered as an
 * individual B-roll/motion-graphics clip for an external NLE edit (plan GAP-53 / GAP-56 / GAP-57).
 *
 * Composes `SafeZone` (constraint container) + a background plate sized to the frame. The choice
 * of `background` MUST match the chosen `deliver/render-preset`:
 *
 *   - `'transparent'`         ↔ `scene-clip-alpha`     (ProRes 4444 `yuva444p10le`, alpha intact)
 *   - `'green-key-friendly'`  ↔ `scene-clip-greenkey`  (H.264; downstream `assemble/chromakey`)
 *   - `'opaque'`              ↔ `scene-clip`           (H.264, layered as a hard-cut B-roll)
 */
export const SceneClip: React.FC<Props> = ({
  safeRegion,
  background = 'transparent',
  palette,
  opaqueColor = '#0E0E11',
  showSafeZone = false,
  children,
}) => {
  if (background === 'green-key-friendly') {
    if (!palette || palette.length === 0) {
      throw new Error(
        "SceneClip: background='green-key-friendly' requires a non-empty `palette` prop — every color the scene paints must be asserted away from #00FF00 (GAP-56).",
      );
    }
    assertGreenKeyFriendly(palette);
  }

  const bg =
    background === 'transparent' ? 'transparent' : background === 'green-key-friendly' ? '#00FF00' : opaqueColor;

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <SafeZone safeRegion={safeRegion} show={showSafeZone}>
        {children}
      </SafeZone>
    </AbsoluteFill>
  );
};
