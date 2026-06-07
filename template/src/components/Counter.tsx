import React from 'react';
import {
  useCurrentFrame,
  interpolate,
  Easing,
} from 'remotion';
import { useBrand } from './BrandContext';

/**
 * Count-up number animation.
 * Linear-ish interpolation with cubic ease-out for "settling" feel.
 *
 * Usage:
 *   <Counter target={10000} prefix="$" suffix="+" />
 *   <Counter target={47} suffix=" leads" duration={36} />
 *   <Counter target={1234567} format="en-US" />  // locale-grouped
 */

type Props = {
  target: number;
  prefix?: string;
  suffix?: string;
  duration?: number; // frames (default: 36 = 1.2s @ 30fps)
  fontSize?: number;
  color?: string;
  format?: 'en-US' | 'plain';
  fontWeight?: number;
};

export const Counter: React.FC<Props> = ({
  target,
  prefix = '',
  suffix = '',
  duration = 36,
  fontSize = 200,
  color,
  format = 'en-US',
  fontWeight,
}) => {
  const frame = useCurrentFrame();
  const brand = useBrand();

  const value = Math.round(
    interpolate(frame, [0, duration], [0, target], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }),
  );

  const formatted =
    format === 'plain' ? String(value) : value.toLocaleString('en-US');

  return (
    <div
      style={{
        fontFamily: brand.fonts.heading,
        fontWeight: fontWeight ?? brand.weights.black,
        fontSize,
        color: color ?? brand.colors.accent,
        letterSpacing: '-0.03em',
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {prefix}
      {formatted}
      {suffix}
    </div>
  );
};
