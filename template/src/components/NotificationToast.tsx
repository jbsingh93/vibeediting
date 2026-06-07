import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Easing,
} from 'remotion';
import { useBrand } from './BrandContext';

/**
 * Notification toast. Slides in from top, holds, slides out.
 *
 * Usage:
 *   <Sequence from={300} durationInFrames={120}>
 *     <NotificationToast icon="🔔" title="47 new leads" body="Generated automatically overnight" />
 *   </Sequence>
 */

type Props = {
  icon?: string;
  title: string;
  body?: string;
  background?: string;
  position?: 'top' | 'bottom-stack';
};

export const NotificationToast: React.FC<Props> = ({
  icon,
  title,
  body,
  background,
  position = 'top',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const brand = useBrand();

  // Slide in from top
  const enter = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 200 },
    durationInFrames: 9,
  });
  // Slide out at end (last 6 frames)
  const exitFrame = durationInFrames - 6;
  const exit = interpolate(
    frame,
    [exitFrame, durationInFrames],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.in(Easing.cubic),
    },
  );

  const yFrom = position === 'top' ? -150 : 150;
  const y = interpolate(enter - exit, [0, 1], [yFrom, 0]);
  const opacity = enter - exit;

  return (
    <AbsoluteFill
      style={{
        justifyContent: position === 'top' ? 'flex-start' : 'flex-end',
        alignItems: 'center',
        padding: 80,
      }}
    >
      <div
        style={{
          background: background ?? brand.colors.primary,
          color: brand.colors.secondary,
          padding: '24px 32px',
          borderRadius: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          opacity,
          transform: `translateY(${y}px)`,
          boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
          border: `1px solid rgba(255,255,255,0.08)`,
          minWidth: 480,
          maxWidth: '85%',
          fontFamily: brand.fonts.body,
        }}
      >
        {icon && <div style={{ fontSize: 40 }}>{icon}</div>}
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontWeight: brand.weights.bold,
              fontSize: 28,
              lineHeight: 1.2,
            }}
          >
            {title}
          </div>
          {body && (
            <div
              style={{
                fontWeight: brand.weights.medium,
                fontSize: 22,
                color: brand.colors.muted,
                marginTop: 4,
              }}
            >
              {body}
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
