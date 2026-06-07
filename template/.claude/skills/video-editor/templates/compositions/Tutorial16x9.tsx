/**
 * Skeleton — copy into src/compositions/<your-comp>/Main.tsx (or scaffold with `vibe new-comp`),
 * then register in src/Root.tsx.
 *
 * Long-form tutorial composition — 16:9, 5-30 min.
 * Structure: Intro → Chapters (with B-roll + lower-thirds) → Outro.
 * Uses TransitionSeries between chapters.
 *
 * Components are imported by name from the project's canonical barrel at src/components/.
 * Colors come from useBrand() tokens — your brand.json colors.
 */

import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  OffthreadVideo,
  staticFile,
  useVideoConfig,
} from 'remotion';
import { TransitionSeries, springTiming } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import { z } from 'zod';
import { BrandContext, useBrand, LogoSting, LowerThird } from '../../components';

// ---- Schema ----

const chapterSchema = z.object({
  id: z.string(),
  title: z.string(),
  durationFrames: z.number(),
  brollSrc: z.string().optional(),
  showSpeakerLowerThird: z.boolean().default(false),
});

export const tutorialSchema = z.object({
  title: z.string(),
  speakerName: z.string(),
  speakerTitle: z.string(),
  intro: z.object({
    durationFrames: z.number(),
    hookText: z.string(),
  }),
  chapters: z.array(chapterSchema),
  outro: z.object({
    durationFrames: z.number(),
    ctaText: z.string(),
  }),
  primarySrc: z.string().optional(),    // main talking-head footage
});

export type TutorialProps = z.infer<typeof tutorialSchema>;

// ---- Sub-scene placeholders (replace with real content per video) ----

const IntroScene: React.FC<{ hookText: string }> = ({ hookText }) => {
  const brand = useBrand();
  return (
    <AbsoluteFill style={{ background: brand.colors.primary, justifyContent: 'center', alignItems: 'center', padding: 80 }}>
      <h1 style={{ color: brand.colors.secondary, fontSize: 96, fontFamily: brand.fonts.heading, fontWeight: brand.weights.black, textAlign: 'center', margin: 0 }}>
        {hookText}
      </h1>
    </AbsoluteFill>
  );
};

const ChapterScene: React.FC<{
  index: number;
  title: string;
  brollSrc?: string;
  speakerName?: string;
  speakerTitle?: string;
  showLowerThird?: boolean;
}> = ({ index, title, brollSrc, speakerName, speakerTitle, showLowerThird }) => {
  const { fps } = useVideoConfig();
  const brand = useBrand();
  return (
    <AbsoluteFill style={{ background: brand.colors.primary }}>
      {brollSrc && (
        <AbsoluteFill>
          <OffthreadVideo src={staticFile(brollSrc)} />
        </AbsoluteFill>
      )}
      {/* Chapter card flash at start */}
      <Sequence from={0} durationInFrames={fps * 1.5} name={`Chapter ${index} card`}>
        <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'flex-start', padding: 80 }}>
          <div style={{ background: 'rgba(0,0,0,0.7)', padding: '24px 32px', borderRadius: 12, borderLeft: `6px solid ${brand.colors.accent}` }}>
            <div style={{ color: brand.colors.accent, fontFamily: brand.fonts.heading, fontSize: 24, fontWeight: brand.weights.semibold }}>
              CHAPTER {index}
            </div>
            <div style={{ color: brand.colors.secondary, fontFamily: brand.fonts.heading, fontSize: 40, fontWeight: brand.weights.black, marginTop: 4 }}>
              {title}
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>
      {/* Lower-third for speaker (5-11s) */}
      {showLowerThird && speakerName && (
        <Sequence from={fps * 5} durationInFrames={fps * 6} name="Lower-third">
          <LowerThird title={speakerName} subtitle={speakerTitle ?? ''} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

const OutroScene: React.FC<{ ctaText: string }> = ({ ctaText }) => {
  const brand = useBrand();
  return (
    <AbsoluteFill style={{ background: brand.colors.primary, justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 48, padding: 80 }}>
      <div style={{ color: brand.colors.secondary, fontFamily: brand.fonts.heading, fontSize: 56, fontWeight: brand.weights.bold, textAlign: 'center' }}>
        Thanks for watching
      </div>
      <div style={{ background: brand.colors.accent, color: brand.colors.primary, padding: '32px 64px', borderRadius: 999, fontFamily: brand.fonts.heading, fontSize: 48, fontWeight: brand.weights.bold }}>
        {ctaText}
      </div>
    </AbsoluteFill>
  );
};

// ---- Main composition ----

export const Tutorial16x9: React.FC<TutorialProps> = ({
  title,
  speakerName,
  speakerTitle,
  intro,
  chapters,
  outro,
}) => {
  return (
    <BrandContext>
      <TransitionSeries>
        {/* Intro logo sting (3s) */}
        <TransitionSeries.Sequence durationInFrames={75}>
          <LogoSting title={title} tagline="Real results, real workflows" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: 'from-right' })}
          timing={springTiming({ config: { damping: 30 }, durationInFrames: 18, durationRestThreshold: 0.001 })}
        />

        {/* Intro hook scene */}
        <TransitionSeries.Sequence durationInFrames={intro.durationFrames}>
          <IntroScene hookText={intro.hookText} />
        </TransitionSeries.Sequence>

        {/* Chapters */}
        {chapters.map((c, i) => (
          <React.Fragment key={c.id}>
            <TransitionSeries.Transition
              presentation={slide({ direction: 'from-right' })}
              timing={springTiming({ config: { damping: 30 }, durationInFrames: 18, durationRestThreshold: 0.001 })}
            />
            <TransitionSeries.Sequence durationInFrames={c.durationFrames}>
              <ChapterScene
                index={i + 1}
                title={c.title}
                brollSrc={c.brollSrc}
                speakerName={speakerName}
                speakerTitle={speakerTitle}
                showLowerThird={c.showSpeakerLowerThird}
              />
            </TransitionSeries.Sequence>
          </React.Fragment>
        ))}

        {/* Outro */}
        <TransitionSeries.Transition
          presentation={slide({ direction: 'from-right' })}
          timing={springTiming({ config: { damping: 30 }, durationInFrames: 18, durationRestThreshold: 0.001 })}
        />
        <TransitionSeries.Sequence durationInFrames={outro.durationFrames}>
          <OutroScene ctaText={outro.ctaText} />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      {/* Audio: a render-time pass may layer VO+music here, OR finalize audio downstream */}
    </BrandContext>
  );
};

export const tutorialDefaultProps: TutorialProps = {
  title: 'How to Build an AI Agent in 20 Minutes',
  speakerName: 'Alex Morgan',
  speakerTitle: 'Founder, Acme Studio',
  intro: {
    durationFrames: 90 * 30,    // 90s intro
    hookText: 'Today we build an AI agent in 20 minutes',
  },
  chapters: [
    { id: 'setup', title: 'Setting up the environment', durationFrames: 180 * 30, showSpeakerLowerThird: true },
    { id: 'build', title: 'Building the agent', durationFrames: 360 * 30, showSpeakerLowerThird: false },
    { id: 'deploy', title: 'Deploying to production', durationFrames: 240 * 30, showSpeakerLowerThird: false },
  ],
  outro: {
    durationFrames: 60 * 30,
    ctaText: 'Subscribe for more',
  },
};
