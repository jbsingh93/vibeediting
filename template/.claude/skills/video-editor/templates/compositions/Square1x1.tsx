/**
 * Skeleton — copy into src/compositions/<your-comp>/Main.tsx (or scaffold with `vibe new-comp`),
 * then register in src/Root.tsx.
 *
 * Square (1:1) composition for Instagram feed / LinkedIn feed.
 * Same structure as ShortAd9x16 but with center-safe layout.
 *
 * Components are imported by name from the project's canonical barrel at src/components/.
 */

import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  Audio,
  staticFile,
  useVideoConfig,
} from 'remotion';
import { z } from 'zod';
import { zColor } from '@remotion/zod-types';
import { BrandContext, HookText, CTAButton } from '../../components';

export const squareSchema = z.object({
  hookText: z.string(),
  ctaText: z.string(),
  brandColor: zColor(),
  voiceoverSrc: z.string(),
});

export type SquareProps = z.infer<typeof squareSchema>;

export const Square1x1: React.FC<SquareProps> = ({
  hookText,
  ctaText,
  brandColor,
  voiceoverSrc,
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  const HOOK_LEN = 3 * fps;
  const CTA_LEN = 4 * fps;
  const CTA_START = durationInFrames - CTA_LEN;

  return (
    <BrandContext brand={{ colors: { accent: brandColor } }}>
      <AbsoluteFill style={{ background: '#0E0E11' }}>
        <Sequence from={0} durationInFrames={HOOK_LEN} name="Hook">
          <HookText text={hookText} emphasizeLastWord />
        </Sequence>

        <Sequence from={CTA_START} durationInFrames={CTA_LEN} name="CTA">
          <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', padding: 80 }}>
            <CTAButton text={ctaText} />
          </AbsoluteFill>
        </Sequence>

        <Audio src={staticFile(voiceoverSrc)} />
      </AbsoluteFill>
    </BrandContext>
  );
};

export const squareDefaultProps: SquareProps = {
  hookText: 'Your editing workflow is obsolete.',
  ctaText: 'Start creating today',
  brandColor: '#4E9CFF',
  voiceoverSrc: 'voiceovers/square-vo.mp3',
};
