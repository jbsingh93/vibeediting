import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, random } from 'remotion';
import { useBrand } from '../BrandContext';

/**
 * `ConfettiBurst` — a radial confetti explosion from screen center.
 *
 * Determinism: every particle's geometry is derived from Remotion's seeded `random()`
 * (NOT `Math.random()`), so the burst is byte-identical across re-renders — required for
 * frame-accurate video. The palette is pulled from the brand tokens
 * ([accent, secondary, success, danger]) so it always lands on-brand.
 */

type Particle = {
  seed: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  rotate: number;
  rotateEnd: number;
  size: number;
  hue: 'accent' | 'secondary' | 'success' | 'danger';
  delay: number;
  duration: number;
  shape: 'rect' | 'circle' | 'star';
};

const COUNT = 120;

export const ConfettiBurst: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const brand = useBrand();

  const colors: Record<Particle['hue'], string> = {
    accent: brand.colors.accent,
    secondary: brand.colors.secondary,
    success: brand.colors.success,
    danger: brand.colors.danger,
  };

  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: COUNT }, (_, i) => {
      const seed = i / COUNT;
      const angle = random(`a${i}`) * Math.PI * 2;
      const distance = 400 + random(`d${i}`) * 700;
      const sx = width / 2;
      const sy = height / 2 + 60;
      const ex = sx + Math.cos(angle) * distance;
      const ey = sy + Math.sin(angle) * distance + 600 * random(`g${i}`);
      const hueRoll = random(`h${i}`);
      const hue: Particle['hue'] = hueRoll < 0.55 ? 'accent' : hueRoll < 0.85 ? 'secondary' : hueRoll < 0.95 ? 'success' : 'danger';
      const shapeRoll = random(`s${i}`);
      const shape: Particle['shape'] = shapeRoll < 0.55 ? 'rect' : shapeRoll < 0.85 ? 'circle' : 'star';
      return {
        seed,
        startX: sx,
        startY: sy,
        endX: ex,
        endY: ey,
        rotate: random(`r${i}`) * 360,
        rotateEnd: (random(`r${i}`) - 0.5) * 1080,
        size: 14 + random(`sz${i}`) * 22,
        hue,
        delay: random(`del${i}`) * 0.4,
        duration: 1.6 + random(`dur${i}`) * 1.0,
        shape,
      };
    });
  }, [width, height]);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      {particles.map((p, i) => {
        const t0 = p.delay * fps;
        const t1 = t0 + p.duration * fps;
        const t = interpolate(frame, [t0, t1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const ease = 1 - Math.pow(1 - t, 3);
        const x = interpolate(ease, [0, 1], [p.startX, p.endX]);
        const y = interpolate(ease, [0, 1], [p.startY, p.endY]);
        const rot = interpolate(ease, [0, 1], [p.rotate, p.rotate + p.rotateEnd]);
        const opacity = interpolate(t, [0, 0.05, 0.85, 1], [0, 1, 1, 0]);
        const color = colors[p.hue];
        const common: React.CSSProperties = {
          position: 'absolute',
          left: x - p.size / 2,
          top: y - p.size / 2,
          width: p.size,
          height: p.size,
          transform: `rotate(${rot}deg)`,
          opacity,
        };
        if (p.shape === 'rect') {
          return <div key={i} style={{ ...common, background: color, borderRadius: 2 }} />;
        }
        if (p.shape === 'circle') {
          return <div key={i} style={{ ...common, background: color, borderRadius: '50%' }} />;
        }
        return (
          <div key={i} style={{ ...common, color, fontSize: p.size, lineHeight: `${p.size}px`, textAlign: 'center' }}>
            ★
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
