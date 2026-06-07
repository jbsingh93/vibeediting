import React from 'react';
import {
  AbsoluteFill,
  Img,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';
import { useBrand } from './BrandContext';

/**
 * Animated quote / testimonial card. 8s duration typical.
 * Avatar scale-pops in → quote glyph → quote text word-by-word → attribution.
 *
 * Usage:
 *   <Sequence durationInFrames={240}>
 *     <QuoteCard
 *       quote="This workflow cut my edit time in half."
 *       author="Jordan Lee"
 *       role="Indie Filmmaker"
 *       avatar={staticFile('testimonials/jordan-lee.jpg')}
 *     />
 *   </Sequence>
 */

type Props = {
  quote?: string;
  author?: string;
  role?: string;
  avatar?: string;
  brandColor?: string;
};

export const QuoteCard: React.FC<Props> = ({
  quote = 'This workflow cut my edit time in half.',
  author = 'Jordan Lee',
  role = 'Indie Filmmaker',
  avatar,
  brandColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const brand = useBrand();
  const accent = brandColor ?? brand.colors.accent;

  // Avatar scale-pop
  const avatarDriver = spring({
    frame,
    fps,
    config: { mass: 0.5, damping: 10, stiffness: 200 },
    durationInFrames: 14,
  });

  // Quote glyph scale-pop (delayed)
  const glyphDriver = spring({
    frame: frame - 4,
    fps,
    config: { mass: 0.4, damping: 10, stiffness: 220 },
    durationInFrames: 12,
  });

  // Quote text word-by-word
  const words = quote.split(' ');

  // Attribution slide up
  const attrDriver = spring({
    frame: frame - 60,
    fps,
    config: { damping: 18 },
    durationInFrames: 14,
  });
  const attrY = interpolate(attrDriver, [0, 1], [16, 0]);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${brand.colors.primary} 0%, ${accent}33 100%)`,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 80,
        flexDirection: 'column',
        gap: 40,
      }}
    >
      {avatar && (
        <Img
          src={avatar}
          style={{
            width: 120,
            height: 120,
            borderRadius: '50%',
            transform: `scale(${avatarDriver})`,
            border: `4px solid ${accent}`,
            objectFit: 'cover',
          }}
        />
      )}
      <div
        style={{
          fontFamily: brand.fonts.heading,
          fontSize: 88,
          color: accent,
          opacity: glyphDriver,
          lineHeight: 0.5,
          fontWeight: brand.weights.black,
        }}
      >
        “
      </div>
      <div
        style={{
          fontFamily: brand.fonts.heading,
          fontWeight: brand.weights.semibold,
          fontSize: 56,
          color: brand.colors.secondary,
          textAlign: 'center',
          lineHeight: 1.3,
          maxWidth: '85%',
          letterSpacing: '-0.01em',
        }}
      >
        {words.map((w, i) => {
          const wordFrame = frame - (12 + i * 6);
          const opacity = interpolate(
            wordFrame,
            [0, 8],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
          );
          return (
            <span key={i} style={{ opacity, marginRight: 14, display: 'inline-block' }}>
              {w}
            </span>
          );
        })}
      </div>
      <div
        style={{
          fontFamily: brand.fonts.body,
          fontWeight: brand.weights.medium,
          fontSize: 28,
          color: brand.colors.muted,
          textAlign: 'center',
          opacity: attrDriver,
          transform: `translateY(${attrY}px)`,
        }}
      >
        — <span style={{ color: brand.colors.secondary }}>{author}</span>
        {role ? `, ${role}` : ''}
      </div>
    </AbsoluteFill>
  );
};
