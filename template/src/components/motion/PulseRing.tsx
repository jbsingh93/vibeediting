import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { useBrand } from '../BrandContext';

/**
 * `PulseRing` — concentric expanding rings with a bobbing pointer, drawn at (cx, cy).
 * Use it to draw the viewer's eye to a tap target / UI element. Rings + pointer are
 * tinted with the brand accent and fade out automatically near the ~1.6s mark.
 */

export type PulseRingProps = {
  cx: number;
  cy: number;
  radius?: number;
};

export const PulseRing: React.FC<PulseRingProps> = ({ cx, cy, radius = 120 }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const brand = useBrand();

  const ringCount = 3;
  const ringPeriod = fps * 0.7;

  const arrowBob = spring({ frame, fps, durationInFrames: 12, config: { mass: 0.5, damping: 10, stiffness: 200 } });
  const arrowFloat = Math.sin((frame / fps) * Math.PI * 2.4) * 8;
  const fadeOut = interpolate(frame, [fps * 1.3, fps * 1.6], [1, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0 }}>
        {Array.from({ length: ringCount }).map((_, i) => {
          const localFrame = frame - i * (ringPeriod / ringCount);
          if (localFrame < 0) return null;
          const t = (localFrame % ringPeriod) / ringPeriod;
          const r = interpolate(t, [0, 1], [radius * 0.5, radius * 1.8]);
          const opacity = interpolate(t, [0, 0.2, 1], [0, 0.75, 0]) * fadeOut;
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={brand.colors.accent}
              strokeWidth={6}
              opacity={opacity}
            />
          );
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: cx - 40,
          top: cy - radius - 100 + arrowFloat,
          width: 80,
          height: 80,
          opacity: arrowBob * fadeOut,
          transform: `scale(${arrowBob})`,
          fontSize: 80,
          textAlign: 'center',
          lineHeight: '80px',
          filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))',
        }}
      >
        👇
      </div>
    </AbsoluteFill>
  );
};
