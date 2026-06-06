import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { useBrand } from '../BrandContext';

type Props = {
  text: string;
  /** Delay in frames before the pop starts (default 0). */
  delay?: number;
  /** Font size in px (default 88). */
  fontSize?: number;
  /** Tilt in degrees (default 0). */
  rotate?: number;
  /** Override the brand accent color. */
  color?: string;
  /** Background pill behind the text. Pass `null` to disable. */
  background?: string | null;
  /** Outline stroke width in px (default 2; 0 disables). */
  stroke?: number;
};

/**
 * `PopText` — single-line scale-pop text with brand defaults. Replaces the ad-hoc
 * the classic per-comp "PunchCaption" one-offs and centralizes the "gag beat" pattern across styles.
 */
export const PopText: React.FC<Props> = ({
  text,
  delay = 0,
  fontSize = 88,
  rotate = 0,
  color,
  background = 'rgba(14,14,17,0.62)',
  stroke = 2,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const brand = useBrand();

  const pop = spring({
    frame: frame - delay,
    fps,
    config: { damping: 10, mass: 0.5, stiffness: 200 },
    durationInFrames: 12,
  });
  const scale = interpolate(pop, [0, 1], [0.5, 1]);
  const opacity = interpolate(frame, [delay, delay + 4], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        transform: `scale(${scale}) rotate(${rotate}deg)`,
        opacity,
        fontFamily: brand.fonts.heading,
        fontWeight: brand.weights.black,
        fontSize,
        color: color ?? brand.colors.accent,
        background: background ?? 'transparent',
        padding: background == null ? 0 : '12px 36px',
        borderRadius: background == null ? 0 : 18,
        WebkitTextStroke: stroke > 0 ? `${stroke}px black` : undefined,
        paintOrder: 'stroke fill',
        letterSpacing: '0.01em',
        boxShadow: background == null ? 'none' : '0 14px 50px rgba(0,0,0,0.5)',
        display: 'inline-block',
      }}
    >
      {text}
    </div>
  );
};
