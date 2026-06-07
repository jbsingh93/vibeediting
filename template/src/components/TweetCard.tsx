import React from 'react';
import {
  Img,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';
import { useBrand } from './BrandContext';

/**
 * Animated tweet card. Card scale-pops in → body fades → engagement counters tick up.
 *
 * Usage:
 *   <TweetCard
 *     avatar={staticFile('testimonials/avatar.jpg')}
 *     name="Your Brand"
 *     handle="@yourbrand"
 *     verified
 *     text="We just shipped something we're really proud of."
 *     likes={342}
 *     retweets={48}
 *   />
 */

type Props = {
  avatar?: string;
  name?: string;
  handle?: string;
  verified?: boolean;
  text?: string;
  image?: string;
  likes?: number;
  retweets?: number;
  replies?: number;
  background?: string;
};

export const TweetCard: React.FC<Props> = ({
  avatar,
  name = 'Your Brand',
  handle = '@yourbrand',
  verified = false,
  text = "We just shipped something we're really proud of.",
  image,
  likes = 0,
  retweets = 0,
  replies = 0,
  background,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const brand = useBrand();

  const cardDriver = spring({
    frame,
    fps,
    config: { mass: 0.6, damping: 12, stiffness: 180 },
    durationInFrames: 12,
  });
  const cardScale = interpolate(cardDriver, [0, 1], [0.85, 1]);
  const cardOpacity = cardDriver;

  const textOpacity = interpolate(
    frame,
    [6, 18],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const counterFrame = frame - 24;
  const likesNow = Math.round(
    interpolate(counterFrame, [0, 24], [0, likes], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
  const retweetsNow = Math.round(
    interpolate(counterFrame, [0, 24], [0, retweets], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
  const repliesNow = Math.round(
    interpolate(counterFrame, [0, 24], [0, replies], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );

  return (
    <div
      style={{
        background: background ?? '#16181C',
        color: '#E7E9EA',
        borderRadius: 24,
        padding: 32,
        maxWidth: 720,
        width: '85%',
        opacity: cardOpacity,
        transform: `scale(${cardScale})`,
        boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
        fontFamily: brand.fonts.body,
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        {avatar && (
          <Img
            src={avatar}
            style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }}
          />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: brand.weights.bold, fontSize: 22 }}>{name}</span>
            {verified && (
              <span style={{ color: '#1D9BF0', fontSize: 22 }}>✓</span>
            )}
          </div>
          <div style={{ color: '#71767B', fontSize: 18 }}>{handle}</div>
        </div>
      </div>
      {/* Body */}
      <div
        style={{
          fontSize: 30,
          lineHeight: 1.35,
          opacity: textOpacity,
          marginBottom: 24,
        }}
      >
        {text}
      </div>
      {image && (
        <Img
          src={image}
          style={{
            width: '100%',
            borderRadius: 16,
            marginBottom: 16,
            opacity: textOpacity,
          }}
        />
      )}
      {/* Engagement */}
      <div
        style={{
          display: 'flex',
          gap: 48,
          fontSize: 18,
          color: '#71767B',
          paddingTop: 16,
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <span>💬 {repliesNow}</span>
        <span>🔁 {retweetsNow}</span>
        <span>♥ {likesNow}</span>
      </div>
    </div>
  );
};
