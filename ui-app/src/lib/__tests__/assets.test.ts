/**
 * Ported from the parent UI-P3/P6 pure suites (p3-pure.test.ts asset helpers + p6-pure.test.ts
 * audio split / tabs / actions / urls). Server-side categorizeAsset lives in the engine, so the
 * categorization rules are exercised through the client surface the lib actually owns.
 */
import { describe, it, expect } from 'vitest';
import {
  filterAssets,
  tabCounts,
  formatBytes,
  timeAgo,
  shortSha,
  urlHost,
  assetActions,
  visibleTabs,
  AUDIO_CATEGORIES,
  assetUrl,
  previewKind,
} from '../assets';
import type { AssetInfo } from '../types';

function asset(partial: Partial<AssetInfo>): AssetInfo {
  return {
    name: 'x.mp4',
    relPath: 'public/p/x.mp4',
    absPath: 'C:/repo/public/p/x.mp4',
    category: 'footage',
    origin: 'public',
    bytes: 1024,
    mtime: new Date().toISOString(),
    ...partial,
  };
}

describe('asset tile helpers', () => {
  it('filters by tab and counts per category', () => {
    const list = [asset({}), asset({ category: 'audio', name: 'a.mp3' }), asset({ category: 'audio', name: 'b.mp3' })];
    expect(filterAssets(list, 'all')).toHaveLength(3);
    expect(filterAssets(list, 'audio')).toHaveLength(2);
    expect(tabCounts(list)).toMatchObject({ all: 3, footage: 1, audio: 2 });
  });

  it('formats bytes + relative time + sha + host', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(22 * 1024 * 1024)).toBe('22.0 MB');
    expect(formatBytes(-1)).toBe('—');
    const now = Date.now();
    expect(timeAgo(new Date(now - 2 * 86400_000).toISOString(), now)).toBe('2d ago');
    expect(timeAgo(new Date(now - 30_000).toISOString(), now)).toBe('just now');
    expect(shortSha('0a3f5c7e9b1d')).toBe('0a3f5c7e…');
    expect(shortSha(undefined)).toBeNull();
    expect(urlHost('https://www.youtube.com/watch?v=x')).toBe('youtube.com');
  });

  it('offers exactly the whitelisted actions per category (probe/transcribe/proxy)', () => {
    expect(assetActions(asset({}))).toEqual(['probe', 'transcribe', 'proxy']);
    expect(assetActions(asset({ category: 'audio' }))).toEqual(['probe', 'transcribe']);
    expect(assetActions(asset({ category: 'captions' }))).toEqual([]);
    expect(assetActions(asset({ category: 'lut' }))).toEqual([]);
  });
});

describe('split client surface (tabs / actions)', () => {
  it('the `audio` fallback tab renders ONLY when non-empty', () => {
    const withoutAudio = visibleTabs(tabCounts([asset({ category: 'vo' }), asset({ category: 'music' })]));
    expect(withoutAudio.map((t) => t.id)).not.toContain('audio');
    const withAudio = visibleTabs(tabCounts([asset({ category: 'audio' })]));
    expect(withAudio.map((t) => t.id)).toContain('audio');
    expect(withoutAudio.map((t) => t.id)).toEqual(['all', 'footage', 'vo', 'music', 'sfx', 'captions', 'lut', 'image', 'data']);
  });

  it('every audio category gets the audio actions (probe/transcribe)', () => {
    for (const c of ['vo', 'music', 'sfx', 'audio'] as const) {
      expect(AUDIO_CATEGORIES.has(c)).toBe(true);
      expect(assetActions(asset({ category: c }))).toEqual(['probe', 'transcribe']);
    }
    expect(assetActions(asset({ category: 'footage' }))).toEqual(['probe', 'transcribe', 'proxy']);
  });

  it('assetUrl maps onto the three served mounts (incl. /deliver for refs)', () => {
    expect(assetUrl({ relPath: 'public/p/bgm-bed.wav' })).toBe('/p/bgm-bed.wav');
    expect(assetUrl({ relPath: 'public/p/min lyd.mp3' })).toBe('/p/min%20lyd.mp3');
    expect(assetUrl({ relPath: 'out/work/p/motion/clip-v1.mp4' })).toBe('/work/p/motion/clip-v1.mp4');
    expect(assetUrl({ relPath: 'test-video/p/refs/competitor.mp4' })).toBe('/deliver/p/refs/competitor.mp4');
    expect(assetUrl({ relPath: 'src/p/Comp.tsx' })).toBeNull();
  });

  it('previewKind: footage→video, any audio→audio, image→image, else none', () => {
    expect(previewKind({ category: 'footage' })).toBe('video');
    expect(previewKind({ category: 'vo' })).toBe('audio');
    expect(previewKind({ category: 'music' })).toBe('audio');
    expect(previewKind({ category: 'image' })).toBe('image');
    expect(previewKind({ category: 'captions' })).toBeNull();
    expect(previewKind({ category: 'data' })).toBeNull();
  });
});
