/**
 * src/server/p4-routes.ts — the fine-tune editor's read/save seam (UI-P4).
 *
 *   GET  /api/finetune/projects          → public/<dir>s that contain editable docs
 *   GET  /api/projects/:id/finetune      → the project's editable docs (captions/segments/audio-mix/props)
 *                                          + baselines (<base>.whisper.json) + sha256 per doc
 *   POST /api/projects/:id/finetune/save → validated, atomic writes of the SAME files the comps import
 *
 * The save route owns the hand-edit ↔ agent conflict rule:
 *   - optimistic concurrency: `expect[name]` sha mismatch on disk → 409 {conflict:'file-changed'}
 *     (the agent — or another tab — rewrote the file under you; reload before saving);
 *   - a `running` stage (default `motion`) without fork:true → 409 {conflict:'stage-running'} — the
 *     UI confirms, then resends fork:true;
 *   - fork (running+fork:true, or a `complete` stage whose params_hash differs): the PRE-edit file
 *     set is snapshotted to projects/<p>/finetune/<hash8>/ (durable, git-tracked) and a
 *     VersionRecord {v:K+1, approved:false, params_hash} is appended to the stage — the SAME
 *     versions[] the version switcher already renders. An approved v1 is never overwritten.
 *
 * The UI writes ONLY public/<p>/ data JSON (never provenance/budget; never TSX). All writes are
 * tmp+rename atomic, basenames are whitelisted (no path traversal), and every doc kind validates
 * against its zod schema before touching disk — a malformed save can never corrupt a comp's data.
 *
 * Glue note: the parent UI lived inside the repo it served and read paths from REPO_ROOT and its
 * own capabilities tree. The package operates ON a scaffolded user project, so paths derive from
 * context.ts (publicDir/projectsRoot) and the manifest service from manifest.ts (manifest.schema.ts).
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { publicDir as projectPublicDir } from './context.js';
import {
  manifestExists,
  manifestPath,
  readManifest,
  writeManifest,
} from './manifest.js';
import {
  STAGE_NAMES,
  type Stage,
  type StageName,
  type VersionRecord,
} from './manifest.schema.js';

// ── captions schema (LOCAL mirror) ────────────────────────────────────────────────
//
// The contract owner is template/src/components/captions.ts (the scaffolded comp imports it).
// This package cannot import template code, so this mirrors that file's `captionsSchema` 1:1:
// an array of word-level captions matching the @remotion/captions `Caption` shape, with
// `timestampMs` / `confidence` tolerated as missing (→ null). If the template contract changes
// shape, change BOTH (the template file stays authoritative).
const captionSchema = z.object({
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  timestampMs: z.number().nullable().default(null),
  confidence: z.number().nullable().default(null),
});
const captionsSchema = z.array(captionSchema);

// ── doc shapes ──────────────────────────────────────────────────────────────────

export type FinetuneDocKind = 'captions' | 'segments' | 'audio-mix' | 'props';

/** EDL doc: single-source shape (top-level src) or per-segment shape (per-segment src + cap). */
export const segmentSchema = z.object({
  id: z.string().min(1),
  srcStart: z.number().min(0),
  srcEnd: z.number().positive(),
  src: z.string().optional(),
  cap: z.string().optional(),
});
export const segmentsDocSchema = z.object({
  fps: z.number().positive(),
  crossfadeFrames: z.number().int().min(0),
  src: z.string().optional(),
  segments: z.array(segmentSchema).min(1),
  /** Emphasis words — honored by the EDL timelines (fallback = their built-in list). */
  emphasisWords: z.array(z.string()).optional(),
});
export type SegmentsDoc = z.infer<typeof segmentsDocSchema>;

/** The per-project audio-mix sidecar (the audio/mix duck params, persisted). */
export const audioTrackSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['vo', 'bgm', 'sfx']),
  /** public/-rooted path, like staticFile() takes. */
  src: z.string().min(1),
  offsetSec: z.number().min(0).default(0),
  gainDb: z.number().min(-36).max(12).default(0),
  /** BGM only: duck under the voice. Default depth 0.12 = a hard duck. */
  duck: z.object({ depth: z.number().min(0).max(1).default(0.12) }).optional(),
});
export const audioMixSchema = z.object({
  /** Delivery mastering is locked at −14 LUFS / −1 dBTP — recorded, not editable. */
  masterLufs: z.literal(-14).default(-14),
  tracks: z.array(audioTrackSchema).default([]),
});
export type AudioMixDoc = z.infer<typeof audioMixSchema>;

