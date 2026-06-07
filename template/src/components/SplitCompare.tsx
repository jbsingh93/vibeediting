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
 * Before/after split-screen comparison.
 * Divider draws from top → halves slide in from outside → labels fade in.
 *
 * Usage:
 *   <SplitCompare
 *     beforeContent={<div>4-5 hours</div>}
 *     afterContent={<div>6 minutes</div>}
 *     beforeLabel="BEFORE"
 *     afterLabel="AFTER"
 *   />
 */

type Props = {
  beforeContent: React.ReactNode;
  afterContent: React.ReactNode;
  beforeLabel?: string;
  afterLabel?: string;
  dividerColor?: string;
};

export const SplitCompare: React.FC<Props> = ({
  beforeContent,
  afterContent,
  beforeLabel = 'BEFORE',
  afterLabel = 'AFTER',
  dividerColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const brand = useBrand();

  // Divider draws from top
  const dividerProgress = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 120 },
    durationInFrames: 9,
  });

  // Halves slide in from outside
  const slideDriver = spring({
    frame: frame - 6,
    fps,
    config: { damping: 18, stiffness: 100 },
    durationInFrames: 12,
  });
  const beforeX = interpolate(slideDriver, [0, 1], [-540, 0]);
  const afterX = interpolate(slideDriver, [0, 1], [540, 0]);

  // Labels fade in last
  const labelOpacity = interpolate(
    frame,
    [18, 30],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill style={{ flexDirection: 'row', background: brand.colors.primary }}>
      {/* BEFORE half */}
      <div
        style={{
          flex: 1,
          transform: `translateX(${beforeX}px)`,
          background: `${brand.colors.danger}15`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 32,
          padding: 80,
        }}
      >
        <div
          style={{
            fontFamily: brand.fonts.heading,
            fontWeight: brand.weights.black,
            fontSize: 40,
            color: brand.colors.danger,
            letterSpacing: '0.1em',
            opacity: labelOpacity,
          }}
        >
          {beforeLabel}
        </div>
        <div style={{ fontSize: 64, color: brand.colors.secondary, fontFamily: brand.fonts.heading, fontWeight: brand.weights.bold, textAlign: 'center' }}>
          {beforeContent}
        </div>
      </div>

      {/* AFTER half */}
      <div
        style={{
          flex: 1,
          transform: `translateX(${afterX}px)`,
          background: `${brand.colors.success}15`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 32,
          padding: 80,
        }}
      >
        <div
          style={{
            fontFamily: brand.fonts.heading,
            fontWeight: brand.weights.black,
            fontSize: 40,
            color: brand.colors.success,
            letterSpacing: '0.1em',
            opacity: labelOpacity,
          }}
        >
          {afterLabel}
        </div>
        <div style={{ fontSize: 64, color: brand.colors.secondary, fontFamily: brand.fonts.heading, fontWeight: brand.weights.bold, textAlign: 'center' }}>
          {afterContent}
        </div>
      </div>

      {/* Divider */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          width: 6,
          height: `${dividerProgress * 100}%`,
          background: dividerColor ?? brand.colors.accent,
          marginLeft: -3,
          boxShadow: `0 0 24px ${dividerColor ?? brand.colors.accent}`,
        }}
      />
    </AbsoluteFill>
  );
};
