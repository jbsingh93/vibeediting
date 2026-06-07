import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { createTikTokStyleCaptions } from '@remotion/captions';
import { useBrand } from './BrandContext';
import type { Caption } from './KineticCaptions';

/**
 * TikTok-style page-flip karaoke captions.
 * Words within `combineWindowMs` group into a single page.
 * Inactive tokens dimmed; active token highlighted brand-color.
 *
 * Less chaotic than per-word Hormozi style. Better for B2B/educational content.
 */

type Props = {
  captions: Caption[];
  fontSize?: number;
  combineWindowMs?: number;
  highlightColor?: string;
  inactiveColor?: string;
};

export const TikTokCaptions: React.FC<Props> = ({
  captions,
  fontSize = 72,
  combineWindowMs = 1200,
  highlightColor,
  inactiveColor = 'rgba(255,255,255,0.4)',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const brand = useBrand();
  const currentMs = (frame / fps) * 1000;

  const { pages } = createTikTokStyleCaptions({
    captions,
    combineTokensWithinMilliseconds: combineWindowMs,
  });

  const activePage = pages.find(
    (p) => currentMs >= p.startMs && currentMs < p.startMs + p.durationMs,
  );
  if (!activePage) return null;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 80px' }}>
      <div
        style={{
          fontFamily: brand.fonts.heading,
          fontWeight: brand.weights.black,
          fontSize,
          color: brand.colors.secondary,
          textAlign: 'center',
          lineHeight: 1.2,
          textShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}
      >
        {activePage.tokens.map((t, i) => {
          const tokenActive = currentMs >= t.fromMs;
          return (
            <span
              key={i}
              style={{
                color: tokenActive ? (highlightColor ?? brand.colors.accent) : inactiveColor,
              }}
            >
              {t.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
