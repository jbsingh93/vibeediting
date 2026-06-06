/**
 * `greenKeyGuard.ts` — palette guard for the `green-key-friendly` scene-clip mode
 * (plan P3.3b / GAP-56).
 *
 * When a Remotion scene is rendered for downstream chromakey (e.g. via `scene-clip-greenkey`
 * delivery preset), every brand-token color used by the scene MUST sit FAR from the chroma
 * background `#00FF00`. This module exposes:
 *
 *   - `hexToRgb(hex)`                 — robust 3/6/8-digit hex parser.
 *   - `isGreenKeyZone(hex, slack=25)` — true if `hex` is within `slack`% of #00FF00.
 *   - `assertGreenKeyFriendly(palette)` — throws on the first offending color.
 *
 * The "± 25%" rule (codified in CLAUDE.md): in the normalized RGB cube, any color whose
 * Euclidean distance to (0, 1, 0) is below 0.25 is rejected. That bans saturated greens
 * (lime, neon, key-color drift) AND dominant-green hues — the practical near-miss palette
 * that breaks a chromakey. The verifier's color specialist (GAP-45) re-asserts this on the
 * rendered frame at delivery; this guard catches it at compose time so the bad clip never
 * renders in the first place.
 */

export type RGB = { r: number; g: number; b: number };

const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function hexToRgb(hex: string): RGB {
  const m = HEX_RE.exec(hex.trim());
  if (!m) throw new Error(`greenKeyGuard: not a hex color: ${hex}`);
  const body = m[1];
  const expand = (s: string): number => parseInt(s.length === 1 ? s + s : s, 16);
  if (body.length === 3) return { r: expand(body[0]), g: expand(body[1]), b: expand(body[2]) };
  return { r: expand(body.slice(0, 2)), g: expand(body.slice(2, 4)), b: expand(body.slice(4, 6)) };
}

/** Normalized Euclidean distance to pure green (0, 1, 0). Range: 0 (pure green) to ~1.41. */
export function distanceToPureGreen(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const dr = r / 255 - 0;
  const dg = g / 255 - 1;
  const db = b / 255 - 0;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * True if `hex` falls inside the green-key danger zone (default ± 25% of the normalized RGB cube
 * around #00FF00). Lower `slack` is stricter.
 */
export function isGreenKeyZone(hex: string, slack = 25): boolean {
  return distanceToPureGreen(hex) < slack / 100;
}

export function assertGreenKeyFriendly(palette: ReadonlyArray<string>, slack = 25): void {
  for (const color of palette) {
    if (isGreenKeyZone(color, slack)) {
      throw new Error(
        `greenKeyGuard: palette entry ${color} is inside the #00FF00 ±${slack}% chroma-key danger zone. ` +
          `Pick a brand-token color far from green when rendering in 'green-key-friendly' mode (GAP-56).`,
      );
    }
  }
}
