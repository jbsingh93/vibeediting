/**
 * src/server/jobs.ts — the cockpit job runner: capability CLIs + Remotion renders as background
 * jobs with live WebSocket progress.
 *
 * Hard rules carried over from the engine's UI server:
 *   - `verb` is checked against an explicit WHITELIST (the capability verbs + orchestrate/verify +
 *     deliver/render-preset + deliver/loudnorm). Anything else → 403. This API is NOT a generic
 *     shell-exec endpoint; argv is always an array (no shell), spawned via the spawn.ts discipline.
 *   - GPU/encode-heavy RENDER jobs are serialized into a small lane (default max 1 — configurable
 *     via vibe.config.json maxRenderJobs / VIBE_MAX_RENDER_JOBS). Capability jobs run up to 2
 *     concurrent. The rest queue (visible in GET /api/jobs).
 *   - Pre-render disk guard: refuse below the free-space floor (vibe.config.json minFreeGb /
 *     VIBE_MIN_FREE_GB, default 5 GB) with HTTP 507.
 *   - Envelope parse rule: stream stdout to logTail; the LAST parseable JSON line with a boolean
 *     `success` and a string `capability` is the envelope. No envelope on a capability job →
 *     abnormal failure.
 *
 * Unlike the engine's own server (which ran inside the repo it served), this server ships in the
 * npm package and operates ON a scaffolded user project. Every path derives from context.ts
 * (projectDir / deliverDir / workDir); binaries come from the project's node_modules via spawn.ts.
 *
 * Tests: VIBE_RENDER_CMD points render jobs at a fake-render node script (no real Remotion render
 * in the default gate).
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  spawnTsx,
  spawnVenvPy,
  captureTsx,
  projectRemotionCli,
} from './spawn.js';
import { projectDir, deliverDir, outDir, readVibeConfig } from './context.js';
import { broadcast } from './ws-hub.js';
import { manifestExists, readManifest, activeVersion } from './manifest.js';
import type { Stage, StageName } from './manifest.schema.js';

/**
 * The capability result envelope, mirrored package-side. The on-the-wire shape is owned by the
 * scaffolded engine (template/capabilities/_env/contract.ts); the package cannot import template
 * code (it's excluded from this tsconfig and lives outside rootDir), so — exactly like
 * manifest.schema.ts — we mirror the contract 1:1 here. If the template contract changes shape,
 * change BOTH.
 */
