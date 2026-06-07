/**
 * UIP2.6 — the comp registry: compId → a lazy loader returning everything the inline
 * `@remotion/player` needs (component + fps/size/duration/defaultProps).
 *
 * NOTE: a prebuilt client (ships in ui-dist/) can NEVER bundle the user's own compositions —
 * those live in the scaffolded project and are only known at the user's build time. The
 * data-driven FineTunePreview is therefore the real editing surface; the demo composition here
 * exists to prove the Player path works out of the box. The one entry below mirrors the template
 * payload's registration in template/src/Root.tsx (id "DemoWelcome").
 *
 * The loader pattern + LoadedComp interface are kept identical to the parent so PreviewPlayer and
 * the FineTune comp-preview toggle work unchanged. Every comp loads LAZILY (dynamic import) so the
 * cockpit bundle stays light; metadata is pinned to the template's <Composition> registration.
 */
import type { ComponentType } from 'react';
import { COMP_IDS, type CompId } from './comp-ids';

export interface LoadedComp {
  component: ComponentType<Record<string, unknown>>;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  defaultProps?: Record<string, unknown>;
}

type Loader = () => Promise<LoadedComp>;

const comp = (c: unknown): ComponentType<Record<string, unknown>> => c as ComponentType<Record<string, unknown>>;

export const COMP_LOADERS: Record<CompId, Loader> = {
  // The template's media-free demo composition. The Vite config allows importing from the
  // template/ payload (server.fs.allow); the path is relative to ui-app/src/lib/. Metadata is
  // pinned to template/src/Root.tsx: 30 fps, 1920×1080, 150 frames, no props schema.
  DemoWelcome: async () => {
    const c = await import('../../../template/src/demo-welcome/Main');
    return {
      component: comp(c.DemoWelcome),
      fps: 30,
      width: 1920,
      height: 1080,
      durationInFrames: 150,
      defaultProps: {},
    };
  },
};

export { COMP_IDS };
export type { CompId };
