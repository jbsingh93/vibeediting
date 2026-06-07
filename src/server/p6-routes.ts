/**
 * src/server/p6-routes.ts — the creation modes' server seam (brief / upload / wiki / chat / renders).
 *
 *   GET  /api/projects/:id/brief             → { md, sha256, exists }  (projects/<p>/brief.md)
 *   PUT  /api/projects/:id/brief             { md, expect? } → { sha256 } | 409 file-changed | 413
 *   POST /api/projects/:id/assets/upload     streamed multipart → public/<p>/ (sanitize, ext
 *                                            whitelist, -2/-3 collision suffix, size cap, partial
 *                                            deleted) — upload does NOTHING automatic
 *   POST /api/projects/:id/assets/categorize { relPath, category } → projects/<p>/asset-meta.json
 *   GET  /api/projects/:id/chat              → { entries, busy }  (transcript replay after refresh)
 *   GET  /api/projects/:id/renders           → produced videos, newest first
 *   GET  /api/wiki                            → CAPABILITIES.md parsed live into ## sections
 *   GET  /api/wiki/doc?path=                  → whitelisted deep guides / READMEs, else 403
 *
 * The brief contract: projects/<p>/brief.md is the durable human-readable brief — written by the
 * create route (initial compose, BOTH modes), the user (Brief tab → PUT w/ expect sha), and the
 * agent (its ordinary Write tool). manifest.notes stays the agent's PLAN; the UI never writes
 * notes/inputs after create. Uploads are NOT provenance-logged by the UI (provenance stays
 * capability-written) and the wiki PARSES CAPABILITIES.md — never a forked copy.
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { z } from 'zod';
import { projectsRoot, publicDir, outDir, workDir, deliverDir, projectDir } from './context.js';
import {
  ASSET_CATEGORIES,
  assetMetaPath,
  categorizeAsset,
  listAssets,
  readAssetMeta,
  type AssetCategory,
  type AssetInfo,
} from './p3-routes.js';
import { readChat } from '../agent/chat.js';
import { isAgentBusy } from '../agent/runner.js';

// ── brief.md ────────────────────────────────────────────────────────────────────

export function briefPath(project: string): string {
  return path.join(projectsRoot(), project, 'brief.md');
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function atomicWrite(abs: string, text: string): void {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, abs);
}

/** The keys the wizard brief renders, in display order (everything else trails alphabetically). */
const BRIEF_KEY_ORDER = [
  'format',
  'style',
  'hook',
  'cta',
  'duration_s',
  'platform',
  'lang',
  'voiceover',
  'music',
  'footage',
  'inspiration_url',
];

/**
 * Compose the initial projects/<p>/brief.md (pure → unit-tested). Wizard mode renders the inputs
 * fields as a table; agent mode writes a stub inviting the chat brief (the agent distills the real
 * brief into this same file — the brief contract).
 */
export function composeBriefMd(project: string, inputs: Record<string, unknown>): string {
  const mode = inputs.mode === 'agent' ? 'agent' : 'wizard';
  if (mode === 'agent') {
    return [
      `# Brief — ${project}`,
      '',
      '_Agent-mode project — describe the video in the chat. The agent distills your messages into',
      'this brief and keeps it updated; you can edit it any time from the Brief tab._',
      '',
      '_(No brief yet.)_',
      '',
    ].join('\n');
  }
  const skip = new Set(['plan_gate_stage', 'agent_session_id', 'mode']);
  const keys = Object.keys(inputs).filter(
    (k) => !skip.has(k) && inputs[k] !== undefined && inputs[k] !== null,
  );
  keys.sort((a, b) => {
    const ia = BRIEF_KEY_ORDER.indexOf(a);
    const ib = BRIEF_KEY_ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b);
  });
  const rows = keys.map(
    (k) => `| ${k} | ${String(inputs[k]).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')} |`,
  );
  return [
    `# Brief — ${project}`,
    '',
    '_Created from the creation wizard. The agent reads this brief; edit it from the Brief tab',
    'or ask the agent to change it._',
    '',
    '| Field | Value |',
    '|---|---|',
    ...rows,
    '',
  ].join('\n');
}

