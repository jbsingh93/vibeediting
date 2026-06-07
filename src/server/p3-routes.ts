/**
 * src/server/p3-routes.ts — Asset Manager + Acquire.
 *
 *   GET  /api/projects/:id/assets        → asset tiles over public/<p>/ + deliver/<p>/refs/ + out/work/<p>/
 *   GET  /api/projects/:id/style-specs   → parsed *.style-spec.json cards (reference-analyze output)
 *   POST /api/acquire                    → enqueue a whitelisted acquire job (page/asset/media/mimic)
 *
 * Everything spawned goes through the jobs.ts whitelists (no generic shell-exec); the UI never
 * writes provenance — it only renders what the capabilities logged.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { projectDir, projectsRoot, publicDir, deliverDir, workDir } from './context.js';
import { enqueueJob, PARENT_OUTPUT_TOKEN, type JobSpec } from './jobs.js';

// ── assets (audio split into vo/music/sfx) ───────────────────────────────────────

export type AssetCategory =
  | 'footage'
  | 'vo'
  | 'music'
  | 'sfx'
  | 'audio' // honest "uncategorized audio" fallback — its tab renders only when non-empty
  | 'captions'
  | 'lut'
  | 'image'
  | 'data'
  | 'other';
export type AssetOrigin = 'public' | 'refs' | 'work';

export const ASSET_CATEGORIES: AssetCategory[] = [
  'footage',
  'vo',
  'music',
  'sfx',
  'audio',
  'captions',
  'lut',
  'image',
  'data',
  'other',
];

export interface AcquiredBadge {
  sourceUrl: string;
  tool: string;
  fetchedAt: string;
  sha256?: string;
}

export interface AssetInfo {
  name: string;
  /** project-relative, forward slashes — the path the tile shows. */
  relPath: string;
  absPath: string;
  category: AssetCategory;
  origin: AssetOrigin;
  bytes: number;
  mtime: string;
  acquired?: AcquiredBadge;
}

/** Filename-keyword heuristics over the house naming (vo-* / bgm-* / sfx-*). Extensions can't
 *  distinguish a voiceover from a whoosh; the keyword pass can. No match → `audio` fallback. */
const VO_RE = /(^|[-_.])(vo|voice|voiceover|tts)([-_.]|$)/i;
const MUSIC_RE = /(^|[-_.])(bgm|music|bed|track|song|score)([-_.]|$)/i;
const SFX_RE = /(^|[-_.])(sfx|whoosh|tick|riser|impact|swoosh|pop|click)([-_.]|$)/i;

/** Classify an asset by filename (pure → unit-tested). Captions/segments JSON beat generic data;
 *  audio extensions get the keyword pass (vo/music/sfx, fallback `audio`). */
export function categorizeAsset(name: string): AssetCategory {
  const ext = path.extname(name).toLowerCase();
  if (['.mp4', '.mov', '.webm', '.mkv', '.m4v', '.avi'].includes(ext)) return 'footage';
  if (['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'].includes(ext)) {
    const base = name.slice(0, -ext.length);
    if (VO_RE.test(base)) return 'vo';
    if (MUSIC_RE.test(base)) return 'music';
    if (SFX_RE.test(base)) return 'sfx';
    return 'audio';
  }
  if (ext === '.json') {
    return /caption|segment|transcript|words/i.test(name) ? 'captions' : 'data';
  }
  if (ext === '.cube') return 'lut';
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext)) return 'image';
  if (['.srt', '.vtt'].includes(ext)) return 'captions';
  return 'other';
}

const MAX_SCAN_DEPTH = 3;

function walkAssets(root: string, origin: AssetOrigin, out: AssetInfo[], depth = 0): void {
  if (depth > MAX_SCAN_DEPTH || !fs.existsSync(root)) return;
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const abs = path.join(root, e.name);
    if (e.isDirectory()) {
      // skip private dirs + the spine's metadata (budget/gen-cache live in orchestrate/, not assets)
      if (e.name.startsWith('_') || e.name === 'node_modules' || e.name === 'orchestrate') continue;
      walkAssets(abs, origin, out, depth + 1);
      continue;
    }
    if (!e.isFile()) continue;
    if (/\.(verify|council)\.json$/i.test(e.name) || e.name === 'provenance.json' || e.name === 'provenance.log') continue;
    let st: fs.Stats;
    try {
      st = fs.statSync(abs);
    } catch {
      continue; // raced delete
    }
    out.push({
      name: e.name,
      relPath: path.relative(projectDir(), abs).split(path.sep).join('/'),
      absPath: abs,
      category: categorizeAsset(e.name),
      origin,
      bytes: st.size,
      mtime: new Date(st.mtimeMs).toISOString(),
    });
  }
}

/** Acquire provenance (out/work/<p>/acquire/provenance.json — a JSON array) → badge map by path. */
export function readAcquireBadges(project: string): Map<string, AcquiredBadge> {
  const map = new Map<string, AcquiredBadge>();
  const p = path.join(workDir(), project, 'acquire', 'provenance.json');
  if (!fs.existsSync(p)) return map;
  try {
    const arr = JSON.parse(fs.readFileSync(p, 'utf8')) as {
      sourceUrl?: string;
      localPath?: string;
      tool?: string;
      fetchedAt?: string;
      sha256?: string;
    }[];
    if (!Array.isArray(arr)) return map;
    for (const rec of arr) {
      if (!rec || typeof rec.localPath !== 'string' || typeof rec.sourceUrl !== 'string') continue;
      map.set(path.resolve(rec.localPath), {
        sourceUrl: rec.sourceUrl,
        tool: rec.tool ?? 'acquire',
        fetchedAt: rec.fetchedAt ?? '',
        sha256: rec.sha256,
      });
    }
  } catch {
    /* corrupt provenance never breaks the asset list */
  }
  return map;
}

