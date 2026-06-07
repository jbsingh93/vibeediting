import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  Easing,
} from 'remotion';
import { useBrand } from './BrandContext';

/**
 * Animated horizontal bar chart.
 * Bars grow from left with stagger; values count up synchronized.
 *
 * Per-bar `color` is optional — omit it to fall back to the brand accent. Pass an
 * explicit hex only when you deliberately want an off-brand bar.
 *
 * Usage:
 *   <BarChart
 *     bars={[
 *       { label: 'North',  value: 1200 },
 *       { label: 'South',  value: 850 },
 *     ]}
 *     max={1500}
 *     title="Sales per region — 2026"
 *   />
 */

export type Bar = {
  label: string;
  value: number;
  color?: string;
};

type Props = {
  bars: Bar[];
  max: number;
  title?: string;
  formatValue?: (v: number) => string;
  barHeight?: number;
  staggerFrames?: number;
};

export const BarChart: React.FC<Props> = ({
  bars,
  max,
  title,
  formatValue = (v) => v.toLocaleString('en-US'),
  barHeight = 56,
  staggerFrames = 6,
}) => {
  const frame = useCurrentFrame();
  const brand = useBrand();

  const containerWidth = 1100;

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        padding: 80,
        background: brand.colors.primary,
      }}
    >
      <div style={{ width: containerWidth }}>
        {title && (
          <div
            style={{
              fontFamily: brand.fonts.heading,
              fontWeight: brand.weights.bold,
              fontSize: 48,
              color: brand.colors.secondary,
              marginBottom: 48,
            }}
          >
            {title}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {bars.map((bar, i) => {
            const barFrame = frame - i * staggerFrames;
            const widthPx = interpolate(
              barFrame,
              [0, 24],
              [0, (bar.value / max) * 700],
              {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.out(Easing.cubic),
              },
            );
            const value = Math.round(
              interpolate(barFrame, [0, 24], [0, bar.value], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
            );
            return (
              <div
                key={bar.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  height: barHeight,
                }}
              >
                <div
                  style={{
                    width: 240,
                    fontFamily: brand.fonts.body,
                    fontWeight: brand.weights.medium,
                    fontSize: 28,
                    color: brand.colors.secondary,
                    textAlign: 'right',
                  }}
                >
                  {bar.label}
                </div>
                <div
                  style={{
                    width: widthPx,
                    height: barHeight - 16,
                    background: bar.color ?? brand.colors.accent,
                    borderRadius: 8,
                  }}
                />
                <div
                  style={{
                    fontFamily: brand.fonts.heading,
                    fontWeight: brand.weights.bold,
                    fontSize: 32,
                    color: brand.colors.secondary,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatValue(value)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