/** Compose + write the initial brief for a freshly created project (called by the create route). */
export function writeInitialBrief(project: string, inputs: Record<string, unknown>): void {
  try {
    atomicWrite(briefPath(project), composeBriefMd(project, inputs));
  } catch {
    /* a failed brief write never fails project creation — the GET route serves a stub */
  }
}

const BRIEF_MAX_BYTES = 256 * 1024;

const briefPutBody = z.object({
  md: z.string(),
  /** optimistic concurrency: sha256 of the brief as the tab last loaded it. */
  expect: z.string().optional(),
});

// ── upload ──────────────────────────────────────────────────────────────────────

/** Everything categorizeAsset() knows + the plain-text extras. */
export const UPLOAD_EXT_WHITELIST = new Set([
  '.mp4', '.mov', '.webm', '.mkv', '.m4v', '.avi',
  '.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg',
  '.json', '.cube',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg',
  '.srt', '.vtt',
  '.txt', '.md',
]);

/**
 * Sanitize an uploaded filename to the asset-conventions naming (pure → unit-tested):
 * basename (kills traversal, both separators) → lowercase → æ/ø/å → ae/oe/aa → spaces/illegal
 * → '-', keep the extension. Returns null when nothing usable remains. The Nordic fold keeps
 * accented uploads from collapsing to a bare dash, so they stay distinguishable on disk.
 */
export function sanitizeUploadName(original: string): string | null {
  const base = path.basename(String(original).replace(/\\/g, '/'));
  const ext = path.extname(base).toLowerCase();
  let stem = base.slice(0, base.length - ext.length);
  stem = stem
    .toLowerCase()
    .replace(/[æ]/g, 'ae')
    .replace(/[ø]/g, 'oe')
    .replace(/[å]/g, 'aa')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  if (!stem) return null;
  return stem + ext;
}

/** Collision policy (pure): never overwrite — suffix -2, -3, … before the extension. */
export function collisionName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let i = 2; ; i++) {
    const candidate = `${stem}-${i}${ext}`;
    if (!taken(candidate)) return candidate;
  }
}

export function maxUploadBytes(): number {
  const mb = Number(process.env.VIBE_MAX_UPLOAD_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 4096) * 1024 * 1024;
}

const PROJECT_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

/** Forward-slash path relative to the project dir (the mono path the tile shows). */
function projectRel(abs: string): string {
  return path.relative(projectDir(), abs).split(path.sep).join('/');
}

function assetInfoFor(abs: string, category: AssetCategory): AssetInfo {
  const st = fs.statSync(abs);
  return {
    name: path.basename(abs),
    relPath: projectRel(abs),
    absPath: abs,
    category,
    origin: 'public',
    bytes: st.size,
    mtime: new Date(st.mtimeMs).toISOString(),
  };
}

/** Persist category overrides into the ui-server-owned sidecar (merge, atomic). */
export function writeAssetMetaOverrides(
  project: string,
  overrides: Record<string, AssetCategory>,
): void {
  const merged = { ...readAssetMeta(project), ...overrides };
  atomicWrite(assetMetaPath(project), JSON.stringify({ overrides: merged }, null, 2) + '\n');
}

const categorizeBody = z.object({
  relPath: z.string().min(1),
  category: z.enum(ASSET_CATEGORIES as [AssetCategory, ...AssetCategory[]]),
});

/** The three asset roots a categorize relPath may resolve into (same trees listAssets scans). */
function insideAssetRoots(project: string, relPath: string): string | null {
  const abs = path.resolve(projectDir(), relPath.split('/').join(path.sep));
  const roots = [
    path.join(publicDir(), project),
    path.join(deliverDir(), project, 'refs'),
    path.join(workDir(), project),
  ];
  for (const root of roots) {
    if (abs === root) continue;
    if (abs.startsWith(root + path.sep)) return abs;
  }
  return null;
}

// ── renders ───────────────────────────────────────────────────────────────────
// The Preview tab's "Renders" section: every produced video for the project, newest first, with
// an explicit draft framing (these are the agent's v1/loudnorm outputs — NOT fine-tune data).