/** props.json — schema-validated client-side against the comp's own *PropsSchema; the server
 *  only requires a JSON object (it has no access to per-comp schemas without loading TSX). */
const propsDocSchema = z.record(z.string(), z.unknown());

export interface FinetuneDoc {
  name: string; // basename within public/<p>/
  kind: FinetuneDocKind;
  data: unknown;
  sha256: string;
  /** captions docs: the pristine-Whisper baseline (<base>.whisper.json), if present. */
  baseline?: unknown;
  /** segments docs: does each referenced source exist under public/? (Player safety). */
  srcExists?: Record<string, boolean>;
}

export interface FinetuneState {
  project: string;
  docs: FinetuneDoc[];
}

// ── discovery ───────────────────────────────────────────────────────────────────

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const isCaptionsName = (n: string) => /caption/i.test(n) && !/\.whisper\.json$/i.test(n);
const isSegmentsShape = (d: unknown): d is SegmentsDoc =>
  !!d && typeof d === 'object' && Array.isArray((d as SegmentsDoc).segments) && typeof (d as SegmentsDoc).fps === 'number';

/** Classify one public/<p>/*.json by name + shape (pure → unit-tested). null = not editable. */
export function classifyFinetuneDoc(name: string, data: unknown): FinetuneDocKind | null {
  if (!name.endsWith('.json') || /\.whisper\.json$/i.test(name)) return null;
  if (name === 'audio-mix.json') return audioMixSchema.safeParse(data).success ? 'audio-mix' : null;
  if (name === 'props.json') return propsDocSchema.safeParse(data).success ? 'props' : null;
  if (isCaptionsName(name)) return captionsSchema.safeParse(data).success ? 'captions' : null;
  if (isSegmentsShape(data)) return segmentsDocSchema.safeParse(data).success ? 'segments' : null;
  return null;
}

/** Absolute path to a project's public/ asset dir on the served project. */
function publicDir(project: string): string {
  return path.join(projectPublicDir(), project);
}

/** A segments doc's referenced sources (top-level src + per-segment srcs), de-duplicated. */
export function segmentSources(doc: SegmentsDoc): string[] {
  const srcs = new Set<string>();
  if (doc.src) srcs.add(doc.src);
  for (const s of doc.segments) if (s.src) srcs.add(s.src);
  return [...srcs];
}

export function readFinetuneState(project: string): FinetuneState {
  const dir = publicDir(project);
  const docs: FinetuneDoc[] = [];
  if (!fs.existsSync(dir)) return { project, docs };
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.json')) continue;
    const abs = path.join(dir, name);
    let raw: string;
    let data: unknown;
    try {
      raw = fs.readFileSync(abs, 'utf8');
      data = JSON.parse(raw);
    } catch {
      continue; // corrupt JSON never breaks the editor — it simply isn't offered
    }
    const kind = classifyFinetuneDoc(name, data);
    if (!kind) continue;
    const doc: FinetuneDoc = { name, kind, data, sha256: sha256(raw) };
    if (kind === 'captions') {
      const basePath = path.join(dir, name.replace(/\.json$/, '.whisper.json'));
      if (fs.existsSync(basePath)) {
        try {
          doc.baseline = JSON.parse(fs.readFileSync(basePath, 'utf8'));
        } catch {
          /* corrupt baseline = no baseline */
        }
      }
    }
    if (kind === 'segments') {
      const seg = segmentsDocSchema.parse(data);
      doc.srcExists = {};
      for (const s of segmentSources(seg)) {
        doc.srcExists[s] = fs.existsSync(path.join(projectPublicDir(), s));
      }
    }
    docs.push(doc);
  }
  return { project, docs };
}

/** public/ dirs that contain at least one editable doc (the #/finetune picker). */
export function listFinetuneProjects(): { project: string; docs: number; kinds: FinetuneDocKind[] }[] {
  const pub = projectPublicDir();
  if (!fs.existsSync(pub)) return [];
  const out: { project: string; docs: number; kinds: FinetuneDocKind[] }[] = [];
  for (const e of fs.readdirSync(pub, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('.')) continue;
    const state = readFinetuneState(e.name);
    if (state.docs.length === 0) continue;
    out.push({ project: e.name, docs: state.docs.length, kinds: [...new Set(state.docs.map((d) => d.kind))] });
  }
  return out.sort((a, b) => a.project.localeCompare(b.project));
}

