import React from 'react';
import {
  Img,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from 'remotion';
import { useBrand } from './BrandContext';

/**
 * Highlight card for community / comment / member shoutout.
 * Scale-pop entry + subtle continuous border-glow shimmer.
 *
 * The shimmer glow is derived from the brand accent color so it always stays on-brand.
 */

type Props = {
  avatar?: string;
  name: string;
  text: string;
  metric?: string;
  background?: string;
};

/** Parse a 3/6-digit hex into `r, g, b` (for building rgba() glow strings). */
const hexToRgbTriplet = (hex: string): string => {
  const body = hex.replace('#', '');
  const expand = (s: string) => parseInt(s.length === 1 ? s + s : s, 16);
  const r = body.length === 3 ? expand(body[0]) : expand(body.slice(0, 2));
  const g = body.length === 3 ? expand(body[1]) : expand(body.slice(2, 4));
  const b = body.length === 3 ? expand(body[2]) : expand(body.slice(4, 6));
  return `${r}, ${g}, ${b}`;
};

export const HighlightCard: React.FC<Props> = ({
  avatar,
  name,
  text,
  metric,
  background,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const brand = useBrand();

  const scale = spring({
    frame,
    fps,
    config: { mass: 0.6, damping: 10, stiffness: 200 },
    durationInFrames: 12,
  });

  // Continuous shimmer, tinted with the brand accent (deterministic — frame-driven).
  const shimmer = (Math.sin(frame * 0.08) + 1) / 2;
  const accentRgb = hexToRgbTriplet(brand.colors.accent);
  const borderColor = `rgba(${accentRgb}, ${0.3 + shimmer * 0.4})`;

  return (
    <div
      style={{
        background: background ?? brand.colors.primary,
        borderRadius: 20,
        padding: 36,
        maxWidth: 760,
        width: '85%',
        transform: `scale(${scale})`,
        border: `4px solid ${borderColor}`,
        boxShadow: `0 24px 48px rgba(0,0,0,0.35), 0 0 32px ${borderColor}`,
        fontFamily: brand.fonts.body,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {avatar && (
          <Img
            src={avatar}
            style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }}
          />
        )}
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontWeight: brand.weights.bold,
              fontSize: 32,
              color: brand.colors.secondary,
            }}
          >
            {name}
          </div>
          {metric && (
            <div
              style={{
                fontWeight: brand.weights.semibold,
                fontSize: 22,
                color: brand.colors.accent,
                marginTop: 4,
              }}
            >
              {metric}
            </div>
          )}
        </div>
      </div>
      {/* Text */}
      <div
        style={{
          fontSize: 28,
          lineHeight: 1.4,
          color: brand.colors.secondary,
          fontWeight: brand.weights.medium,
        }}
      >
        “{text}”
      </div>
    </div>
  );
};