export interface RenderInfo {
  name: string;
  relPath: string;
  /** browser URL on the read-only mounts (/deliver = deliver, /work = out/work, /out = out). */
  url: string;
  bytes: number;
  mtime: string;
  loudnorm: boolean;
  /** false = found at the out//deliver ROOT (not project-scoped) — surfaced with a tag instead of
   *  hidden (live-found at V5 Proof A: the agent rendered to `out/<name>.mp4` and the Preview tab
   *  was blind to every early version). */
  scoped?: boolean;
}

const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.m4v']);

/** Map a project-relative video path onto the served mounts (pure → unit-tested). Null = unservable.
 *  Order matters: the out/work subtree is served by its own /work mount, so it must be matched
 *  before the broader out/ mount. */
export function renderUrl(relPath: string): string | null {
  const rel = relPath.replace(/\\/g, '/');
  const encode = (s: string) => s.split('/').map(encodeURIComponent).join('/');
  if (rel.startsWith('deliver/')) return '/deliver/' + encode(rel.slice('deliver/'.length));
  if (rel.startsWith('out/work/')) return '/work/' + encode(rel.slice('out/work/'.length));
  if (rel.startsWith('out/')) return '/out/' + encode(rel.slice('out/'.length));
  if (rel.startsWith('public/')) return '/' + encode(rel.slice('public/'.length));
  return null;
}

/** Composition ids registered in the project's src/Root.tsx (pure parse → unit-tested).
 *  Matches `id="X"` / `id={'X'}` within each `<Composition`/`<Still` tag, attributes on any line. */
export function parseCompIds(rootTsx: string): string[] {
  const out: string[] = [];
  const tag = /<(?:Composition|Still)\b([\s\S]*?)>/g;
  for (let m = tag.exec(rootTsx); m; m = tag.exec(rootTsx)) {
    const attrs = m[1] ?? '';
    const id = /\bid\s*=\s*(?:["']([A-Za-z0-9_-]+)["']|\{\s*["']([A-Za-z0-9_-]+)["']\s*\})/.exec(attrs);
    const val = id?.[1] ?? id?.[2];
    if (val && !out.includes(val)) out.push(val);
  }
  return out;
}

export function listCompIds(): string[] {
  try {
    const rootTsx = fs.readFileSync(path.join(projectDir(), 'src', 'Root.tsx'), 'utf8');
    const ids = parseCompIds(rootTsx);
    return ids.length > 0 ? ids : ['DemoWelcome'];
  } catch {
    return ['DemoWelcome'];
  }
}

export function listRenders(project: string): RenderInfo[] {
  const roots = [
    path.join(deliverDir(), project),
    path.join(outDir(), project),
    path.join(workDir(), project),
  ];
  const out: RenderInfo[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 3 || !fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (
          e.name.startsWith('_') ||
          e.name === 'refs' ||
          e.name === 'orchestrate' ||
          e.name === 'node_modules'
        )
          continue;
        walk(abs, depth + 1);
        continue;
      }
      if (!e.isFile() || !VIDEO_EXT.has(path.extname(e.name).toLowerCase())) continue;
      let st: fs.Stats;
      try {
        st = fs.statSync(abs);
      } catch {
        continue;
      }
      const relPath = projectRel(abs);
      const url = renderUrl(relPath);
      if (!url) continue;
      out.push({
        name: e.name,
        relPath,
        url,
        bytes: st.size,
        mtime: new Date(st.mtimeMs).toISOString(),
        loudnorm: /loudnorm/i.test(e.name),
        scoped: true,
      });
    }
  };
  for (const r of roots) walk(r, 0);

  // Unscoped strays: videos sitting at the out// deliver/ ROOT (depth 0 only — files an agent
  // rendered without a project-scoped --out). Shown tagged rather than hidden so early versions
  // are never invisible; project-scoped rows stay the canonical surface.
  for (const root of [outDir(), deliverDir()]) {
    if (!fs.existsSync(root)) continue;
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (!e.isFile() || !VIDEO_EXT.has(path.extname(e.name).toLowerCase())) continue;
      const abs = path.join(root, e.name);
      let st: fs.Stats;
      try {
        st = fs.statSync(abs);
      } catch {
        continue;
      }
      const relPath = projectRel(abs);
      const url = renderUrl(relPath);
      if (!url) continue;
      out.push({
        name: e.name,
        relPath,
        url,
        bytes: st.size,
        mtime: new Date(st.mtimeMs).toISOString(),
        loudnorm: /loudnorm/i.test(e.name),
        scoped: false,
      });
    }
  }
  return out.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
}

