/**
 * DemoWelcome — the template's media-free demo composition.
 *
 * Renders out of the box (no assets, no API keys) and proves the brand system +
 * motion atoms work together; the test suite's render gate targets it. Safe to
 * delete once you have your own compositions — deregister it in src/Root.tsx.
 */
import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { BrandContext, useBrand } from '../components';
import { PopText, FadeInOut, CTAButton, ConfettiBurst } from '../components/motion';

const Scene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const brand = useBrand();

  // Subtle background drift so even a still at frame 30 is visibly "alive".
  const glow = interpolate(frame, [0, durationInFrames], [0.35, 0.65]);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 90% at 50% 10%, ${brand.colors.primary} 55%, #000 100%)`,
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: brand.fonts.body,
      }}
    >
      {/* accent glow behind the title */}
      <div
        style={{
          position: 'absolute',
          width: 900,
          height: 900,
          borderRadius: '50%',
          background: brand.colors.accent,
          opacity: 0.12 * glow,
          filter: 'blur(120px)',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 42 }}>
        <FadeInOut inStart={4} inDuration={10} translateY={24}>
          <div
            style={{
              color: brand.colors.muted,
              fontSize: 28,
              letterSpacing: '0.35em',
              textTransform: 'uppercase',
              fontWeight: brand.weights.semibold,
              textAlign: 'center',
            }}
          >
            JBS Vibe Editing
          </div>
        </FadeInOut>

        <PopText text="Your studio is ready." delay={12} fontSize={110} background={null} color={brand.colors.secondary} stroke={0} />

        <FadeInOut inStart={30} inDuration={12} translateY={16}>
          <div
            style={{
              color: brand.colors.muted,
              fontSize: 34,
              fontWeight: brand.weights.medium,
              textAlign: 'center',
              maxWidth: 980,
              lineHeight: 1.45,
            }}
          >
            Talk to the agent, and this project turns briefs into finished videos —
            captions, audio mastering, color, QA and delivery included.
          </div>
        </FadeInOut>

        <FadeInOut inStart={52} inDuration={10}>
          <CTAButton text="Make your first video" delay={52} arrow="right" fontSize={44} />
        </FadeInOut>
      </div>

      {/* a short celebratory burst once everything is on screen */}
      <Sequence from={64}>
        <ConfettiBurst />
      </Sequence>
    </AbsoluteFill>
  );
};

export const DemoWelcome: React.FC = () => (
  <BrandContext>
    <Scene />
  </BrandContext>
);
