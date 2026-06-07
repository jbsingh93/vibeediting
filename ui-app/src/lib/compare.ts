/**
 * lib/compare.ts — UIP5.3: pure helpers for the version-compare wipe. Picks the two sides from a
 * stage's versions[] (approved/active vs the newest other fork), maps their on-disk output paths
 * to the URLs the server actually serves (/work/* ← out/work, /* ← public/), and holds the wipe +
 * playback-sync math. No DOM here — unit-tested.
 */
import type { VersionRecord } from './types';

export interface CompareSide {
  v: number;
  approved: boolean;
  /** the version's first video output (as recorded on the manifest), null when it has none */
  output: string | null;
  /** servable URL for that output, null when it lives outside the served roots */
  url: string | null;
}

const VIDEO_RE = /\.(mp4|mov|webm|m4v)$/i;

/** First video file among a version's outputs. */
export function videoOutput(outputs: string[]): string | null {
  return outputs.find((o) => VIDEO_RE.test(o)) ?? null;
}

/**
 * Map an output path (absolute or repo-relative, either slash style) onto the server's static
 * mounts: out/work/** → /work/**, public/** → /**. Anything else (e.g. test-video/) isn't served —
 * return null and let the UI show the honest "not servable" placeholder.
 */
export function mediaUrl(p: string | null): string | null {
  if (!p) return null;
  const norm = p.replace(/\\/g, '/');
  const work = norm.match(/(?:^|\/)out\/work\/(.+)$/);
  if (work) return `/work/${(work[1] ?? '').split('/').map(encodeURIComponent).join('/')}`;
  const pub = norm.match(/(?:^|\/)public\/(.+)$/);
  if (pub) return `/${(pub[1] ?? '').split('/').map(encodeURIComponent).join('/')}`;
  return null;
}

/**
 * The two sides of the wipe: A = the approved (active) version, else v1; B = the newest version
 * that isn't A. Needs ≥2 versions — otherwise there is nothing to compare.
 */
export function comparePair(versions: VersionRecord[]): { a: CompareSide; b: CompareSide } | null {
  if (versions.length < 2) return null;
  const sorted = [...versions].sort((x, y) => x.v - y.v);
  const active = sorted.find((r) => r.approved) ?? sorted[0]!;
  const rest = sorted.filter((r) => r.v !== active.v);
  const other = rest[rest.length - 1];
  if (!other) return null;
  const side = (r: VersionRecord): CompareSide => {
    const output = videoOutput(r.outputs);
    return { v: r.v, approved: r.approved, output, url: mediaUrl(output) };
  };
  return { a: side(active), b: side(other) };
}

/** Wipe position clamp — keep a sliver of both sides visible so the divider can't get lost. */
export function clampWipe(pct: number): number {
  return Math.min(97, Math.max(3, pct));
}

/**
 * Playback drift correction: returns the time follower should snap to, or null when within
 * tolerance. 80 ms ≈ 2 frames at 25fps — under that, a seek would stutter more than it fixes.
 */
export function driftCorrection(leaderSec: number, followerSec: number, toleranceSec = 0.08): number | null {
  return Math.abs(leaderSec - followerSec) > toleranceSec ? leaderSec : null;
}