// ── asset-meta sidecar: ui-server-owned category overrides (NOT provenance) ─────────────────────
// projects/<p>/asset-meta.json { overrides: { "<relPath>": "<AssetCategory>" } } — applied AFTER
// categorizeAsset() so filenames keep working as the default. Written only by the categorize route.

export function assetMetaPath(project: string): string {
  return path.join(projectsRoot(), project, 'asset-meta.json');
}

export function readAssetMeta(project: string): Record<string, AssetCategory> {
  try {
    const j = JSON.parse(fs.readFileSync(assetMetaPath(project), 'utf8')) as { overrides?: Record<string, string> };
    const out: Record<string, AssetCategory> = {};
    for (const [rel, cat] of Object.entries(j.overrides ?? {})) {
      if ((ASSET_CATEGORIES as string[]).includes(cat)) out[rel] = cat as AssetCategory;
    }
    return out;
  } catch {
    return {}; // absent / corrupt sidecar never breaks the asset list
  }
}

export function listAssets(project: string): AssetInfo[] {
  const out: AssetInfo[] = [];
  walkAssets(path.join(publicDir(), project), 'public', out);
  walkAssets(path.join(deliverDir(), project, 'refs'), 'refs', out);
  walkAssets(path.join(workDir(), project), 'work', out);
  const badges = readAcquireBadges(project);
  const overrides = readAssetMeta(project);
  for (const a of out) {
    const badge = badges.get(path.resolve(a.absPath));
    if (badge) a.acquired = badge;
    const o = overrides[a.relPath];
    if (o) a.category = o;
  }
  return out.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
}

// ── style-specs (reference-analyze output) ───────────────────────────────────────

export interface StyleSpecInfo {
  name: string;
  relPath: string;
  mtime: string;
  spec: unknown;
}

export function listStyleSpecs(project: string): StyleSpecInfo[] {
  const roots = [path.join(deliverDir(), project, 'refs'), path.join(workDir(), project)];
  const found: StyleSpecInfo[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_SCAN_DEPTH || !fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(abs, depth + 1);
        continue;
      }
      if (!e.name.endsWith('.style-spec.json')) continue;
      try {
        found.push({
          name: e.name.replace(/\.style-spec\.json$/, ''),
          relPath: path.relative(projectDir(), abs).split(path.sep).join('/'),
          mtime: new Date(fs.statSync(abs).mtimeMs).toISOString(),
          spec: JSON.parse(fs.readFileSync(abs, 'utf8')),
        });
      } catch {
        /* skip corrupt spec */
      }
    }
  };
  for (const r of roots) walk(r, 0);
  return found.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
}

// ── acquire ──────────────────────────────────────────────────────────────────────

export const acquireBody = z.object({
  project: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/, 'project id must be lowercase-kebab-case'),
  url: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), 'only http(s) URLs can be acquired'),
  what: z.enum(['page', 'asset', 'media', 'mimic']),
  audioOnly: z.boolean().optional(),
  ship: z.boolean().optional(),
});
export type AcquireBody = z.infer<typeof acquireBody>;

/** Map an acquire request to its whitelisted job spec (pure → unit-tested). Mimic chains
 *  download-media → reference-analyze on the downloaded file ($PARENT_OUTPUT). */
export function buildAcquireSpec(b: AcquireBody): { spec: JobSpec; label: string } {
  switch (b.what) {
    case 'page':
      return {
        spec: { kind: 'capability', verb: 'acquire/fetch-url', args: ['--url', b.url, '--project', b.project], project: b.project },
        label: `acquire page → out/work/${b.project}/acquire/`,
      };
    case 'asset':
      return {
        spec: {
          kind: 'capability',
          verb: 'acquire/download-asset',
          args: ['--url', b.url, '--project', b.project, ...(b.ship ? ['--ship'] : [])],
          project: b.project,
        },
        label: `acquire asset → ${b.ship ? 'public' : 'deliver'}/${b.project}/refs/`,
      };
    case 'media':
      return {
        spec: {
          kind: 'capability',
          verb: 'acquire/download-media',
          args: ['--url', b.url, '--project', b.project, ...(b.audioOnly ? ['--audio-only'] : [])],
          project: b.project,
        },
        label: `acquire media (yt-dlp) → deliver/${b.project}/refs/`,
      };
    case 'mimic':
      return {
        spec: {
          kind: 'capability',
          verb: 'acquire/download-media',
          args: ['--url', b.url, '--project', b.project],
          project: b.project,
          then: {
            verb: 'perception/reference-analyze',
            args: ['--in', PARENT_OUTPUT_TOKEN, '--project', b.project],
            project: b.project,
            label: `reference-analyze → style-spec.json (${b.project})`,
          },
        },
        label: `mimic: download + deconstruct → style-spec (${b.project})`,
      };
  }
}

// ── routes ──────────────────────────────────────────────────────────────────────

export function registerP3Routes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>('/api/projects/:id/assets', async (req) => {
    return { assets: listAssets(req.params.id) };
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id/style-specs', async (req) => {
    return { specs: listStyleSpecs(req.params.id) };
  });

  app.post<{ Body: unknown }>('/api/acquire', async (req, reply) => {
    const parsed = acquireBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'bad body' });
    const { spec, label } = buildAcquireSpec(parsed.data);
    const job = enqueueJob(spec, label);
    return { job };
  });
}
