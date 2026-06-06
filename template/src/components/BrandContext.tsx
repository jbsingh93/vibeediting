import React, { createContext, useContext } from 'react';

/**
 * Brand tokens. Single source of truth for colors, fonts, weights — the values come
 * from YOUR `brand/brand.json` (edit it in the UI's Brand page or by hand); these
 * defaults are a neutral dark theme so everything renders fine before you brand it.
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

const BrandCtx = createContext<Brand>(BRAND_DEFAULT);

export const BrandContext: React.FC<{
  brand?: Partial<Brand>;
  children: React.ReactNode;
}> = ({ brand, children }) => {
  const merged: Brand = brand
    ? {
        ...BRAND_DEFAULT,
        ...brand,
        colors: { ...BRAND_DEFAULT.colors, ...(brand.colors ?? {}) },
        fonts: { ...BRAND_DEFAULT.fonts, ...(brand.fonts ?? {}) },
        weights: { ...BRAND_DEFAULT.weights, ...(brand.weights ?? {}) },
        logo: { ...BRAND_DEFAULT.logo, ...(brand.logo ?? {}) },
      }
    : BRAND_DEFAULT;

  return <BrandCtx.Provider value={merged}>{children}</BrandCtx.Provider>;
};

export const useBrand = () => useContext(BrandCtx);
