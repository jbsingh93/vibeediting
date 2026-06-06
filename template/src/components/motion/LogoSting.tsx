import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { useBrand } from '../BrandContext';

type Props = {
  /** Headline text (the brand name / lockup line). */
  title: string;
  /** Optional secondary line under the title (e.g. tagline). */
  tagline?: string;
  /** Frame to start the sting (default 0). */
  delay?: number;
  /** Background color (default brand primary). */
  background?: string;
};

/**
 * `LogoSting` — full-bleed brand lockup with a spring scale-in. Use for opening/closing
 * brand bumpers across styles.
 */
export const LogoSting: React.FC<Props> = ({ title, tagline, delay = 0, background }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const brand = useBrand();

  const pop = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, mass: 0.5, stiffness: 180 },
    durationInFrames: 20,
  });
  const scale = interpolate(pop, [0, 1], [0.8, 1]);
  const opacity = interpolate(pop, [0, 1], [0, 1]);
  const taglineIn = interpolate(frame - delay, [fps * 0.4, fps * 0.7], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: background ?? brand.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 90px',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          opacity,
          transform: `scale(${scale})`,
          fontFamily: brand.fonts.heading,
          color: brand.colors.secondary,
        }}
      >
        <div style={{ fontSize: 120, fontWeight: brand.weights.black, lineHeight: 1.0 }}>{title}</div>
        {tagline ? (
          <div
            style={{
              fontSize: 36,
              fontWeight: brand.weights.bold,
              color: brand.colors.accent,
              letterSpacing: '0.04em',
              marginTop: 24,
              opacity: taglineIn,
            }}
          >
            {tagline}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
