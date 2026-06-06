import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { useBrand } from '../BrandContext';

type Props = {
  title: string;
  subtitle?: string;
  /** Distance from the bottom edge in px (default = 12% of height). */
  bottom?: number;
  /** Distance from the left edge in px (default = 80). */
  left?: number;
  /** Slide-in delay in frames (default 0). */
  delay?: number;
  /** Optional ribbon color (default brand accent). */
  accent?: string;
};

/**
 * `LowerThird` — standard talking-head lower-third banner: accent ribbon + title + subtitle
 * sliding in from the left. Replaces the ad-hoc inline JSX patterns the styles each rebuild.
 */
export const LowerThird: React.FC<Props> = ({
  title,
  subtitle,
  bottom,
  left = 80,
  delay = 0,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const brand = useBrand();

  const enter = spring({
    frame: frame - delay,
    fps,
    config: { damping: 14, mass: 0.6, stiffness: 170 },
    durationInFrames: 18,
  });
  const x = interpolate(enter, [0, 1], [-120, 0]);
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const ribbonColor = accent ?? brand.colors.accent;

  return (
    <div
      style={{
        position: 'absolute',
        left,
        bottom: bottom ?? Math.round(height * 0.12),
        transform: `translateX(${x}px)`,
        opacity,
        display: 'flex',
        alignItems: 'stretch',
        gap: 0,
        pointerEvents: 'none',
      }}
    >
      <div style={{ width: 10, background: ribbonColor, borderRadius: 4 }} />
      <div
        style={{
          background: 'rgba(14,14,17,0.78)',
          padding: '18px 32px',
          borderRadius: '0 12px 12px 0',
          fontFamily: brand.fonts.heading,
          color: brand.colors.secondary,
        }}
      >
        <div style={{ fontWeight: brand.weights.black, fontSize: 44, lineHeight: 1.05 }}>{title}</div>
        {subtitle ? (
          <div style={{ fontWeight: brand.weights.medium, fontSize: 26, marginTop: 6, color: brand.colors.muted }}>
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
};