export interface CapabilityResult<M = Record<string, unknown>> {
  success: boolean;
  capability: string;
  outputs: string[];
  metrics: M;
  warnings?: string[];
  error?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

/**
 * The render presets, mirrored package-side from template/capabilities/deliver/render-preset.ts.
 * Same 1:1-mirror discipline as CapabilityResult above — the package never imports template code.
 * The PRESETS array below is the runtime witness; this union is the compile-time one.
 */
export type Preset =
  | 'vertical-ad'
  | 'square-ad'
  | 'portrait-feed'
  | 'youtube-1080'
  | 'youtube-4k'
  | 'reel-60fps'
  | 'transparent-overlay'
  | 'scene-clip'
  | 'scene-clip-alpha'
  | 'scene-clip-greenkey';

// ── the verb whitelist ──────────────────────────────────────────────────────────
/** verb → project-relative script + runner. The ONLY capability CLIs the UI may run.
 *  Runner `tsx` = capability .ts via the project's tsx; `py` = the capability venv python
 *  (download-media.py — yt-dlp needs the venv, never system python). Paths stay relative to
 *  the served project; spawn.ts resolves them against projectDir(). */
export interface VerbDef {
  script: string;
  runner: 'tsx' | 'py';
}

export const VERB_WHITELIST: Record<string, VerbDef> = {
  'orchestrate/verify': { script: 'capabilities/orchestrate/verify.ts', runner: 'tsx' },
  'deliver/render-preset': { script: 'capabilities/deliver/render-preset.ts', runner: 'tsx' },
  'deliver/loudnorm': { script: 'capabilities/deliver/loudnorm.ts', runner: 'tsx' },
  'deliver/check-disk-space': { script: 'capabilities/deliver/check-disk-space.ts', runner: 'tsx' },
  'deliver/make-proxy': { script: 'capabilities/deliver/make-proxy.ts', runner: 'tsx' },
  'ingest/probe': { script: 'capabilities/ingest/probe.ts', runner: 'tsx' },
  'ingest/transcribe': { script: 'capabilities/ingest/transcribe.ts', runner: 'tsx' },
  'acquire/fetch-url': { script: 'capabilities/acquire/fetch-url.ts', runner: 'tsx' },
  'acquire/download-asset': { script: 'capabilities/acquire/download-asset.ts', runner: 'tsx' },
  'acquire/download-media': { script: 'capabilities/acquire/download-media.py', runner: 'py' },
  'perception/reference-analyze': { script: 'capabilities/perception/reference-analyze.ts', runner: 'tsx' },
};

export function isWhitelistedVerb(verb: string): boolean {
  return Object.prototype.hasOwnProperty.call(VERB_WHITELIST, verb);
}

// ── runtime preset list (mirrors the render-preset.ts union; tsc enforces both directions) ─────────
export const PRESETS = [
  'vertical-ad',
  'square-ad',
  'portrait-feed',
  'youtube-1080',
  'youtube-4k',
  'reel-60fps',
  'transparent-overlay',
  'scene-clip',
  'scene-clip-alpha',
  'scene-clip-greenkey',
] as const satisfies readonly Preset[];
// compile-time exhaustiveness: a NEW Preset in render-preset.ts breaks this until added above.
type MissingPreset = Exclude<Preset, (typeof PRESETS)[number]>;
const _assertAllPresets: MissingPreset[] = [];
void _assertAllPresets;

const isPreset = (p: string): p is Preset => (PRESETS as readonly string[]).includes(p);

// ── pure helpers ────────────────────────────────────────────────────────────────

/** Parse the envelope from captured stdout: the LAST line that parses as JSON with a boolean
 *  `success` and a string `capability`. Garbage tails / partial writes are skipped (envelope
 *  discipline: the capability owns the contract, the runner only reads the last valid line). */
export function parseEnvelope(stdout: string): CapabilityResult | null {
  const lines = stdout.split(/\r?\n/).filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line === undefined) continue;
    try {
      const obj = JSON.parse(line) as unknown;
      if (
        obj &&
        typeof obj === 'object' &&
        typeof (obj as { success?: unknown }).success === 'boolean' &&
        typeof (obj as { capability?: unknown }).capability === 'string'
      ) {
        return obj as CapabilityResult;
      }
    } catch {
      /* not this line */
    }
  }
  return null;
}

/** Parse a Remotion render progress line ("Rendered 123/1800") → frame counts. */
export function parseRenderProgress(line: string): { frame: number; total: number } | null {
  const m = line.match(/Rendered\s+(\d+)\s*\/\s*(\d+)/i);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  const frame = parseInt(m[1], 10);
  const total = parseInt(m[2], 10);
  if (!Number.isFinite(frame) || !Number.isFinite(total) || total <= 0) return null;
  return { frame, total };
}

/** Free GB on the drive holding `dir` (created if missing — statfs needs an existing path). */
export function freeDiskGb(dir: string): { freeGb: number; totalGb: number } {
  fs.mkdirSync(dir, { recursive: true });
  const s = fs.statfsSync(dir);
  return { freeGb: (s.bfree * s.bsize) / 1024 ** 3, totalGb: (s.blocks * s.bsize) / 1024 ** 3 };
}

/** The pre-render disk threshold: refuse below this many GB free. VIBE_MIN_FREE_GB overrides
 *  vibe.config.json minFreeGb (default 5). */
export function minFreeGb(): number {
  const env = Number(process.env.VIBE_MIN_FREE_GB);
  if (Number.isFinite(env) && env >= 0) return env;
  const cfg = readVibeConfig().minFreeGb;
  return typeof cfg === 'number' && Number.isFinite(cfg) && cfg >= 0 ? cfg : 5;
}

