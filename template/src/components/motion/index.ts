/**
 * `src/components/motion/` — the single canonical home for the motion atoms.
 *
 * Styles compose these by NAME + PROPS — never copy them into their own folders.
 * Renaming/refactoring an atom is therefore a one-file change that ripples through every style.
 *
 * GSAP-powered atoms (`GsapSplitText`, `useGsapTimeline`) follow the GAP-49 frame-seeked rule —
 * see `capabilities/motion/GSAP-IN-REMOTION.md`.
 */
export { PopText } from './PopText';
export { FadeInOut } from './FadeInOut';
export { Wiggle } from './Wiggle';
export { CountUp } from './CountUp';
export { LowerThird } from './LowerThird';
export { CTAButton } from './CTAButton';
export { LogoSting } from './LogoSting';
export { SafeZone, defaultSafeRegion } from './SafeZone';
export type { SafeRegion } from './SafeZone';
export { SceneClip } from './SceneClip';
export type { SceneBackground } from './SceneClip';
export { hexToRgb, distanceToPureGreen, isGreenKeyZone, assertGreenKeyFriendly } from './greenKeyGuard';
export { GsapSplitText } from './GsapSplitText';
export { useGsapTimeline, useGsapTimelineProgress } from './useGsapTimeline';
export { TransitionScenes } from './TransitionScenes';
export type { TransitionKind, TransitionScene } from './TransitionScenes';
export { VFXComposite, VFXImageOverlay } from './VFXComposite';
export type { VFXCompositeProps, VFXLayerSpec, VFXTitleSpec } from './VFXComposite';
