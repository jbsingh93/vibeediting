import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';

type Props = {
  /** Cycles per second (default 2.4). */
  frequency?: number;
  /** Peak amplitude in px (default 6). */
  amplitude?: number;
  /** Axis to wiggle on (default 'y'). */
  axis?: 'x' | 'y' | 'rotate';
  children: React.ReactNode;
  style?: React.CSSProperties;
};

/**
 * `Wiggle` — deterministic sine wiggle on x, y, or rotation. Replaces ad-hoc
 * `Math.sin(frame / N) * k` calls (the arrow bob in `PulseRing`, the CTA arrow in `OutroCard`).
 */
export const Wiggle: React.FC<Props> = ({
  frequency = 2.4,
  amplitude = 6,
  axis = 'y',
  children,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const v = Math.sin((frame / fps) * Math.PI * 2 * frequency) * amplitude;
  const transform =
    axis === 'rotate' ? `rotate(${v}deg)` : axis === 'x' ? `translateX(${v}px)` : `translateY(${v}px)`;
  return <div style={{ transform, ...style }}>{children}</div>;
};