/** The render lane size: how many Remotion renders may run at once. VIBE_MAX_RENDER_JOBS overrides
 *  vibe.config.json maxRenderJobs (default 1 — renders are GPU/encode-heavy and serialize best). */
export function maxRenderJobs(): number {
  return Number(process.env.VIBE_MAX_RENDER_JOBS) || readVibeConfig().maxRenderJobs || 1;
}

// ── job model ──────────────────────────────────────────────────────────────────
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export type JobSpec =
  | { kind: 'capability'; verb: string; args: string[]; project?: string; then?: ChainSpec }
  | {
      kind: 'render';
      compId: string;
      preset: Preset;
      outName: string;
      propsFile?: string;
      frames?: string;
      project?: string;
      then?: ChainSpec;
    };

/** A serializable follow-up capability job, enqueued when the parent succeeds (deliver → loudnorm,
 *  download-media → reference-analyze). `$PARENT_OUTPUT` in args resolves to the parent's first output. */
export interface ChainSpec {
  verb: string;
  args: string[];
  project?: string;
  label?: string;
}

export const PARENT_OUTPUT_TOKEN = '$PARENT_OUTPUT';

/** Substitute `$PARENT_OUTPUT` chain args with the parent's first output.
 *  Returns null when the token is needed but the parent produced no outputs (chain must be skipped). */
export function resolveChainArgs(args: string[], parentOutputs: string[] | undefined): string[] | null {
  if (!args.includes(PARENT_OUTPUT_TOKEN)) return args;
  const first = parentOutputs?.[0];
  if (!first) return null;
  return args.map((a) => (a === PARENT_OUTPUT_TOKEN ? first : a));
}

