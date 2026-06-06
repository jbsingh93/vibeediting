import React from 'react';
import { useVideoConfig } from 'remotion';
import { linearTiming, springTiming, TransitionSeries, type TransitionPresentation } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';

export type TransitionKind = 'fade' | 'slide' | 'wipe' | 'none';

export type TransitionScene = {
  /** Scene duration in frames (not counting the inbound transition). */
  durationInFrames: number;
  /** What kind of transition INTO this scene (the first scene's transition is ignored). */
  transition?: TransitionKind;
  /** Transition duration in frames (default fps / 3 ≈ 200ms). */
  transitionDuration?: number;
  /** Use a spring timing instead of linear for the transition (default true). */
  spring?: boolean;
  content: React.ReactNode;
  name?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const presentation = (kind: TransitionKind): TransitionPresentation<any> | null => {
  switch (kind) {
    case 'fade':
      return fade();
    case 'slide':
      return slide();
    case 'wipe':
      return wipe();
    case 'none':
      return null;
  }
};

/**
 * `TransitionScenes` — thin wrapper over `@remotion/transitions` `TransitionSeries` that
 * makes scene-to-scene cuts with crossfade / slide / wipe and **`springTiming`** the default
 * (per the consensus rule cited in plan P3.4 / RESEARCH/00 INDEX). Use over hand-rolled
 * `interpolate` opacity envelopes when you want a clean, named transition between scenes.
 *
 * Frame contract is unchanged: every animation is frame-driven via `useCurrentFrame()` inside
 * the underlying primitives. (Tailwind `animate-*` / CSS `transition` are still forbidden.)
 */
export const TransitionScenes: React.FC<{ scenes: TransitionScene[] }> = ({ scenes }) => {
  const { fps } = useVideoConfig();
  return (
    <TransitionSeries>
      {scenes.map((scene, i) => {
        const isFirst = i === 0;
        const kind = scene.transition ?? 'fade';
        const pres = isFirst ? null : presentation(kind);
        const dur = scene.transitionDuration ?? Math.round(fps / 3);
        const timing =
          scene.spring === false
            ? linearTiming({ durationInFrames: dur })
            : springTiming({ durationInFrames: dur, config: { damping: 200 } });
        return (
          <React.Fragment key={i}>
            {pres ? <TransitionSeries.Transition timing={timing} presentation={pres} /> : null}
            <TransitionSeries.Sequence durationInFrames={scene.durationInFrames}>
              {scene.content}
            </TransitionSeries.Sequence>
          </React.Fragment>
        );
      })}
    </TransitionSeries>
  );
};
