/**
 * lib/edl-registry.ts — UIP4: per-project EDL editing defaults. The emphasis list + caption
 * layout an EDL project previews with. A prebuilt client can't know a user project's built-in
 * emphasis (that lives in their comp timelines), so every project gets the neutral defaults
 * here — agents and the inspector still drive emphasis per-doc. The REGISTRY map is the
 * extension point if a future build wants project-pinned defaults.
 */

export interface EdlDefaults {
  /** effective emphasis for a given segments doc (by basename, e.g. "short3.json"). */
  emphasis: (docName: string) => Promise<string[]>;
  captionFontSize: number;
  captionPaddingBottom: number;
}

const GENERIC: EdlDefaults = {
  emphasis: async () => [],
  captionFontSize: 68,
  captionPaddingBottom: 500,
};

const REGISTRY: Record<string, EdlDefaults> = {};

export function edlDefaults(project: string): EdlDefaults {
  return REGISTRY[project] ?? GENERIC;
}

/** captions doc basename for an EDL cap key ('' → captions.json, 'v1' → captions-v1.json). */
export function capFileName(capKey: string): string {
  return capKey ? `captions-${capKey}.json` : 'captions.json';
}

/** cap key for a captions doc basename (inverse of capFileName; null = not a captions doc). */
export function capKeyForFile(name: string): string | null {
  if (name === 'captions.json') return '';
  const m = name.match(/^captions-([a-z0-9_-]+)\.json$/i);
  return m ? m[1] ?? null : null;
}