export interface JobRecord {
  id: string;
  kind: 'capability' | 'render';
  label: string;
  project?: string;
  status: JobStatus;
  progress?: number; // 0..1
  frame?: number;
  totalFrames?: number;
  etaS?: number;
  logTail: string[];
  envelope?: CapabilityResult;
  error?: string;
  outputs?: string[];
  spec: JobSpec;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

const MAX_LOG_LINES = 200;

/** Concurrency lanes: Remotion renders serialize into a small lane (size from maxRenderJobs()).
 *  NVENC/ffmpeg encodes max 2; capability CLIs max 2. */
type Lane = 'render' | 'encode' | 'capability';
const STATIC_LANE_CONCURRENCY: Record<Exclude<Lane, 'render'>, number> = { encode: 2, capability: 2 };

function laneConcurrency(lane: Lane): number {
  return lane === 'render' ? maxRenderJobs() : STATIC_LANE_CONCURRENCY[lane];
}

function jobLane(j: JobRecord): Lane {
  return j.spec.kind === 'render' ? 'render' : 'capability';
}

const jobs = new Map<string, JobRecord>();
const order: string[] = []; // FIFO queue discipline
const children = new Map<string, ChildProcessWithoutNullStreams>();
let nextId = 0;

function newJobId(): string {
  return `job-${++nextId}-${Date.now().toString(36)}`;
}

/** Reset all job state (tests only — each integration file gets a clean table). */
export function resetJobsForTests(): void {
  for (const id of children.keys()) killChild(id);
  jobs.clear();
  order.length = 0;
  nextId = 0;
}

function publicJob(j: JobRecord): JobRecord {
  return j; // spec is serializable by design (ChainSpec instead of closures)
}

function emitJob(j: JobRecord): void {
  broadcast('jobs', { type: 'job', job: publicJob(j) });
}

function runningCount(lane: Lane): number {
  let n = 0;
  for (const j of jobs.values()) if (j.status === 'running' && jobLane(j) === lane) n++;
  return n;
}

/** Enqueue a job and pump the queue. Returns the (queued) record. */
export function enqueueJob(spec: JobSpec, label?: string): JobRecord {
  const job: JobRecord = {
    id: newJobId(),
    kind: spec.kind,
    label:
      label ??
      (spec.kind === 'capability'
        ? `${spec.verb} ${spec.args.slice(0, 3).join(' ')}`
        : `render ${spec.compId} · ${spec.preset}`),
    project: spec.project,
    status: 'queued',
    logTail: [],
    spec,
    createdAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  order.push(job.id);
  emitJob(job);
  pump();
  return job;
}

function pump(): void {
  for (const id of order) {
    const j = jobs.get(id);
    if (!j || j.status !== 'queued') continue;
    const lane = jobLane(j);
    if (runningCount(lane) >= laneConcurrency(lane)) continue;
    void startJob(j);
  }
}

/**
 * Resolve the render argv WITHOUT importing template code.
 *
 * The engine's UI server could `import { presetArgs }` from its own capabilities tree and build
 * the remotion argv inline. This package CANNOT import template code (preset definitions are
 * engine-owned and must not be duplicated here, or they'd drift). Instead we run the real
 * render-preset capability in `--dry-run` mode, which emits an envelope whose `metrics.argv` is
 * `['remotion', 'render', ...renderArgs]`. We strip the leading 'remotion','render' and use the
 * remaining argv verbatim — a single source of truth for the preset definitions.
 *
 * The output file path is the SECOND positional in renderArgs (`out/<outName>.<ext>`).
 */
async function resolveRenderArgs(spec: Extract<JobSpec, { kind: 'render' }>): Promise<string[]> {
  const args = ['--preset', spec.preset, '--comp', spec.compId, '--out', spec.outName];
  if (spec.propsFile) args.push('--props', spec.propsFile);
  args.push('--dry-run');
  const r = await captureTsx('capabilities/deliver/render-preset.ts', args);
  const env = parseEnvelope(r.stdout);
  const argv = (env?.metrics as { argv?: unknown })?.argv;
  if (!Array.isArray(argv) || argv.length < 2) {
    throw new Error(`could not resolve render args for preset "${spec.preset}" (dry-run produced no argv)`);
  }
  // strip the leading 'remotion','render' — keep only the render positionals + flags.
  const renderArgs = (argv as string[]).slice(2);
  if (spec.frames) renderArgs.push(`--frames=${spec.frames}`);
  return renderArgs;
}

/** The absolute output path a render produces: out/<outName>.<ext>, resolved against projectDir().
 *  renderArgs[1] is `out/<outName>.<ext>` (relative); we resolve it against the project. */
function renderOutputPath(renderArgs: string[]): string {
  const rel = renderArgs[1];
  if (!rel) throw new Error('render args have no output positional');
  return path.isAbsolute(rel) ? rel : path.join(projectDir(), rel);
}

async function startJob(j: JobRecord): Promise<void> {
  j.status = 'running';
  j.startedAt = new Date().toISOString();
  emitJob(j);

  // For render jobs, resolve the argv + output path first (dry-run resolve; see resolveRenderArgs).
  let child: ChildProcessWithoutNullStreams;
  let renderOut: string | null = null;
  try {
    if (j.spec.kind === 'capability') {
      const def = VERB_WHITELIST[j.spec.verb];
      if (!def) throw new Error(`verb "${j.spec.verb}" is not whitelisted`);
      child =
        def.runner === 'py' ? spawnVenvPy(def.script, j.spec.args) : spawnTsx(def.script, j.spec.args);
    } else {
      const fake = process.env.VIBE_RENDER_CMD; // tests: a node script that mimics remotion render
      if (fake) {
        // Mirror the engine's fake-render contract exactly: the seam still resolves real preset
        // argv (so the test exercises the dry-run resolve), then spawns the fake binary with
        // `render` + those argv. The fake writes the output file the contract expects.
        const renderArgs = await resolveRenderArgs(j.spec);
        renderOut = renderOutputPath(renderArgs);
        child = spawn(process.execPath, [fake, 'render', ...renderArgs], {
          cwd: projectDir(),
          env: process.env,
          windowsHide: true,
        }) as ChildProcessWithoutNullStreams;
      } else {
        const renderArgs = await resolveRenderArgs(j.spec);
        renderOut = renderOutputPath(renderArgs);
        child = spawn(process.execPath, [projectRemotionCli(), 'render', ...renderArgs], {
          cwd: projectDir(),
          env: process.env,
          windowsHide: true,
        }) as ChildProcessWithoutNullStreams;
      }
    }
  } catch (e) {
    j.status = 'failed';
    j.error = e instanceof Error ? e.message : String(e);
    j.finishedAt = new Date().toISOString();
    emitJob(j);
    pump();
    return;
  }
  children.set(j.id, child);

  let stdoutAll = '';
  let lastProgressBroadcast = 0;

  const onLine = (line: string): void => {
    if (!line.trim()) return;
    j.logTail.push(line.length > 400 ? line.slice(0, 399) + '…' : line);
    if (j.logTail.length > MAX_LOG_LINES) j.logTail.splice(0, j.logTail.length - MAX_LOG_LINES);
    const p = parseRenderProgress(line);
    if (p) {
      j.frame = p.frame;
      j.totalFrames = p.total;
      j.progress = Math.min(1, p.frame / p.total);
      if (j.startedAt && p.frame > 0) {
        const elapsedS = (Date.now() - new Date(j.startedAt).getTime()) / 1000;
        j.etaS = Math.max(0, Math.round((elapsedS / p.frame) * (p.total - p.frame)));
      }
    }
    // throttle progress/log broadcasts to ~2/s; state changes always broadcast.
    const now = Date.now();
    if (now - lastProgressBroadcast > 500) {
      lastProgressBroadcast = now;
      emitJob(j);
    }
  };

  const feed = (chunk: Buffer, store: boolean): void => {
    const text = chunk.toString();
    if (store) stdoutAll += text;
    for (const line of text.split(/\r?\n/)) onLine(line);
  };
  child.stdout.on('data', (d: Buffer) => feed(d, true));
  child.stderr.on('data', (d: Buffer) => feed(d, false));

  child.on('error', (e) => {
    children.delete(j.id);
    if (j.status === 'cancelled') return;
    j.status = 'failed';
    j.error = e.message;
    j.finishedAt = new Date().toISOString();
    emitJob(j);
    pump();
  });

  child.on('close', (code) => {
    children.delete(j.id);
    if (j.status === 'cancelled') {
      pump();
      return;
    }
    j.finishedAt = new Date().toISOString();
    if (j.spec.kind === 'capability') {
      const env = parseEnvelope(stdoutAll);
      if (env) {
        j.envelope = env;
        j.outputs = env.outputs;
        if (env.success && code === 0) {
          j.status = 'done';
          j.progress = 1;
        } else {
          j.status = 'failed';
          j.error = env.error ?? `exit ${code}`;
        }
      } else {
        // no parseable envelope → the job failed abnormally; show the raw tail.
        j.status = 'failed';
        j.error = `no result envelope (exit ${code}) — see log tail`;
      }
    } else {
      const out = renderOut;
      if (out && code === 0 && fs.existsSync(out) && fs.statSync(out).size > 0) {
        j.status = 'done';
        j.progress = 1;
        j.outputs = [out];
      } else {
        j.status = 'failed';
        j.error =
          code === 0
            ? `render exited 0 but produced no file at ${out ?? '(unknown)'}`
            : `render failed (exit ${code})`;
      }
    }
    emitJob(j);
    // chain: enqueue the follow-up capability job on success (deliver → loudnorm,
    // download-media → reference-analyze).
    if (j.status === 'done' && j.spec.then) {
      const t = j.spec.then;
      const args = resolveChainArgs(t.args, j.outputs);
      if (args) {
        enqueueJob({ kind: 'capability', verb: t.verb, args, project: t.project ?? j.project }, t.label);
      } else {
        // $PARENT_OUTPUT had nothing to bind to — surface it instead of silently dropping the chain.
        j.logTail.push(`chain "${t.label ?? t.verb}" skipped: parent produced no outputs`);
        emitJob(j);
      }
    }
    pump();
  });
}

function killChild(id: string): void {
  const child = children.get(id);
  if (!child) return;
  try {
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    /* best-effort */
  }
}

export function cancelJob(id: string): JobRecord | null {
  const j = jobs.get(id);
  if (!j) return null;
  if (j.status === 'queued' || j.status === 'running') {
    j.status = 'cancelled';
    j.finishedAt = new Date().toISOString();
    killChild(id);
    emitJob(j);
    pump();
  }
  return j;
}

export function retryJob(id: string): JobRecord | null {
  const j = jobs.get(id);
  if (!j) return null;
  if (j.status !== 'failed' && j.status !== 'cancelled') return j;
  return enqueueJob(j.spec, j.label);
}

export function listJobs(): JobRecord[] {
  return [...jobs.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// ── system footer (disk + GPU, best-effort, cached) ───────────────────────────
interface SystemInfo {
  freeGb: number;
  totalGb: number;
  gpu: { usedMb: number; totalMb: number } | null;
}
let sysCache: { at: number; info: SystemInfo } | null = null;

function queryGpu(): Promise<SystemInfo['gpu']> {
  return new Promise((resolve) => {
    try {
      const child = spawn('nvidia-smi', ['--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits'], {
        windowsHide: true,
      });
      let out = '';
      child.stdout?.on('data', (d) => (out += d.toString()));
      child.on('error', () => resolve(null));
      child.on('close', () => {
        const m = out.trim().split(/\r?\n/)[0]?.match(/(\d+)\s*,\s*(\d+)/);
        resolve(m && m[1] !== undefined && m[2] !== undefined ? { usedMb: parseInt(m[1], 10), totalMb: parseInt(m[2], 10) } : null);
      });
    } catch {
      resolve(null);
    }
  });
}

async function systemInfo(): Promise<SystemInfo> {
  if (sysCache && Date.now() - sysCache.at < 5000) return sysCache.info;
  const disk = freeDiskGb(outDir());
  const gpu = await queryGpu();
  const info: SystemInfo = { freeGb: +disk.freeGb.toFixed(1), totalGb: +disk.totalGb.toFixed(1), gpu };
  sysCache = { at: Date.now(), info };
  return info;
}

// ── verify helpers (QA screen) ─────────────────────────────────────────────────

/** Newest video file directly inside `dir` (browser-only deliveries don't touch the manifest). */
function newestVideoIn(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  let best: { p: string; mtimeMs: number } | null = null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile() || !/\.(mp4|mov|webm|mkv)$/i.test(e.name)) continue;
    const p = path.join(dir, e.name);
    const mtimeMs = fs.statSync(p).mtimeMs;
    if (!best || mtimeMs > best.mtimeMs) best = { p, mtimeMs };
  }
  return best?.p ?? null;
}

/** Pick the default video for a QA verify run: the newest EXISTING file among the late stages'
 *  active outputs (deliver → assemble → motion); falls back to the newest mp4 the UI itself
 *  delivered (deliver/<p>/, then out/<p>/) — the UI job runner never calls completeStage, so a
 *  browser-only deliver leaves no stage outputs to find. */
export function defaultVerifyVideo(project: string): string | null {
  if (!manifestExists(project)) return null;
  const m = readManifest(project);
  const stageOrder: StageName[] = ['deliver', 'assemble', 'motion'];
  for (const name of stageOrder) {
    const s = (m.stages as Record<string, Stage>)[name];
    if (!s) continue;
    const outputs = [...(activeVersion(s)?.outputs ?? []), ...s.outputs];
    for (const o of outputs) {
      const abs = path.isAbsolute(o) ? o : path.join(projectDir(), o);
      if (/\.(mp4|mov|webm|mkv)$/i.test(abs) && fs.existsSync(abs)) return abs;
    }
  }
  return (
    newestVideoIn(path.join(deliverDir(), project)) ?? newestVideoIn(path.join(outDir(), project))
  );
}

// ── routes ─────────────────────────────────────────────────────────────────────
const runBody = z.object({
  verb: z.string(),
  args: z.array(z.string()).default([]),
  project: z.string().optional(),
});

const renderBody = z.object({
  compId: z.string().min(1),
  preset: z.string(),
  outName: z.string().min(1).optional(),
  propsFile: z.string().optional(),
  frames: z
    .string()
    .regex(/^\d+-\d+$/)
    .optional(),
  project: z.string().optional(),
  dryRun: z.boolean().optional(),
});

const deliverBody = z.object({
  project: z.string().min(1),
  items: z
    .array(z.object({ compId: z.string().min(1), preset: z.string(), outName: z.string().min(1).optional() }))
    .min(1),
  loudnorm: z.boolean().default(true),
  dryRun: z.boolean().optional(),
  /** render with the fine-tuned props (public/<p>/props.json) via render-preset --props. */
  propsFile: z.string().optional(),
});

const verifyBody = z.object({
  video: z.string().optional(),
  captions: z.string().optional(),
  context: z.string().optional(),
  eyes: z.boolean().optional(),
});

/** Safe file-ish name: keep path segments, strip anything weird. */
function safeOutName(s: string): string {
  return s.replace(/[^a-zA-Z0-9/_-]+/g, '-').replace(/^[/-]+|[/-]+$/g, '');
}

function diskGuard(): { ok: true } | { ok: false; error: string } {
  const min = minFreeGb();
  const { freeGb } = freeDiskGb(outDir());
  if (freeGb < min) {
    return {
      ok: false,
      error: `only ${freeGb.toFixed(1)} GB free on the output drive (< ${min} GB) — free space before rendering`,
    };
  }
  return { ok: true };
}

/** Build the loudnorm chain spec: out/<outName>.mp4 → deliver/<project>/<base>-loudnorm.mp4.
 *  Mirrors the engine's deliver→loudnorm chain; the rendered file path is resolved by the chain
 *  via $PARENT_OUTPUT, so we compute the loudnorm OUTPUT path from the outName here. */
function loudnormChain(project: string, spec: Extract<JobSpec, { kind: 'render' }>): ChainSpec {
  const base = path.basename(spec.outName).replace(/\.[^.]+$/, '');
  const dir = path.join(deliverDir(), project);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${base}-loudnorm.mp4`);
  return {
    verb: 'deliver/loudnorm',
    args: ['--in', PARENT_OUTPUT_TOKEN, '--out', out, '--project', project],
    project,
    label: `loudnorm → deliver/${project}/${base}-loudnorm.mp4`,
  };
}

export function registerJobRoutes(app: FastifyInstance): void {
  // run a whitelisted capability verb.
  app.post<{ Body: unknown }>('/api/run', async (req, reply) => {
    const parsed = runBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'bad body' });
    const { verb, args, project } = parsed.data;
    if (!isWhitelistedVerb(verb)) {
      return reply.code(403).send({ error: `verb "${verb}" is not whitelisted — the job API is not a shell` });
    }
    const job = enqueueJob({ kind: 'capability', verb, args, project });
    return { job: publicJob(job) };
  });

  // queue a Remotion render via a named preset.
  app.post<{ Body: unknown }>('/api/render', async (req, reply) => {
    const parsed = renderBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'bad body' });
    const b = parsed.data;
    if (!isPreset(b.preset)) return reply.code(400).send({ error: `unknown preset "${b.preset}"` });
    const outName = safeOutName(b.outName ?? `${b.project ?? '_scratch'}/${b.compId}-${b.preset}`);
    if (b.dryRun) {
      const args = ['--preset', b.preset, '--comp', b.compId, '--out', outName, '--dry-run'];
      if (b.project) args.push('--project', b.project);
      const job = enqueueJob(
        { kind: 'capability', verb: 'deliver/render-preset', args, project: b.project },
        `dry-run ${b.compId} · ${b.preset}`,
      );
      return { job: publicJob(job) };
    }
    const guard = diskGuard();
    if (!guard.ok) return reply.code(507).send({ error: guard.error });
    const spec: Extract<JobSpec, { kind: 'render' }> = {
      kind: 'render',
      compId: b.compId,
      preset: b.preset,
      outName,
      project: b.project,
    };
    if (b.propsFile) spec.propsFile = b.propsFile;
    if (b.frames) spec.frames = b.frames;
    const job = enqueueJob(spec);
    return { job: publicJob(job) };
  });

  // deliver: render each selected variant, then loudnorm into deliver/<project>/.
  app.post<{ Body: unknown }>('/api/deliver', async (req, reply) => {
    const parsed = deliverBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'bad body' });
    const b = parsed.data;
    for (const item of b.items) {
      if (!isPreset(item.preset)) return reply.code(400).send({ error: `unknown preset "${item.preset}"` });
    }
    if (!b.dryRun) {
      const guard = diskGuard();
      if (!guard.ok) return reply.code(507).send({ error: guard.error });
    }
    const queued: JobRecord[] = [];
    for (const item of b.items) {
      const preset = item.preset as Preset;
      const outName = safeOutName(item.outName ?? `${b.project}/${item.compId}-${preset}`);
      if (b.dryRun) {
        const args = ['--preset', preset, '--comp', item.compId, '--out', outName, '--dry-run', '--project', b.project];
        if (b.propsFile) args.push('--props', b.propsFile);
        queued.push(
          enqueueJob(
            { kind: 'capability', verb: 'deliver/render-preset', args, project: b.project },
            `dry-run ${item.compId} · ${preset}`,
          ),
        );
        continue;
      }
      const spec: Extract<JobSpec, { kind: 'render' }> = {
        kind: 'render',
        compId: item.compId,
        preset,
        outName,
        project: b.project,
      };
      if (b.propsFile) spec.propsFile = b.propsFile;
      if (b.loudnorm) spec.then = loudnormChain(b.project, spec);
      queued.push(enqueueJob(spec));
    }
    return { jobs: queued.map(publicJob) };
  });

  app.get('/api/jobs', async () => ({ jobs: listJobs() }));

  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
    const j = jobs.get(req.params.id);
    if (!j) return reply.code(404).send({ error: `no job "${req.params.id}"` });
    return { job: publicJob(j) };
  });

  app.post<{ Params: { id: string } }>('/api/jobs/:id/cancel', async (req, reply) => {
    const j = cancelJob(req.params.id);
    if (!j) return reply.code(404).send({ error: `no job "${req.params.id}"` });
    return { job: publicJob(j) };
  });

  app.post<{ Params: { id: string } }>('/api/jobs/:id/retry', async (req, reply) => {
    const j = retryJob(req.params.id);
    if (!j) return reply.code(404).send({ error: `no job "${req.params.id}"` });
    return { job: publicJob(j) };
  });

  app.get('/api/system', async () => systemInfo());

  // run the split verifier for a project (QA screen "Run verify").
  app.post<{ Params: { id: string }; Body: unknown }>('/api/projects/:id/verify', async (req, reply) => {
    const { id } = req.params;
    if (!manifestExists(id)) return reply.code(404).send({ error: `no manifest for project "${id}"` });
    const parsed = verifyBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'bad body' });
    const b = parsed.data;
    const video = b.video ?? defaultVerifyVideo(id);
    if (!video || !fs.existsSync(video)) {
      return reply.code(409).send({ error: 'no finished video found to verify — render or deliver something first' });
    }
    const args = ['--in', video, '--project', id];
    if (b.captions) args.push('--captions', b.captions);
    if (b.context) args.push('--context', b.context);
    if (b.eyes === false) args.push('--no-eyes');
    if (b.eyes === true) args.push('--eyes');
    const job = enqueueJob(
      { kind: 'capability', verb: 'orchestrate/verify', args, project: id },
      `verify ${path.basename(video)}`,
    );
    return { job: publicJob(job) };
  });
}
