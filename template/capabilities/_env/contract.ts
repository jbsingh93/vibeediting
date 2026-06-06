#!/usr/bin/env tsx
/**
 * capabilities/_env/contract.ts — the capability CONTRACT (plan P0.9, GAP-4).
 *
 * "Build the protocol before the workers." Every capability — TS or (via the
 * Python mirror `contract.py`) Python — speaks this one shape so the future
 * orchestration spine (P2) can drive them uniformly:
 *
 *   - a structured RESULT ENVELOPE on stdout  ({ success, capability, outputs[], metrics{}, ... })
 *   - writes to the disposable WORK DIR        (out/work/<project>/<stage>/)
 *   - appends a PROVENANCE record              (out/work/<project>/provenance.log, append-only)
 *
 * The full manifest stage-schema lands in P2 (orchestrate/); this is the lean
 * subset every P1 engine needs now. Keep it dependency-free (runs under tsx).
 */
import { spawnSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Repo root = two levels up from capabilities/_env/. */
export const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * The OPTIONAL Python venv's interpreter (created by `_env/setup-venv.ts`), per-OS.
 * Engines that need it must degrade gracefully when it does not exist (R-D).
 */
export const VENV_PY =
  process.platform === 'win32'
    ? path.join(REPO_ROOT, 'capabilities', '.venv', 'Scripts', 'python.exe')
    : path.join(REPO_ROOT, 'capabilities', '.venv', 'bin', 'python');

/** The structured envelope every capability prints (last line of stdout) as JSON. */
export interface CapabilityResult<M = Record<string, unknown>> {
  success: boolean;
  capability: string; // e.g. "audio/master", "color/grade", "acquire/download-asset"
  outputs: string[]; // absolute paths this run produced
  metrics: M; // capability-specific measurements (LUFS, sceneCuts, bytes, ...)
  warnings?: string[];
  error?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

/** A provenance line: what ran, with what, producing what (output hashes). */
export interface ProvenanceRecord {
  ts: string;
  capability: string;
  args?: string[];
  outputs?: { path: string; sha256: string; bytes: number }[];
  source?: string; // for acquire/: the origin URL
  note?: string;
}

/**
 * Resolve (and create) the disposable per-stage work directory.
 * GAP-9: work/<project>/<stage>/ is disposable under out/ (regenerable).
 */
export function workDir(project: string, stage: string): string {
  const dir = path.join(REPO_ROOT, 'out', 'work', sanitize(project), sanitize(stage));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** The per-project provenance log (append-only). Lives beside the work tree for P1; P2 may git-track it. */
export function provenancePath(project: string): string {
  const dir = path.join(REPO_ROOT, 'out', 'work', sanitize(project));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'provenance.log');
}

export function appendProvenance(project: string, rec: ProvenanceRecord): void {
  fs.appendFileSync(provenancePath(project), JSON.stringify(rec) + '\n', 'utf8');
}

export function sha256File(p: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

export function describeOutputs(paths: string[]): { path: string; sha256: string; bytes: number }[] {
  return paths
    .filter((p) => fs.existsSync(p) && fs.statSync(p).isFile())
    .map((p) => ({ path: p, sha256: sha256File(p), bytes: fs.statSync(p).size }));
}

/** Print the envelope as a single JSON line on stdout (machine-readable) — the LAST thing a capability emits. */
export function emit<M>(result: CapabilityResult<M>): void {
  process.stdout.write(JSON.stringify(result) + '\n');
}

/**
 * Wrap a capability body: time it, catch errors, always emit a valid envelope,
 * and exit non-zero on failure. `project` (when given) routes provenance.
 */
export async function runCapability<M = Record<string, unknown>>(
  capability: string,
  body: () => Promise<{ outputs: string[]; metrics: M; warnings?: string[]; project?: string; args?: string[]; source?: string }>,
): Promise<void> {
  const startedAt = new Date();
  try {
    const r = await body();
    const finishedAt = new Date();
    const result: CapabilityResult<M> = {
      success: true,
      capability,
      outputs: r.outputs,
      metrics: r.metrics,
      warnings: r.warnings,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    };
    if (r.project) {
      appendProvenance(r.project, {
        ts: finishedAt.toISOString(),
        capability,
        args: r.args,
        outputs: describeOutputs(r.outputs),
        source: r.source,
      });
    }
    emit(result);
  } catch (e) {
    const finishedAt = new Date();
    emit({
      success: false,
      capability,
      outputs: [],
      metrics: {} as M,
      error: e instanceof Error ? e.message : String(e),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    });
    process.exit(1);
  }
}

/** Read a model id from the single source of truth (_env/models.json). Honors an env override. */
export function modelId(dotPath: string): string {
  const models = JSON.parse(fs.readFileSync(path.join(__dirname, 'models.json'), 'utf8'));
  let node: unknown = models;
  for (const key of dotPath.split('.')) {
    node = (node as Record<string, unknown>)?.[key];
  }
  const entry = node as { id?: string; envOverride?: string } | undefined;
  if (!entry?.id) throw new Error(`models.json has no model at "${dotPath}"`);
  if (entry.envOverride && process.env[entry.envOverride]) return process.env[entry.envOverride] as string;
  return entry.id;
}

/** Validate an input path exists and is a file; throw a clear error otherwise (capabilities never trust argv blindly). */
export function requireInputFile(p: string | undefined, label = 'input'): string {
  if (!p) throw new Error(`missing ${label} path`);
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) throw new Error(`${label} not found: ${p}`);
  return path.resolve(p);
}

/** Run a child process, returning {status, stdout, stderr}; never throws on non-zero. */
export function run(cmd: string, args: string[], opts: { cwd?: string } = {}): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd: opts.cwd });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, '-');
}

/**
 * Load `.env` into process.env (dependency-free — tsx does not auto-load it).
 * Looks at the repo root and cwd. Never overwrites an already-set var. Never prints values.
 */
export function loadDotEnv(): void {
  const seen = new Set<string>();
  for (const file of [path.join(REPO_ROOT, '.env'), path.join(process.cwd(), '.env')]) {
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
  }
}

/** True if the named env var (or .env entry) is present — checks PRESENCE only, never reads/prints the value. */
export function hasEnv(name: string): boolean {
  loadDotEnv();
  return !!process.env[name];
}
