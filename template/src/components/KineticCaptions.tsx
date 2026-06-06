import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';
import { useBrand } from './BrandContext';
import type { Caption } from './captions';
import { makeEmphasisMatcher } from './captions';

/**
 * Hormozi-style word-by-word kinetic captions.
 * Reads Caption[] (from @remotion/captions parseSrt or Whisper output).
 * Each word scale-pops in synced to its spoken word boundary.
 * Emphasis words colored brand-yellow.
 *
 * Usage:
 *   import captions from '../../public/voiceovers/vo.captions.json';
 *   <KineticCaptions captions={captions} emphasisWords={["stop","AI","gratis"]} />
 */

export type { Caption };

type Props = {
  captions: Caption[];
  emphasisWords?: string[];
  fontSize?: number;
  justify?: 'flex-start' | 'center' | 'flex-end';
  paddingBottom?: number;
  paddingTop?: number;
};

export const KineticCaptions: React.FC<Props> = ({
  captions,
  emphasisWords = [],
  fontSize = 84,
  justify = 'center',
  paddingBottom = 0,
  paddingTop = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const brand = useBrand();
  const currentMs = (frame / fps) * 1000;

  // Show each word from just before it is spoken until just after it ends.
  const active = captions.filter(
    (c) => currentMs >= c.startMs - 100 && currentMs <= c.endMs + 200,
  );

  // Punctuation-insensitive emphasis match on BOTH sides (see makeEmphasisMatcher).
  const isEmphasis = makeEmphasisMatcher(emphasisWords);

  return (
    <AbsoluteFill
      style={{
        justifyContent: justify,
        alignItems: 'center',
        padding: '0 80px',
        paddingBottom,
        paddingTop,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: brand.fonts.heading,
          fontWeight: brand.weights.black,
          fontSize,
          lineHeight: 1.15,
          color: brand.colors.secondary,
          textShadow:
            '0 0 0 2px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.5)',
          WebkitTextStroke: '2px black',
          letterSpacing: '0.02em',
          wordSpacing: '0.2em',
          paintOrder: 'stroke fill',
          maxWidth: '100%',
        }}
      >
        {active.map((c, i) => {
          const wordStartFrame = Math.round((c.startMs / 1000) * fps);
          const wordFrame = Math.max(0, frame - wordStartFrame);
          const popScale = spring({
            frame: wordFrame,
            fps,
            config: { mass: 0.5, damping: 12, stiffness: 200 },
            durationInFrames: 8,
          });
          const opacity = interpolate(
            wordFrame,
            [0, 4],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
          );
          const emphasis = isEmphasis(c.text);
          return (
            <span
              key={`${c.startMs}-${i}`}
              style={{
                display: 'inline-block',
                transform: `scale(${popScale})`,
                opacity,
                color: emphasis ? brand.colors.accent : brand.colors.secondary,
                margin: '0 22px',
              }}
            >
              {c.text.trim()}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
