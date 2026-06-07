import React, { createContext, useContext } from 'react';
import brandConfig from '../../brand/brand.json';
import fontsConfig from '../../brand/fonts.json';

/**
 * Brand tokens. Single source of truth for colors, fonts, weights — the values come
 * from YOUR `brand/brand.json` + `brand/fonts.json` (edit them in the UI's Brand page,
 * by hand, or let the agent fill them in). They are bundled at build time; the
 * neutral defaults below cover any key you haven't set yet.
 *
 * Wrap your composition root in <BrandContext> so every component reads consistent values.
 *
 * Usage:
 *   <BrandContext>
 *     <YourScenes />
 *   </BrandContext>
 *
 *   const brand = useBrand();
 *   <div style={{ color: brand.colors.accent }} />
 */

export type Brand = {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    success: string;
    danger: string;
    muted: string;
  };
  fonts: {
    heading: string;
    body: string;
    mono: string;
  };
  weights: {
    regular: number;
    medium: number;
    semibold: number;
    bold: number;
    black: number;
  };
  scale: number[];
  logo: {
    light: string;
    dark: string;
  };
};

/** Neutral dark-theme defaults — overridden by brand/brand.json via the provider. */
export const BRAND_DEFAULT: Brand = {
  colors: {
    primary: '#101014',
    secondary: '#FFFFFF',
    accent: '#4E9CFF',
    success: '#00C2A8',
    danger: '#FF4757',
    muted: '#888888',
  },
  fonts: {
    heading: '"Inter", "Helvetica Neue", sans-serif',
    body: '"Inter", "Helvetica Neue", sans-serif',
    mono: '"JetBrains Mono", "Cascadia Code", monospace',
  },
  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    black: 900,
  },
  scale: [16, 20, 25, 31, 39, 49, 61, 76, 95, 119],
  logo: {
    light: '/logos/logo-light.svg',
    dark: '/logos/logo-dark.svg',
  },
};

/** Merge a partial brand over a base, depth-1 per token group. */
const mergeBrand = (base: Brand, over: Partial<Brand>): Brand => ({
  ...base,
  ...over,
  colors: { ...base.colors, ...(over.colors ?? {}) },
  fonts: { ...base.fonts, ...(over.fonts ?? {}) },
  weights: { ...base.weights, ...(over.weights ?? {}) },
  logo: { ...base.logo, ...(over.logo ?? {}) },
});

/** Pick a string off a loosely-typed config object (brand.json carries _comment keys etc.). */
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/**
 * Map brand/brand.json + brand/fonts.json onto the visual Brand tokens.
 * Tolerant by design: any missing/empty key falls back to the neutral default,
 * so a half-filled brand.json renders fine.
 */
export function brandFromConfig(config: unknown, fonts: unknown): Brand {
  const cfg = (config ?? {}) as { colors?: Record<string, unknown>; logoPath?: unknown };
  const fnt = (fonts ?? {}) as { heading?: unknown; body?: unknown; mono?: unknown; weights?: Record<string, unknown>; scale?: unknown };
  const colors = cfg.colors ?? {};
  const weights = fnt.weights ?? {};
  const scale = Array.isArray(fnt.scale) && fnt.scale.every((n) => typeof n === 'number') ? (fnt.scale as number[]) : BRAND_DEFAULT.scale;
  const logoPath = str(cfg.logoPath);
  return mergeBrand(BRAND_DEFAULT, {
    colors: {
      primary: str(colors.primary) ?? BRAND_DEFAULT.colors.primary,
      secondary: str(colors.secondary) ?? BRAND_DEFAULT.colors.secondary,
      accent: str(colors.accent) ?? BRAND_DEFAULT.colors.accent,
      success: str(colors.success) ?? BRAND_DEFAULT.colors.success,
      danger: str(colors.danger) ?? BRAND_DEFAULT.colors.danger,
      muted: str(colors.muted) ?? BRAND_DEFAULT.colors.muted,
    },
    fonts: {
      heading: str(fnt.heading) ?? BRAND_DEFAULT.fonts.heading,
      body: str(fnt.body) ?? BRAND_DEFAULT.fonts.body,
      mono: str(fnt.mono) ?? BRAND_DEFAULT.fonts.mono,
    },
    weights: {
      regular: num(weights.regular) ?? BRAND_DEFAULT.weights.regular,
      medium: num(weights.medium) ?? BRAND_DEFAULT.weights.medium,
      semibold: num(weights.semibold) ?? BRAND_DEFAULT.weights.semibold,
      bold: num(weights.bold) ?? BRAND_DEFAULT.weights.bold,
      black: num(weights.black) ?? BRAND_DEFAULT.weights.black,
    },
    scale,
    logo: logoPath ? { light: logoPath, dark: logoPath } : BRAND_DEFAULT.logo,
  });
}

/** The project's brand — brand/brand.json + brand/fonts.json over the neutral defaults. */
export const PROJECT_BRAND: Brand = brandFromConfig(brandConfig, fontsConfig);

const BrandCtx = createContext<Brand>(PROJECT_BRAND);

export const BrandContext: React.FC<{
  /** Per-composition override (rare) — merged over the project brand. */
  brand?: Partial<Brand>;
  children: React.ReactNode;
}> = ({ brand, children }) => {
  const merged: Brand = brand ? mergeBrand(PROJECT_BRAND, brand) : PROJECT_BRAND;
  return <BrandCtx.Provider value={merged}>{children}</BrandCtx.Provider>;
};

export const useBrand = () => useContext(BrandCtx);
