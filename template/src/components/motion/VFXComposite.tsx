import React from 'react';
import { AbsoluteFill, OffthreadVideo, Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { useBrand } from '../BrandContext';
import { SafeZone, type SafeRegion } from './SafeZone';

/**
 * `VFXComposite` — the canonical Remotion template for layering a generated/composited VFX clip
 * over a base plate (plan P4V.10; HV §7–8; VX §3.1).
 *
 * Layer order (back → front):
 *   1) base — the live-action plate (OffthreadVideo) cropped to fill.
 *   2) screenBlend — black-bg VFX (Seedance mood/textural) blended with `mixBlendMode:'screen'`.
 *   3) alphaOverlay — ProRes 4444 / VP9 yuva alpha overlay (Veo/Aleph or 3D PNG sequence).
 *   4) chromakey — overlay clip whose key color is removed (paired upstream by `assemble/chromakey`).
 *   5) title — 2D text/safe-zone aware overlay inside `SafeZone` (right-rail 16:9 default).
 *
 * Every layer is OPTIONAL. The template is plain props-driven so the planner emits one composition
 * config and the renderer assembles. Frame-driven — Remotion HARD RULE (GAP-46).
 */

export interface VFXLayerSpec {
  /** Path under `public/` for staticFile, OR an absolute http(s):// for OffthreadVideo. */
  src: string;
  /** Optional frame range — defaults to the whole composition. */
  from?: number;
  durationInFrames?: number;
}

export interface VFXTitleSpec {
  text: string;
  color?: string;
  fontSize?: number;
  safeRegion?: SafeRegion;
  /** Optional explicit translation (px). Default: nothing. */
  x?: number;
  y?: number;
}

export interface VFXCompositeProps {
  base: VFXLayerSpec;
  /** Black-bg VFX (Seedance mood) → mixBlendMode:'screen' (no chromakey needed). */
  screenBlend?: VFXLayerSpec;
  /** ProRes 4444 / VP9 yuva — alpha plane survives end-to-end. */
  alphaOverlay?: VFXLayerSpec;
  /** Chromakey overlay — the key color must be removed UPSTREAM by `assemble/chromakey` (this layer expects RGBA). */
  chromakeyOverlay?: VFXLayerSpec;
  /** Optional 2D title rendered inside the SafeZone (right-rail 16:9 default). */
  title?: VFXTitleSpec;
}

function resolveSrc(spec: VFXLayerSpec): string {
  if (/^https?:\/\//.test(spec.src) || spec.src.startsWith('data:')) return spec.src;
  return staticFile(spec.src);
}

export const VFXComposite: React.FC<VFXCompositeProps> = ({
  base,
  screenBlend,
  alphaOverlay,
  chromakeyOverlay,
  title,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const brand = useBrand();

  const showLayer = (layer?: VFXLayerSpec): boolean => {
    if (!layer) return false;
    const from = layer.from ?? 0;
    const dur = layer.durationInFrames ?? Number.MAX_SAFE_INTEGER;
    return frame >= from && frame < from + dur;
  };

  return (
    <AbsoluteFill>
      <OffthreadVideo
        src={resolveSrc(base)}
        style={{ width, height, objectFit: 'cover' }}
      />
      {showLayer(screenBlend) && screenBlend ? (
        <AbsoluteFill style={{ mixBlendMode: 'screen' }}>
          <OffthreadVideo src={resolveSrc(screenBlend)} style={{ width, height, objectFit: 'cover' }} muted />
        </AbsoluteFill>
      ) : null}
      {showLayer(alphaOverlay) && alphaOverlay ? (
        <AbsoluteFill>
          <OffthreadVideo src={resolveSrc(alphaOverlay)} style={{ width, height, objectFit: 'cover' }} muted />
        </AbsoluteFill>
      ) : null}
      {showLayer(chromakeyOverlay) && chromakeyOverlay ? (
        <AbsoluteFill>
          <OffthreadVideo src={resolveSrc(chromakeyOverlay)} style={{ width, height, objectFit: 'cover' }} muted />
        </AbsoluteFill>
      ) : null}
      {title ? (
        <SafeZone safeRegion={title.safeRegion}>
          <div
            style={{
              fontSize: title.fontSize ?? 64,
              color: title.color ?? brand.colors.accent,
              fontWeight: 800,
              fontFamily: 'Inter, system-ui, sans-serif',
              textShadow: '0 2px 6px rgba(0,0,0,0.45)',
              transform: title.x || title.y ? `translate(${title.x ?? 0}px, ${title.y ?? 0}px)` : undefined,
            }}
          >
            {title.text}
          </div>
        </SafeZone>
      ) : null}
    </AbsoluteFill>
  );
};

/** Image-overlay variant for static PNG-RGBA assets (3D Blender frames, generated stills). */
export const VFXImageOverlay: React.FC<{ src: string; opacity?: number }> = ({ src, opacity = 1 }) => {
  const resolved = /^https?:\/\//.test(src) ? src : staticFile(src);
  return (
    <AbsoluteFill>
      <Img src={resolved} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity }} />
    </AbsoluteFill>
  );
};