// ── save (the conflict contract lives here) ───────────────────────────────────────

const SAFE_NAME = /^[a-z0-9][a-z0-9._-]*\.json$/i;

export const finetuneSaveBody = z.object({
  files: z
    .array(
      z.object({
        name: z.string().regex(SAFE_NAME, 'file name must be a plain .json basename'),
        data: z.unknown(),
      }),
    )
    .min(1),
  /** optimistic concurrency: sha256 of each file as the editor last loaded it. */
  expect: z.record(z.string(), z.string()).optional(),
  /** explicit user consent to fork while a stage is running. */
  fork: z.boolean().optional(),
  /** which stage the fork bookkeeping attaches to (the comp's render stage). */
  stage: z.enum(STAGE_NAMES).default('motion'),
});
export type FinetuneSaveBody = z.infer<typeof finetuneSaveBody>;

/** Validate one file payload against its kind's schema. Returns the error message, or null if ok. */
export function validateFinetuneFile(name: string, data: unknown): string | null {
  if (/\.whisper\.json$/i.test(name)) return 'baseline files are written by the server, not saved over';
  if (name === 'audio-mix.json') {
    const r = audioMixSchema.safeParse(data);
    return r.success ? null : firstIssue(r.error, name);
  }
  if (name === 'props.json') {
    const r = propsDocSchema.safeParse(data);
    return r.success ? null : firstIssue(r.error, name);
  }
  if (isCaptionsName(name)) {
    const r = captionsSchema.safeParse(data);
    return r.success ? null : firstIssue(r.error, name);
  }
  if (isSegmentsShape(data)) {
    const r = segmentsDocSchema.safeParse(data);
    return r.success ? null : firstIssue(r.error, name);
  }
  return `"${name}" is not an editable fine-tune doc (captions / segments / audio-mix / props)`;
}

function firstIssue(err: z.ZodError, name: string): string {
  const i = err.issues[0];
  return `${name}: [${i?.path.join('.') || 'root'}] ${i?.message ?? 'invalid'}`;
}

function canonical(data: unknown): string {
  return JSON.stringify(data, null, 2) + '\n';
}

function atomicWrite(abs: string, text: string): void {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, abs);
}

export type SaveConflict =
  | { conflict: 'file-changed'; name: string; error: string }
  | { conflict: 'stage-running'; stage: StageName; error: string };

export interface SaveResult {
  saved: string[];
  /** sha256 of each file as written (the editor's next `expect`). */
  shas: Record<string, string>;
  params_hash: string;
  forked?: { stage: StageName; v: number };
  baselineCreated?: string[];
}

/** Combined hash of the saved set — the fork's params_hash (deterministic: sorted by name). */
export function setHash(files: { name: string; text: string }[]): string {
  const h = createHash('sha256');
  for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    h.update(f.name, 'utf8');
    h.update('\0');
    h.update(f.text, 'utf8');
  }
  return h.digest('hex');
}

/**
 * Append a hand-edit VersionRecord to a stage. Mirrors the completeStage fork bookkeeping
 * WITHOUT transitioning status (legal for running stages — versions[] is data, the lifecycle
 * is untouched). Seeds v1 from the stage's current state so both versions are addressable.
 */
export function appendHandEditVersion(
  project: string,
  stage: StageName,
  outputs: string[],
  params_hash: string,
  preEditHash: string | undefined,
): { v: number } {
  const m = readManifest(project);
  const s = (m.stages as Record<string, Stage>)[stage];
  if (!s) throw new Error(`stage "${stage}" not on the manifest`);
  const versions: VersionRecord[] = s.versions ? [...s.versions] : [];
  if (versions.length === 0) {
    versions.push({
      v: 1,
      approved: true,
      outputs: s.outputs,
      params_hash: s.params_hash ?? preEditHash,
      created_at: s.started_at ?? new Date().toISOString(),
      finished_at: s.finished_at,
    });
  }
  const v = Math.max(...versions.map((r) => r.v)) + 1;
  versions.push({ v, approved: false, outputs, params_hash, created_at: new Date().toISOString() });
  s.versions = versions;
  (m.stages as Record<string, Stage>)[stage] = s;
  writeManifest(m);
  return { v };
}

