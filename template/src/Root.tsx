/**
 * Root — every composition in this project is registered here.
 * `vibe new-comp <Name>` scaffolds a composition folder and adds its
 * <Composition> entry automatically; you can also add them by hand.
 */
import React from 'react';
import { Composition } from 'remotion';
import { DemoWelcome } from './demo-welcome/Main';

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
    </>
  );
};
