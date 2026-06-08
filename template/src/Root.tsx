/**
 * Root — every composition in this project is registered here.
 * `vibe new-comp <Name>` scaffolds a composition folder and adds its
 * <Composition> entry automatically; you can also add them by hand.
 */
import React from 'react';
import { Composition } from 'remotion';
import { DemoWelcome } from './demo-welcome/Main';
import { EdlTimeline, calculateEdlMetadata } from './EdlTimeline';

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="DemoWelcome"
        component={DemoWelcome}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
      {/* The light-NLE cut renderer (VE.4). Render with `--props '{"project":"<id>"}'`; fps,
          duration and size are derived from the project's segments.json by calculateMetadata. */}
      <Composition
        id="EdlTimeline"
        component={EdlTimeline}
        calculateMetadata={calculateEdlMetadata}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ project: 'demo' }}
      />
    </>
  );
};
