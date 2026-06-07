import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';
import { useBrand } from './BrandContext';

/**
 * First-3-second hook text. Appears with spring scale-in + slide-up.
 * Used at composition start to deliver the bold claim.
 *
 * Usage:
 *   <Sequence durationInFrames={90} name="Hook">
 *     <HookText text="This changes everything." />
 *   </Sequence>
 */

type Props = {
  text: string;
  fontSize?: number;
  color?: string;
  align?: 'top' | 'center' | 'bottom';
  background?: string;
  emphasizeLastWord?: boolean;
};

export const HookText: React.FC<Props> = ({
  text,
  fontSize = 96,
  color,
  align = 'center',
  background,
  emphasizeLastWord = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const brand = useBrand();

  const driver = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 200 },
    durationInFrames: 14,
  });
  const opacity = driver;
  const y = interpolate(driver, [0, 1], [40, 0]);
  const scale = interpolate(driver, [0, 1], [0.92, 1]);

  const justifyContent =
    align === 'top' ? 'flex-start' : align === 'bottom' ? 'flex-end' : 'center';

  const words = text.split(' ');
  const last = words[words.length - 1];
  const rest = words.slice(0, -1).join(' ');

  return (
    <AbsoluteFill
      style={{
        justifyContent,
        alignItems: 'center',
        padding: '160px 100px',
        background,
      }}
    >
      <h1
        style={{
          color: color ?? brand.colors.secondary,
          fontFamily: brand.fonts.heading,
          fontWeight: brand.weights.black,
          fontSize,
          lineHeight: 1.05,
          margin: 0,
          textAlign: 'center',
          opacity,
          transform: `translateY(${y}px) scale(${scale})`,
          textShadow: '0 4px 24px rgba(0,0,0,0.5)',
        }}
      >
        {emphasizeLastWord && words.length > 1 ? (
          <>
            {rest}{' '}
            <span style={{ color: brand.colors.accent }}>{last}</span>
          </>
        ) : (
          text
        )}
      </h1>
    </AbsoluteFill>
  );
};
