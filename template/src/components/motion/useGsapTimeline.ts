import { useRef } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

gsap.registerPlugin(useGSAP);

/**
 * The single safe entry point for GSAP inside Remotion (plan P3.3 / GAP-49).
 *
 * Build a PAUSED timeline once via `useGSAP` (auto-reverted on unmount, selectors scoped),
 * then `seek(frame / fps)` on every render so the timeline is in perfect lockstep with the
 * frame-driven render. Timeline seconds == video seconds.
 *
 * HARD RULE — never `.play()` / `.pause()` / `.reverse()` in a render; only `.seek()`.
 * See `capabilities/motion/GSAP-IN-REMOTION.md` for the full rationale + gotchas.
 */
export function useGsapTimeline(
  build: (tl: gsap.core.Timeline) => void,
  scope: React.RefObject<HTMLElement | null>,
): React.MutableRefObject<gsap.core.Timeline | null> {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tl = useRef<gsap.core.Timeline | null>(null);

  useGSAP(
    () => {
      tl.current = gsap.timeline({ paused: true });
      build(tl.current);
    },
    { scope },
  );

  tl.current?.seek(frame / fps);
  return tl;
}

/**
 * Variant: stretch a built timeline across the full comp duration. Use when you want the
 * timeline's progress to map 0→1 across `durationInFrames`, not match real seconds.
 */
export function useGsapTimelineProgress(
  build: (tl: gsap.core.Timeline) => void,
  scope: React.RefObject<HTMLElement | null>,
): React.MutableRefObject<gsap.core.Timeline | null> {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const tl = useRef<gsap.core.Timeline | null>(null);

  useGSAP(
    () => {
      tl.current = gsap.timeline({ paused: true });
      build(tl.current);
    },
    { scope },
  );

  if (tl.current && durationInFrames > 1) {
    tl.current.progress(frame / (durationInFrames - 1));
  }
  return tl;
}
