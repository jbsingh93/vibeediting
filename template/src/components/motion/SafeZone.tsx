import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';

/** Region as fractions of the frame (0–1). */
export type SafeRegion = { x: number; y: number; w: number; h: number };

type Props = {
  /** Show the debug overlay (default: false). Off in production renders. */
  show?: boolean;
  /** Bottom margin to keep clear, in px (default 480 — platform UI on 9:16). */
  bottom?: number;
  /** Top margin to keep clear, in px (default 120). */
  top?: number;
  /** Side margins to keep clear, in px (default 80). */
  sides?: number;
  /**
   * Constraint mode (P3.3b / GAP-57). When provided, `SafeZone` becomes a constraint
   * container — children render only inside this rect (0–1 frame fractions). If omitted
   * AND `children` are given, the right-rail default (16:9) / bottom-480-excluded default
   * (9:16) is applied.
   */
  safeRegion?: SafeRegion;
  children?: React.ReactNode;
};

/** Default `safeRegion` per aspect (P3.3b / GAP-57 / talking-head-graphic-prefs memory). */
export function defaultSafeRegion(width: number, height: number): SafeRegion {
  if (height > width) {
    // 9:16 — full frame minus bottom 480 px (platform UI rule, CLAUDE.md).
    const bottomFrac = 480 / height;
    return { x: 0.04, y: 0.04, w: 0.92, h: 1 - bottomFrac - 0.04 };
  }
  // 16:9 (and 1:1) — right rail, the presenter usually sits left in shot.
  return { x: 0.55, y: 0.1, w: 0.4, h: 0.8 };
}

/**
 * `SafeZone` — dual-mode component.
 *
 * 1. **Visualizer mode** (legacy) — `<SafeZone show />` paints a debug overlay (margins,
 *    bottom platform-UI band, dashed safe rect). `show` defaults `false` so production
 *    renders are unaffected.
 *
 * 2. **Constraint container mode** (P3.3b / GAP-57) — when `children` are passed, the
 *    component clips them to `safeRegion` (or the aspect-appropriate default). Used by
 *    `SceneClip` and any motion-graphic scene that must coexist with a talking-head
 *    A-roll (keep graphics off the presenter's face).
 *
 * Both modes can be active at once (visualize WHILE constraining).
 */
export const SafeZone: React.FC<Props> = ({
  show = false,
  bottom = 480,
  top = 120,
  sides = 80,
  safeRegion,
  children,
}) => {
  const { width, height } = useVideoConfig();
  const region = safeRegion ?? (children ? defaultSafeRegion(width, height) : undefined);

  const debug = show ? (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: `${sides}px solid rgba(255, 230, 0, 0.18)`,
          boxSizing: 'border-box',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: bottom,
          background: 'rgba(255, 71, 87, 0.18)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: top,
          background: 'rgba(255, 71, 87, 0.12)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: sides,
          right: sides,
          top: top,
          bottom: bottom,
          border: '2px dashed rgba(0, 194, 168, 0.7)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          padding: '6px 12px',
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          fontFamily: 'monospace',
          fontSize: 18,
        }}
      >
        SAFE-ZONE {width}×{height} · keep {top}px top / {bottom}px bottom / {sides}px sides
        {region ? ` · region ${region.x.toFixed(2)},${region.y.toFixed(2)} ${region.w.toFixed(2)}×${region.h.toFixed(2)}` : ''}
      </div>
    </AbsoluteFill>
  ) : null;

  if (!region) return debug;

  return (
    <>
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute',
            left: `${region.x * 100}%`,
            top: `${region.y * 100}%`,
            width: `${region.w * 100}%`,
            height: `${region.h * 100}%`,
            overflow: 'hidden',
            pointerEvents: 'auto',
          }}
        >
          {children}
        </div>
      </AbsoluteFill>
      {debug}
    </>
  );
};