// ── wiki ──────────────────────────────────────────────────────────────────────

export interface WikiSection {
  id: string;
  title: string;
  md: string;
}

/** Split CAPABILITIES.md into its `## ` sections (pure → unit-tested). Stable ids: `sec-<n>` when
 *  the heading is numbered ("## 13. …"), else a slug of the title; the preamble becomes `intro`. */
export function parseWikiSections(text: string): WikiSection[] {
  const lines = text.split(/\r?\n/);
  const sections: WikiSection[] = [];
  let title = 'Introduction';
  let id = 'intro';
  let body: string[] = [];
  const flush = (): void => {
    const md = body.join('\n').trim();
    if (md) sections.push({ id, title, md });
    body = [];
  };
  for (const line of lines) {
    const m = line.match(/^##\s+(.+)$/);
    if (m && !line.startsWith('###')) {
      flush();
      title = (m[1] ?? '').trim();
      const num = title.match(/^(\d+)\./);
      id = num
        ? `sec-${num[1]}`
        : title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 48) || `sec-${sections.length}`;
      continue;
    }
    body.push(line);
  }
  flush();
  return sections;
}

const wikiCache: { mtimeMs: number; sections: WikiSection[] } = { mtimeMs: -1, sections: [] };

function wikiPath(): string {
  return path.join(projectDir(), 'CAPABILITIES.md');
}

function wikiSections(): WikiSection[] {
  const p = wikiPath();
  const mtimeMs = fs.statSync(p).mtimeMs;
  if (mtimeMs !== wikiCache.mtimeMs) {
    wikiCache.sections = parseWikiSections(fs.readFileSync(p, 'utf8'));
    wikiCache.mtimeMs = mtimeMs;
  }
  return wikiCache.sections;
}

/** EXPLICIT whitelist: every capabilities/<folder>/README.md that exists + the named deep guides.
 *  Anything else → 403. Never serves .env, never globs. */
