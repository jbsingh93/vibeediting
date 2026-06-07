/**
 * Skeleton — copy into src/compositions/<your-comp>/Main.tsx (or scaffold with `vibe new-comp`),
 * then register in src/Root.tsx.
 *
 * Short paid ad composition — 9:16, 30s typical.
 * Structure: Hook → Body → CTA, with safe-zone aware overlays.
 *
 * Components are imported by name from the project's canonical barrel at src/components/.
 * Do NOT copy components into this folder — compose them by name.
 */

import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  Audio,
  OffthreadVideo,
  staticFile,
  useVideoConfig,
  interpolate,
} from 'remotion';
import { z } from 'zod';
import { zColor } from '@remotion/zod-types';
import {
  BrandContext,
  SafeZone,
  HookText,
  KineticCaptions,
  CTAButton,
  type Caption,
} from '../../components';

// ---- Schema (typed props) ----

export const shortAdSchema = z.object({
  hookText: z.string().max(80),
  ctaText: z.string().max(30),
  brandColor: zColor(),
  footageSrc: z.string().optional(),     // public/raw/...mp4
  voiceoverSrc: z.string(),              // public/voiceovers/...mp3
  bgmSrc: z.string().optional(),         // public/music/...mp3
  captionsSrc: z.string().optional(),    // public/voiceovers/...captions.json (path string)
  emphasisWords: z.array(z.string()),
  platform: z.enum(['tiktok', 'reels', 'shorts', 'universal']),
});

export type ShortAdProps = z.infer<typeof shortAdSchema>;

// ---- Composition ----

export const ShortAd9x16: React.FC<ShortAdProps> = ({
  hookText,
  ctaText,
  brandColor,
  footageSrc,
  voiceoverSrc,
  bgmSrc,
  captionsSrc,
  emphasisWords,
  // `platform` is part of the contract (drives your safe-zone/caption choices) — read it
  // where you tune layout per platform.
}) => {
  const { fps, durationInFrames } = useVideoConfig();

  const HOOK_LEN = 3 * fps;            // 0-3s hook
  const CTA_LEN = 4 * fps;             // last 4s CTA
  const CTA_START = durationInFrames - CTA_LEN;

  // Captions are loaded from public via fetch in real usage; for skeleton we accept inline
  const captions: Caption[] = captionsSrc
    ? // In real composition, import the JSON statically:
      // import captions from '../../../public/voiceovers/<name>.captions.json';
      []
    : [];

  return (
    <BrandContext brand={{ colors: { accent: brandColor } }}>
      <AbsoluteFill style={{ backgroundColor: '#0E0E11' }}>
        {/* Layer 1: Footage (if provided) */}
        {footageSrc && (
          <AbsoluteFill>
            <OffthreadVideo src={staticFile(footageSrc)} muted />
          </AbsoluteFill>
        )}

        {/* Layer 2: Vignette for caption legibility */}
        <AbsoluteFill
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.6) 100%)',
          }}
        />

        {/* Layer 3: Hook (first 3s) */}
        <Sequence from={0} durationInFrames={HOOK_LEN} name="Hook">
          <HookText text={hookText} emphasizeLastWord />
        </Sequence>

        {/* Layer 4: Kinetic captions (after hook, before CTA) — constrained to the safe region */}
        {captions.length > 0 && (
          <Sequence
            from={HOOK_LEN}
            durationInFrames={CTA_START - HOOK_LEN}
            name="Body captions"
          >
            <SafeZone>
              <KineticCaptions
                captions={captions}
                emphasisWords={emphasisWords}
              />
            </SafeZone>
          </Sequence>
        )}

        {/* Layer 5: CTA (last 4s) */}
        <Sequence from={CTA_START} durationInFrames={CTA_LEN} name="CTA">
          <AbsoluteFill
            style={{ justifyContent: 'flex-end', alignItems: 'center', padding: '0 80px 200px' }}
          >
            <CTAButton text={ctaText} />
          </AbsoluteFill>
        </Sequence>

        {/* Audio: voiceover */}
        <Audio src={staticFile(voiceoverSrc)} />

        {/* Audio: background music with fade in/out */}
        {bgmSrc && (
          <Audio
            src={staticFile(bgmSrc)}
            volume={(f) =>
              interpolate(
                f,
                [0, 30, durationInFrames - 30, durationInFrames],
                [0, 0.22, 0.22, 0],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
              )
            }
          />
        )}
      </AbsoluteFill>
    </BrandContext>
  );
};

// ---- Default props ----

export const shortAdDefaultProps: ShortAdProps = {
  hookText: 'Your editing workflow is obsolete.',
  ctaText: 'Start creating today',
  brandColor: '#4E9CFF',
  footageSrc: undefined,
  voiceoverSrc: 'voiceovers/launch-vo.mp3',
  bgmSrc: undefined,
  captionsSrc: undefined,
  emphasisWords: ['stop', 'now', 'today', 'free', 'secret', 'AI'],
  platform: 'universal',
};
