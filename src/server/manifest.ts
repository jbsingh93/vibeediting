/**
 * src/server/manifest.ts — package-side manifest service (port of the engine's
 * orchestrate/manifest.ts, operating on the served project via context.projectsRoot()).
 *
 * Same rules as the engine:
 *   - status transitions are validated (pending→running→complete|failed|blocked; failed→running);
 *   - a `complete` stage is TERMINAL — outputs never overwritten; revisions auto-fork v{K+1};
 *   - writes are ATOMIC (.tmp + rename, with the Windows AV EPERM retry);
 *   - `approvals_required` stages STOP at a human gate before they may complete.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { projectsRoot } from './context.js';
import {
  emptyManifest,
  parseManifest,
  stageSchema,
  type Manifest,
  type Stage,
  type StageName,
  type StageStatus,
  type VersionRecord,
} from './manifest.schema.js';

export { projectsRoot };

export function manifestPath(project: string): string {
  return path.join(projectsRoot(), project, 'manifest.json');
}

export function manifestExists(project: string): boolean {
  return fs.existsSync(manifestPath(project));
}

/** Read + validate the manifest (throws if missing or malformed). */
export function readManifest(project: string): Manifest {
  const p = manifestPath(project);
  if (!fs.existsSync(p)) throw new Error(`no manifest for project "${project}" (${p})`);
  return parseManifest(JSON.parse(fs.readFileSync(p, 'utf8')));
}

/** Atomic write: validate, bump updated_at + derive rollup status, write .tmp, rename. */
export function writeManifest(m: Manifest): Manifest {
  const validated = parseManifest(m);
  validated.updated_at = new Date().toISOString();
  validated.status = rollupStatus(validated);
  const p = manifestPath(validated.project_id);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(validated, null, 2) + '\n', 'utf8');
  // Windows AV/search-indexer can briefly hold the target → transient EPERM on rename.
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, p);
      break;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if ((code === 'EPERM' || code === 'EACCES' || code === 'EBUSY') && attempt < 4) {
        const until = Date.now() + 25 * (attempt + 1);
        while (Date.now() < until) {
          /* short sync backoff — manifest writes are tiny + rare */
        }
        continue;
      }
      throw e;
    }
  }
  return validated;
}

/** Create (and persist) a new manifest; refuses to clobber unless force. */
export function createManifest(
  project: string,
  opts: Parameters<typeof emptyManifest>[1] & { force?: boolean } = {},
): Manifest {
  if (manifestExists(project) && !opts.force) {
    throw new Error(`manifest already exists for "${project}" — pass force to overwrite`);
  }
  return writeManifest(emptyManifest(project, opts));
}

/** Whole-project status derived from its stages. */
export function rollupStatus(m: Manifest): Manifest['status'] {
  const stages = Object.values(m.stages) as Stage[];
  if (stages.length === 0) return 'planned';
  if (stages.some((s) => s.status === 'failed')) return 'failed';
  if (stages.some((s) => s.status === 'blocked')) return 'blocked';
  if (stages.some((s) => s.status === 'running')) return 'running';
  if (stages.every((s) => s.status === 'complete')) return 'complete';
  return 'running';
}

/** Legal status transitions. `complete` is terminal. */
const TRANSITIONS: Record<StageStatus, StageStatus[]> = {
  pending: ['running', 'blocked'],
  running: ['complete', 'failed', 'blocked'],
  failed: ['running', 'pending'],
  blocked: ['running', 'pending'],
  complete: [],
};

export function assertTransition(from: StageStatus, to: StageStatus): void {
  if (from === to) return;
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(
      `illegal stage transition ${from} → ${to}` +
        (from === 'complete'
          ? ' (a complete stage is terminal — its outputs are never overwritten)'
          : ''),
    );
  }
}

function getOrInit(m: Manifest, stage: StageName): Stage {
  const existing = (m.stages as Record<string, Stage>)[stage];
  return existing ?? stageSchema.parse({});
}

function putStage(m: Manifest, stage: StageName, s: Stage): void {
  (m.stages as Record<string, Stage>)[stage] = s;
}

/** Begin a stage: pending|failed|blocked → running. */
export function startStage(
  project: string,
  stage: StageName,
  params?: Record<string, unknown>,
): Manifest {
  const m = readManifest(project);
  const s = getOrInit(m, stage);
  assertTransition(s.status, 'running');
  s.status = 'running';
  s.attempts += 1;
  s.started_at = new Date().toISOString();
  s.error = undefined;
  if (params) s.params = { ...s.params, ...params };
  putStage(m, stage, s);
  return writeManifest(m);
}

/** True if this stage must stop for human approval and has not been approved yet. */
export function isApprovalPending(m: Manifest, stage: StageName): boolean {
  if (!m.approvals_required.includes(stage)) return false;
  return getOrInit(m, stage).approved !== true;
}

/** Approve a gated stage; a blocked stage holding outputs transitions to complete. */
export function approveStage(project: string, stage: StageName): Manifest {
  const m = readManifest(project);
  if (!m.approvals_required.includes(stage)) {
    throw new Error(`stage "${stage}" does not require approval (not in approvals_required)`);
  }
  const s = getOrInit(m, stage);
  s.approved = true;
  if (s.status === 'blocked') {
    s.status = 'complete';
    s.finished_at = new Date().toISOString();
  }
  putStage(m, stage, s);
  return writeManifest(m);
}

/** The version record currently considered authoritative (approved, else lowest v). */
export function activeVersion(s: Stage): VersionRecord | undefined {
  if (!s.versions || s.versions.length === 0) return undefined;
  return s.versions.find((r) => r.approved) ?? s.versions[0];
}

/**
 * Re-approve a specific forked version: target.approved=true, all others unapproved,
 * stage.outputs/params_hash swap to the target. Both versions' files stay on disk.
 */
export function approveVersion(project: string, stage: StageName, v: number): Manifest {
  const m = readManifest(project);
  const s = getOrInit(m, stage);
  const versions = s.versions ?? [];
  const target = versions.find((r) => r.v === v);
  if (!target) {
    throw new Error(
      `stage "${stage}" has no v${v} (versions: ${versions.map((r) => `v${r.v}`).join(', ') || 'none'})`,
    );
  }
  for (const r of versions) r.approved = r.v === v;
  s.versions = versions;
  s.outputs = target.outputs;
  s.params_hash = target.params_hash;
  putStage(m, stage, s);
  return writeManifest(m);
}

/** Append a hand-edit VersionRecord to a stage (the fine-tune fork gate uses this). */
export function appendVersion(
  project: string,
  stage: StageName,
  record: Omit<VersionRecord, 'v'>,
): { manifest: Manifest; v: number } {
  const m = readManifest(project);
  const s = getOrInit(m, stage);
  const versions: VersionRecord[] = s.versions ? [...s.versions] : [];
  const nextV = versions.length === 0 ? 1 : Math.max(...versions.map((r) => r.v)) + 1;
  versions.push({ ...record, v: nextV });
  s.versions = versions;
  putStage(m, stage, s);
  return { manifest: writeManifest(m), v: nextV };
}
