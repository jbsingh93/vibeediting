import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';
import { evolvePath } from '@remotion/paths';
import { useBrand } from './BrandContext';

/**
 * Animated checklist. Each item: text fade in → checkbox stroke-draw → checkmark scale-pop.
 * Items stagger 12 frames apart.
 *
 * Usage:
 *   <Checklist items={[
 *     "Write the script",
 *     "Record the voiceover",
 *     "Edit the cut",
 *     "Ship to production",
 *   ]} />
 */

const CHECK_PATH = 'M 6 14 L 12 20 L 26 6';

type Props = {
  items: string[];
  staggerFrames?: number;
  fontSize?: number;
  itemHeight?: number;
};

export const Checklist: React.FC<Props> = ({
  items,
  staggerFrames = 12,
  fontSize = 36,
  itemHeight = 80,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const brand = useBrand();

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: 100,
        background: brand.colors.primary,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {items.map((item, i) => {
          const itemStart = i * staggerFrames;
          const textOpacity = interpolate(
            frame - itemStart,
            [0, 6],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
          );
          const checkProgress = interpolate(
            frame - itemStart - 6,
            [0, 8],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
          );
          const { strokeDasharray, strokeDashoffset } = evolvePath(
            checkProgress,
            CHECK_PATH,
          );
          const boxScale = spring({
            frame: frame - itemStart - 14,
            fps,
            config: { mass: 0.4, damping: 10, stiffness: 220 },
            durationInFrames: 8,
          });

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 24,
                height: itemHeight,
                opacity: textOpacity,
              }}
            >
              {/* Checkbox */}
              <div
                style={{
                  width: 56,
                  height: 56,
                  border: `4px solid ${brand.colors.success}`,
                  borderRadius: 12,
                  position: 'relative',
                  transform: `scale(${boxScale})`,
                  background: checkProgress > 0.5
                    ? `${brand.colors.success}22`
                    : 'transparent',
                }}
              >
                <svg
                  width={32}
                  height={32}
                  viewBox="0 0 32 32"
                  style={{ position: 'absolute', top: 8, left: 8 }}
                >
                  <path
                    d={CHECK_PATH}
                    fill="none"
                    stroke={brand.colors.success}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                  />
                </svg>
              </div>
              {/* Item text */}
              <div
                style={{
                  fontFamily: brand.fonts.body,
                  fontWeight: brand.weights.semibold,
                  fontSize,
                  color: brand.colors.secondary,
                  letterSpacing: '-0.01em',
                }}
              >
                {item}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
