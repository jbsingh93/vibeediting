import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

type Props = {
  /** Target value at the end of the count. */
  to: number;
  /** Start value (default 0). */
  from?: number;
  /** Frames the count takes (default 0.9s at the comp fps). */
  durationInFrames?: number;
  /** Start frame (default 0). */
  startFrame?: number;
  /** `toLocaleString` locale (default 'en-US'). */
  locale?: string;
  /** Pre/post text wrapping the number. */
  prefix?: string;
  suffix?: string;
  style?: React.CSSProperties;
};

/**
 * `CountUp` — animates an integer counter from `from` → `to` over a frame window. Replaces
 * the ad-hoc `Math.round(interpolate(frame, [0, fps*0.9], [0, 5000]))` in `FollowersBadge`.
 */
export const CountUp: React.FC<Props> = ({
  to,
  from = 0,
  durationInFrames,
  startFrame = 0,
  locale = 'en-US',
  prefix = '',
  suffix = '',
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = durationInFrames ?? Math.round(fps * 0.9);
  const v = Math.round(
    interpolate(frame, [startFrame, startFrame + dur], [from, to], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', ...style }}>
      {prefix}
      {v.toLocaleString(locale)}
      {suffix}
    </span>
  );
};
