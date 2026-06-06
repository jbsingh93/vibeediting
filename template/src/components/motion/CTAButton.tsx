import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { useBrand } from '../BrandContext';
import { Wiggle } from './Wiggle';

type Props = {
  text: string;
  /** Frame to start the pop-in (default 0). */
  delay?: number;
  /** 'down' renders a ↓ arrow inside; 'right' renders →; 'none' renders text only. */
  arrow?: 'down' | 'right' | 'none';
  /** Font size in px (default 56). */
  fontSize?: number;
};

/**
 * `CTAButton` — branded pill CTA with a `back.out`-style spring pop and an optional bobbing
 * arrow. Replaces the inline yellow-pill JSX in `OutroCard`.
 */
export const CTAButton: React.FC<Props> = ({ text, delay = 0, arrow = 'down', fontSize = 56 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const brand = useBrand();

  const pop = spring({
    frame: frame - delay,
    fps,
    config: { damping: 11, mass: 0.6, stiffness: 200 },
    durationInFrames: 18,
  });
  const scale = interpolate(pop, [0, 1], [0.7, 1]);
  const opacity = interpolate(pop, [0, 1], [0, 1]);

  const arrowSvg =
    arrow === 'none' ? null : (
      <Wiggle frequency={2} amplitude={5} axis={arrow === 'down' ? 'y' : 'x'}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
          {arrow === 'down' ? (
            <path d="M12 4v14M6 12l6 6 6-6" stroke={brand.colors.primary} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d="M4 12h14M12 6l6 6-6 6" stroke={brand.colors.primary} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      </Wiggle>
    );

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        fontFamily: brand.fonts.heading,
        fontWeight: brand.weights.black,
        fontSize,
        color: brand.colors.primary,
        background: brand.colors.accent,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 18,
        padding: '20px 48px',
        borderRadius: 999,
        boxShadow: '0 16px 50px rgba(0,0,0,0.45)',
      }}
    >
      {text}
      {arrowSvg}
    </div>
  );
};