export function wikiDocWhitelist(): Set<string> {
  const set = new Set<string>();
  const capDir = path.join(projectDir(), 'capabilities');
  const addReadmes = (relDir: string): void => {
    const absDir = path.join(projectDir(), relDir.split('/').join(path.sep));
    try {
      for (const e of fs.readdirSync(absDir, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const rel = `${relDir}/${e.name}/README.md`;
        if (fs.existsSync(path.join(projectDir(), rel.split('/').join(path.sep)))) set.add(rel);
      }
    } catch {
      /* dir absent — nothing to add */
    }
  };
  // top-level capabilities/<folder>/README.md
  addReadmes('capabilities');
  // nested capabilities/vfx/<folder>/README.md (vfx fans out into compositor/generate)
  addReadmes('capabilities/vfx');
  // the capabilities root README itself
  if (fs.existsSync(path.join(capDir, 'README.md'))) set.add('capabilities/README.md');
  // named deep guides that live in this scaffold
  for (const g of [
    'capabilities/generate/THUMBNAIL-GUIDE.md',
    'capabilities/motion/DETERMINISTIC-VFX-CHEATSHEET.md',
    'capabilities/motion/GSAP-IN-REMOTION.md',
    'capabilities/vfx/generate/templates/README.md',
  ]) {
    if (fs.existsSync(path.join(projectDir(), g.split('/').join(path.sep)))) set.add(g);
  }
  return set;
}

// ── routes ──────────────────────────────────────────────────────────────────────

export async function registerP6Routes(app: FastifyInstance): Promise<void> {
  // streamed multipart — never buffered. throwFileSizeLimit:false → an over-cap file TRUNCATES
  // (part.file.truncated) instead of 413-ing the whole batch; the route then deletes the partial
  // and reports the per-file reject (a silently truncated mp4 is the worst possible outcome).
  await app.register(fastifyMultipart, {
    limits: { fileSize: maxUploadBytes(), files: 50 },
    throwFileSizeLimit: false,
  });

  // ── brief ─────────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/api/projects/:id/brief', async (req) => {
    const p = briefPath(req.params.id);
    if (!fs.existsSync(p)) {
      const stub = composeBriefMd(req.params.id, { mode: 'agent' });
      return { md: stub, sha256: sha256(stub), exists: false };
    }
    const md = fs.readFileSync(p, 'utf8');
    return { md, sha256: sha256(md), exists: true };
  });

  app.put<{ Params: { id: string }; Body: unknown }>(
    '/api/projects/:id/brief',
    async (req, reply) => {
      const parsed = briefPutBody.safeParse(req.body ?? {});
      if (!parsed.success)
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'bad body' });
      const { md, expect } = parsed.data;
      if (Buffer.byteLength(md, 'utf8') > BRIEF_MAX_BYTES) {
        return reply.code(413).send({ error: `brief too large (max ${BRIEF_MAX_BYTES / 1024} KB)` });
      }
      const p = briefPath(req.params.id);
      // optimistic concurrency: if the caller sent the sha it loaded and the on-disk file has
      // changed since (most likely the agent rewrote it), reject with 409 + the current bytes so
      // the tab can reconcile rather than clobber the agent's edit.
      if (expect && fs.existsSync(p)) {
        const onDisk = fs.readFileSync(p, 'utf8');
        if (sha256(onDisk) !== expect) {
          return reply.code(409).send({
            error: 'file-changed',
            detail:
              'brief.md changed on disk since you loaded it (probably the agent) — reload before saving',
            sha256: sha256(onDisk),
            md: onDisk,
          });
        }
      }
      atomicWrite(p, md);
      return { sha256: sha256(md) };
    },
  );

  // ── upload ────────────────────────────────────────────────────────────────
  // Route-level bodyLimit: Fastify's default 1 MiB body cap would 413 any real footage before the
  // multipart parser ever streams a byte. The cap here is the upload cap + form-overhead headroom;
  // the per-FILE cap (limits.fileSize above) stays the enforcement that deletes partials.
  const uploadBodyLimit = maxUploadBytes() + 16 * 1024 * 1024;
  app.post<{ Params: { id: string } }>(
    '/api/projects/:id/assets/upload',
    { bodyLimit: uploadBodyLimit },
    async (req, reply) => {
      const project = req.params.id;
      if (!PROJECT_RE.test(project)) return reply.code(400).send({ error: 'bad project id' });
      if (!req.isMultipart())
        return reply.code(400).send({ error: 'expected a multipart/form-data upload' });

      const destDir = path.join(publicDir(), project);
      const uploaded: AssetInfo[] = [];
      const rejected: { name: string; reason: string }[] = [];
      const savedAbs: string[] = [];
      let category: AssetCategory | null = null;
      let sawFile = false;

      for await (const part of req.parts()) {
        if (part.type === 'field') {
          if (part.fieldname === 'category' && typeof part.value === 'string' && part.value !== 'auto') {
            if ((ASSET_CATEGORIES as string[]).includes(part.value))
              category = part.value as AssetCategory;
            else rejected.push({ name: part.value, reason: `unknown category "${part.value}"` });
          }
          continue;
        }
        sawFile = true;
        const original = part.filename || 'file';
        const safe = sanitizeUploadName(original);
        if (!safe) {
          part.file.resume(); // drain — a stalled part stream wedges the iterator
          rejected.push({
            name: original,
            reason: 'filename reduces to nothing usable (a–z, 0–9, dashes)',
          });
          continue;
        }
        const ext = path.extname(safe).toLowerCase();
        if (!UPLOAD_EXT_WHITELIST.has(ext)) {
          part.file.resume();
          rejected.push({
            name: original,
            reason: `file type "${ext || '(none)'}" is not an accepted asset type`,
          });
          continue;
        }
        fs.mkdirSync(destDir, { recursive: true });
        const finalName = collisionName(safe, (c) => fs.existsSync(path.join(destDir, c)));
        const dest = path.join(destDir, finalName);
        try {
          await pipeline(part.file, fs.createWriteStream(dest)); // STREAMED, never toBuffer
        } catch (e) {
          try {
            fs.unlinkSync(dest);
          } catch {
            /* already gone */
          }
          rejected.push({
            name: original,
            reason: `write failed: ${e instanceof Error ? e.message : String(e)}`,
          });
          continue;
        }
        if (part.file.truncated) {
          // over the VIBE_MAX_UPLOAD_MB cap — a silently truncated mp4 is worse than a failed upload
          try {
            fs.unlinkSync(dest);
          } catch {
            /* already gone */
          }
          rejected.push({
            name: original,
            reason: `file exceeds the upload cap (${Math.round(maxUploadBytes() / 1024 / 1024)} MB)`,
          });
          continue;
        }
        uploaded.push(assetInfoFor(dest, categorizeAsset(finalName)));
        savedAbs.push(dest);
      }

      if (!sawFile) return reply.code(400).send({ error: 'no files in the upload' });
      if (uploaded.length === 0) {
        return reply
          .code(400)
          .send({ error: rejected[0]?.reason ?? 'all files were rejected', rejected });
      }

      // a category override (the batch field) persists via the sidecar — filenames stay the default
      if (category) {
        const overrides: Record<string, AssetCategory> = {};
        for (const a of uploaded) {
          overrides[a.relPath] = category;
          a.category = category;
        }
        writeAssetMetaOverrides(project, overrides);
      }
      return { uploaded, rejected };
    },
  );

  // ── categorize (re-file one asset) ────────────────────────────────────────
  app.post<{ Params: { id: string }; Body: unknown }>(
    '/api/projects/:id/assets/categorize',
    async (req, reply) => {
      const project = req.params.id;
      const parsed = categorizeBody.safeParse(req.body ?? {});
      if (!parsed.success)
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'bad body' });
      const { relPath, category } = parsed.data;
      const abs = insideAssetRoots(project, relPath);
      if (!abs) {
        return reply.code(400).send({
          error: `relPath must point inside public/${project}/, deliver/${project}/refs/ or out/work/${project}/`,
        });
      }
      if (!fs.existsSync(abs)) return reply.code(404).send({ error: `no such asset: ${relPath}` });
      writeAssetMetaOverrides(project, { [relPath]: category });
      const asset = listAssets(project).find((a) => a.relPath === relPath) ?? null;
      return { asset };
    },
  );

  // ── chat transcript — replay the feed after refresh/close ─────────────────
  app.get<{ Params: { id: string } }>('/api/projects/:id/chat', async (req) => {
    return { entries: readChat(projectsRoot(), req.params.id), busy: isAgentBusy(req.params.id) };
  });

  // ── renders ─────────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/api/projects/:id/renders', async (req) => {
    if (!PROJECT_RE.test(req.params.id)) return { renders: [] };
    return { renders: listRenders(req.params.id) };
  });

  // ── registered compositions ──────────────────────────────────────────────────
  // src/Root.tsx is the source of truth for what `remotion render` can target. The prebuilt
  // client can only ever BUNDLE the demo comp, but the Deliver tab renders through the
  // project's own CLI — so it must list USER comps too (live-found at V5 Proof B: the dropdown
  // only knew DemoWelcome and re-rendered the wrong comp).
  app.get('/api/comps', async () => ({ comps: listCompIds() }));

  // ── wiki ──────────────────────────────────────────────────────────────────
  app.get('/api/wiki', async () => ({ sections: wikiSections() }));

  app.get<{ Querystring: { path?: string } }>('/api/wiki/doc', async (req, reply) => {
    const raw = (req.query.path ?? '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
    const allowed = wikiDocWhitelist();
    if (!raw || !allowed.has(raw)) {
      return reply.code(403).send({ error: 'not a whitelisted wiki document' });
    }
    const abs = path.join(projectDir(), raw.split('/').join(path.sep));
    return { md: fs.readFileSync(abs, 'utf8') };
  });
}
