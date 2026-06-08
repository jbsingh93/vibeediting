/** UIP3.1 — pure asset-manager helpers (unit-tested). */
import type { AssetCategory, AssetInfo } from './types';

/** The doc-05 §1 category tabs, in order (UIP6.6: audio split into VO/Music/SFX; the `audio`
 *  fallback tab is honest "uncategorized audio" and renders ONLY when non-empty). */
export const ASSET_TABS: { id: AssetCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'footage', label: 'Footage' },
  { id: 'vo', label: 'VO' },
  { id: 'music', label: 'Music' },
  { id: 'sfx', label: 'SFX' },
  { id: 'audio', label: 'Audio' },
  { id: 'captions', label: 'Captions' },
  { id: 'lut', label: 'LUTs' },
  { id: 'image', label: 'Images' },
  { id: 'data', label: 'Data' },
];

/** Tabs to actually render: `audio` (the uncategorized fallback) only when it has assets. */
export function visibleTabs(counts: Record<string, number>): { id: AssetCategory | 'all'; label: string }[] {
  return ASSET_TABS.filter((t) => t.id !== 'audio' || (counts.audio ?? 0) > 0);
}

export const CATEGORY_GLYPH: Record<AssetCategory, string> = {
  footage: '▣',
  vo: '🎙',
  music: '♪',
  sfx: '✦',
  audio: '♪',
  captions: '{}',
  lut: '◧',
  image: '▦',
  data: '⧉',
  other: '·',
};

/** Every category that holds audio files (the FineTune audio picker + asset actions). */
export const AUDIO_CATEGORIES: ReadonlySet<AssetCategory> = new Set(['vo', 'music', 'sfx', 'audio']);

export function filterAssets(assets: AssetInfo[], tab: AssetCategory | 'all'): AssetInfo[] {
  if (tab === 'all') return assets;
  return assets.filter((a) => a.category === tab);
}

/** Count per tab, used for the tab badges ("Footage 3"). */
export function tabCounts(assets: AssetInfo[]): Record<string, number> {
  const counts: Record<string, number> = { all: assets.length };
  for (const a of assets) counts[a.category] = (counts[a.category] ?? 0) + 1;
  return counts;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** "2d ago" style relative time for tile metadata (matches the doc-05 wireframe). */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Short sha for the provenance badge ("sha256 0a3f…"). */
export function shortSha(sha?: string): string | null {
  if (!sha || sha.length < 8) return null;
  return `${sha.slice(0, 8)}…`;
}

/** Host of an acquired-from URL ("youtube.com") for the badge. */
export function urlHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * UIP6.12/6.13 — the servable URL for an asset, mapped onto the read-only static mounts the
 * server exposes (repo `public/` at `/`, `out/work/` at `/work/`, `test-video/` at `/deliver/`).
 * Pure → unit-tested.
 */
export function assetUrl(a: Pick<AssetInfo, 'relPath'>): string | null {
  const rel = a.relPath.replace(/\\/g, '/');
  const encode = (s: string) => s.split('/').map(encodeURIComponent).join('/');
  if (rel.startsWith('public/')) return '/' + encode(rel.slice('public/'.length));
  if (rel.startsWith('out/work/')) return '/work/' + encode(rel.slice('out/work/'.length));
  if (rel.startsWith('test-video/')) return '/deliver/' + encode(rel.slice('test-video/'.length));
  return null;
}

/**
 * The EDL segment `src` (public-rooted, like `staticFile()` takes) for a footage asset — the
 * `relPath` with the leading `public/` stripped (VE.3.3). A clip that isn't under `public/` keeps
 * its path verbatim and will read as missing (`srcExists` ⚠) until it is copied into `public/`.
 */
export function assetToSegmentSrc(a: Pick<AssetInfo, 'relPath'>): string {
  return a.relPath.replace(/\\/g, '/').replace(/^public\//, '');
}

/** Final path segment of a relPath, for compact pill/label text. */
export function assetBasename(relPath: string): string {
  return relPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? relPath;
}

/** What an inline preview should mount for this asset (null = not previewable). */
export function previewKind(a: Pick<AssetInfo, 'category'>): 'video' | 'audio' | 'image' | null {
  if (a.category === 'footage') return 'video';
  if (AUDIO_CATEGORIES.has(a.category)) return 'audio';
  if (a.category === 'image') return 'image';
  return null;
}

/** Which whitelisted actions apply to an asset (probe / transcribe / make-proxy — UIP3.1).
 *  UIP6.6: any audio category (vo/music/sfx/audio) gets the audio actions. */
export function assetActions(a: AssetInfo): ('probe' | 'transcribe' | 'proxy')[] {
  if (a.category === 'footage') return ['probe', 'transcribe', 'proxy'];
  if (AUDIO_CATEGORIES.has(a.category)) return ['probe', 'transcribe'];
  return [];
}