export function saveFinetune(project: string, body: FinetuneSaveBody): SaveResult | SaveConflict {
  const dir = publicDir(project);
  const files = body.files.map((f) => ({ name: path.basename(f.name), data: f.data, text: canonical(f.data) }));

  // 1) optimistic concurrency — someone (the agent) changed a file since the editor loaded it.
  for (const f of files) {
    const expected = body.expect?.[f.name];
    if (!expected) continue;
    const abs = path.join(dir, f.name);
    if (fs.existsSync(abs)) {
      const onDisk = sha256(fs.readFileSync(abs, 'utf8'));
      if (onDisk !== expected) {
        return {
          conflict: 'file-changed',
          name: f.name,
          error: `${f.name} changed on disk since you loaded it (probably the agent) — reload before saving`,
        };
      }
    }
  }

  const newHash = setHash(files);
  let forked: SaveResult['forked'];

  // 2) the stage rule — only when the project has a manifest.
  if (manifestExists(project)) {
    const m = readManifest(project);
    const s = (m.stages as Record<string, Stage>)[body.stage];
    if (s && s.status === 'running' && !body.fork) {
      return {
        conflict: 'stage-running',
        stage: body.stage,
        error: `stage "${body.stage}" is running — saving now forks a new version instead of changing the in-flight one`,
      };
    }
    const activeHash = s?.params_hash;
    const shouldFork =
      (s && s.status === 'running' && body.fork === true) ||
      (s && s.status === 'complete' && activeHash !== undefined && activeHash !== newHash);
    if (shouldFork && s) {
      // snapshot the PRE-edit live files (durable, git-tracked) so the superseded version stays real
      const preEdit: { name: string; text: string }[] = [];
      for (const f of files) {
        const abs = path.join(dir, f.name);
        if (fs.existsSync(abs)) preEdit.push({ name: f.name, text: fs.readFileSync(abs, 'utf8') });
      }
      const preHash = preEdit.length > 0 ? setHash(preEdit) : undefined;
      if (preHash) {
        const snapDir = path.join(path.dirname(manifestPath(project)), 'finetune', preHash.slice(0, 8));
        for (const f of preEdit) atomicWrite(path.join(snapDir, f.name), f.text);
      }
      const liveOutputs = files.map((f) => path.join(dir, f.name));
      forked = { stage: body.stage, ...appendHandEditVersion(project, body.stage, liveOutputs, newHash, preHash) };
    }
  }

  // 3) baseline: first hand-save of a captions doc preserves the pristine Whisper truth.
  const baselineCreated: string[] = [];
  for (const f of files) {
    if (!isCaptionsName(f.name)) continue;
    const abs = path.join(dir, f.name);
    const basePath = path.join(dir, f.name.replace(/\.json$/, '.whisper.json'));
    if (fs.existsSync(abs) && !fs.existsSync(basePath)) {
      atomicWrite(basePath, fs.readFileSync(abs, 'utf8'));
      baselineCreated.push(path.basename(basePath));
    }
  }

  // 4) atomic writes of the live files the comps import.
  const shas: Record<string, string> = {};
  for (const f of files) {
    atomicWrite(path.join(dir, f.name), f.text);
    shas[f.name] = sha256(f.text);
  }

  return { saved: files.map((f) => f.name), shas, params_hash: newHash, forked, baselineCreated: baselineCreated.length ? baselineCreated : undefined };
}

// ── routes ──────────────────────────────────────────────────────────────────────

export function registerP4Routes(app: FastifyInstance): void {
  app.get('/api/finetune/projects', async () => {
    return { projects: listFinetuneProjects() };
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id/finetune', async (req) => {
    // A project with no editable sidecars yet is a DESIGNED clean-slate state, not an error —
    // the old 404 logged browser console noise on every fresh project (root-caused at the V5.5
    // regression walk; the client already rendered 404 as empty, UIP6.10).
    return readFinetuneState(req.params.id);
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/projects/:id/finetune/save', async (req, reply) => {
    const parsed = finetuneSaveBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'bad body' });
    const project = req.params.id;
    if (!fs.existsSync(publicDir(project))) {
      return reply.code(404).send({ error: `no public/${project}/ to save into` });
    }
    for (const f of parsed.data.files) {
      const err = validateFinetuneFile(path.basename(f.name), f.data);
      if (err) return reply.code(400).send({ error: err });
    }
    const result = saveFinetune(project, parsed.data);
    if ('conflict' in result) return reply.code(409).send(result);
    return result;
  });
}
