import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';

type Props = {
  /** Fade-in start frame (default 0). */
  inStart?: number;
  /** Frames for the fade-in (default 8). */
  inDuration?: number;
  /** Fade-out start frame. If omitted, no fade-out. */
  outStart?: number;
  /** Frames for the fade-out (default 8). */
  outDuration?: number;
  /** Optional translateY in px at frame 0 (eased out by `inDuration`). */
  translateY?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
};

/**
 * `FadeInOut` — composable opacity envelope. Wraps `children` in a div that fades in (and
 * optionally out) using `interpolate` — the workhorse for any overlay enter/exit.
 */
export const FadeInOut: React.FC<Props> = ({
  inStart = 0,
  inDuration = 8,
  outStart,
  outDuration = 8,
  translateY = 0,
  children,
  style,
}) => {
  const frame = useCurrentFrame();
  const opacityIn = interpolate(frame, [inStart, inStart + inDuration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacityOut =
    outStart === undefined
      ? 1
      : interpolate(frame, [outStart, outStart + outDuration], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
  const opacity = opacityIn * opacityOut;
  const ty = interpolate(opacityIn, [0, 1], [translateY, 0]);

  return (
    <div style={{ opacity, transform: `translateY(${ty}px)`, ...style }}>{children}</div>
  );
};
