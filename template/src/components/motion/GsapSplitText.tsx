import React, { useRef } from 'react';
import { useVideoConfig } from 'remotion';
import { useGsapTimeline } from './useGsapTimeline';
import { useBrand } from '../BrandContext';

type Props = {
  text: string;
  /** Animation start time in seconds (default 0). */
  delaySec?: number;
  /** Stagger between units in seconds (default 0.04). */
  staggerSec?: number;
  /** What to animate (default 'chars'). */
  split?: 'chars' | 'words';
  /** Font size in px (default 96). */
  fontSize?: number;
  /** Optional color (default brand secondary). */
  color?: string;
};

/**
 * `GsapSplitText` — per-character/word reveal via GSAP, frame-seeked.
 *
 * Uses our hand-rolled split (Remotion render contexts do not always have the GreenSock
 * SplitText plugin's DOM timing guarantees; splitting in React is deterministic + font-safe
 * because the units are real spans before paint). The GSAP timeline still drives the actual
 * animation values, demonstrating the GAP-49 hook end-to-end.
 */
export const GsapSplitText: React.FC<Props> = ({
  text,
  delaySec = 0,
  staggerSec = 0.04,
  split = 'chars',
  fontSize = 96,
  color,
}) => {
  const scope = useRef<HTMLDivElement>(null);
  const { fps } = useVideoConfig();
  const brand = useBrand();

  const units =
    split === 'chars'
      ? Array.from(text).map((ch) => (ch === ' ' ? ' ' : ch))
      : text.split(/(\s+)/);

  useGsapTimeline(
    (tl) => {
      tl.from('.unit', {
        autoAlpha: 0,
        y: 60,
        rotation: -8,
        duration: 12 / fps,
        ease: 'back.out(1.7)',
        stagger: staggerSec,
      }, delaySec);
    },
    scope,
  );

  return (
    <div
      ref={scope}
      style={{
        display: 'inline-block',
        fontFamily: brand.fonts.heading,
        fontWeight: brand.weights.black,
        fontSize,
        color: color ?? brand.colors.secondary,
        lineHeight: 1.1,
        letterSpacing: '0.01em',
      }}
    >
      {units.map((u, i) => (
        <span
          key={i}
          className="unit"
          style={{ display: 'inline-block', willChange: 'transform, opacity' }}
        >
          {u}
        </span>
      ))}
    </div>
  );
};
