/**
 * capabilities/orchestrate/manifest.ts — read/update the project manifest (plan P2.2 + P2.6).
 *
 * The decision/execution boundary (AG §5.4): the planner writes the manifest; an executor reads its
 * ONE stage, runs it, and records outputs. Rules enforced here:
 *   - status transitions are validated (pending→running→complete|failed|blocked; failed→running retry);
 *   - a `complete` stage is TERMINAL — its outputs are NEVER overwritten (AG §5.4 rule, idempotency);
 *   - writes are ATOMIC (.tmp + rename) so a crash never leaves a half-written manifest;
 *   - `approvals_required` stages STOP at a human gate (P2.6) before they may complete.
 *
 * State home (GAP-9): `projects/<project>/manifest.json`, git-tracked like captions. Override the
 * projects root with VIBE_PROJECTS_DIR (used by the test suite to avoid polluting git).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from '../_env/contract';
import {
  emptyManifest,
  type Manifest,
  type Stage,
  type StageName,
  type StageStatus,
  type VersionRecord,
  parseManifest,
  stageSchema,
} from './manifest.schema';

/** The durable, git-tracked projects root (override with VIBE_PROJECTS_DIR for tests). */
export function projectsRoot(): string {
  return process.env.VIBE_PROJECTS_DIR ? path.resolve(process.env.VIBE_PROJECTS_DIR) : path.join(REPO_ROOT, 'projects');
}

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

/** Atomic write: validate, bump updated_at + derive rollup status, write .tmp, rename over the target. */
export function writeManifest(m: Manifest): Manifest {
  const validated = parseManifest(m);
  validated.updated_at = new Date().toISOString();
  validated.status = rollupStatus(validated);
  const p = manifestPath(validated.project_id);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(validated, null, 2) + '\n', 'utf8');
  // Windows AV/search-indexer can briefly hold the target → transient EPERM on rename.
  // Retry a few times before surfacing (the write itself stays atomic via the tmp file).
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

/** Create (and persist) a new manifest; refuses to clobber an existing one unless force. */
export function createManifest(
  project: string,
  opts: Parameters<typeof emptyManifest>[1] & { force?: boolean } = {},
): Manifest {
  if (manifestExists(project) && !opts.force) {
    throw new Error(`manifest already exists for "${project}" — pass force to overwrite`);
  }
  return writeManifest(emptyManifest(project, opts));
}

/** Whole-project status derived from its stages (called on every write). */
export function rollupStatus(m: Manifest): Manifest['status'] {
  const stages = Object.values(m.stages) as Stage[];
  if (stages.length === 0) return 'planned';
  if (stages.some((s) => s.status === 'failed')) return 'failed';
  if (stages.some((s) => s.status === 'blocked')) return 'blocked';
  if (stages.some((s) => s.status === 'running')) return 'running';
  if (stages.every((s) => s.status === 'complete')) return 'complete';
  return 'running';
}

/** Legal status transitions. `complete` is terminal (never overwrite). */
const TRANSITIONS: Record<StageStatus, StageStatus[]> = {
  pending: ['running', 'blocked'],
  running: ['complete', 'failed', 'blocked'],
  failed: ['running', 'pending'],
  blocked: ['running', 'pending'],
  complete: [], // terminal
};

export function assertTransition(from: StageStatus, to: StageStatus): void {
  if (from === to) return;
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`illegal stage transition ${from} → ${to}` + (from === 'complete' ? ' (a complete stage is terminal — its outputs are never overwritten)' : ''));
  }
}

function getOrInit(m: Manifest, stage: StageName): Stage {
  const existing = (m.stages as Record<string, Stage>)[stage];
  return existing ?? stageSchema.parse({});
}

function putStage(m: Manifest, stage: StageName, s: Stage): void {
  (m.stages as Record<string, Stage>)[stage] = s;
}

/** Begin a stage: pending|failed|blocked → running, increment attempts, stamp started_at, merge params. */
export function startStage(project: string, stage: StageName, params?: Record<string, unknown>): Manifest {
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

/**
 * Complete a stage: running → complete with its outputs. REFUSES to re-complete an already-complete
 * stage (idempotency / never overwrite). If the stage is in approvals_required and not yet approved,
 * it goes to `blocked` instead and waits for a human approval (P2.6).
 *
 * P2.6b / GAP-55 — Auto-fork on revision. When a *complete* stage is re-completed with a different
 * `params_hash` than the currently-approved record, we DO NOT overwrite the approved outputs.
 * Instead the new run is appended as `versions[v=K+1]` with `approved=false`. The approved v1 stays
 * on disk; either version can be re-approved later via `approveVersion()`. A re-completion with the
 * *same* `params_hash` (or no hash) preserves the existing "complete is terminal" contract — throws.
 */
export function completeStage(
  project: string,
  stage: StageName,
  outputs: string[],
  opts?: { params_hash?: string },
): Manifest {
  const m = readManifest(project);
  const s = getOrInit(m, stage);
  if (s.status === 'complete') {
    const activeHash = activeVersion(s)?.params_hash ?? s.params_hash;
    const newHash = opts?.params_hash;
    if (newHash && activeHash && newHash !== activeHash) {
      const versions: VersionRecord[] = s.versions ? [...s.versions] : [];
      if (versions.length === 0) {
        // First fork — seed v1 from the currently-approved record so both versions are addressable.
        versions.push({
          v: 1,
          approved: true,
          outputs: s.outputs,
          params_hash: activeHash,
          created_at: s.started_at ?? new Date().toISOString(),
          finished_at: s.finished_at,
        });
      }
      const nextV = Math.max(...versions.map((r) => r.v)) + 1;
      versions.push({
        v: nextV,
        approved: false,
        outputs,
        params_hash: newHash,
        created_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      });
      s.versions = versions;
      // status stays 'complete'; stage.outputs continues to point at the approved version.
      putStage(m, stage, s);
      return writeManifest(m);
    }
    throw new Error(
      `stage "${stage}" is already complete — refusing to overwrite its outputs` +
        (newHash ? ' (P2.6b: pass a NEW params_hash to fork to v{K+1})' : ''),
    );
  }
  if (m.approvals_required.includes(stage) && s.approved !== true) {
    assertTransition(s.status, 'blocked');
    s.status = 'blocked';
    s.outputs = outputs; // produced, but held at the gate
    if (opts?.params_hash) s.params_hash = opts.params_hash;
    putStage(m, stage, s);
    return writeManifest(m);
  }
  assertTransition(s.status, 'complete');
  s.status = 'complete';
  s.finished_at = new Date().toISOString();
  s.outputs = outputs;
  if (opts?.params_hash) s.params_hash = opts.params_hash;
  putStage(m, stage, s);
  return writeManifest(m);
}

/** Fail a stage with a reason (running → failed). */
export function failStage(project: string, stage: StageName, error: string): Manifest {
  const m = readManifest(project);
  const s = getOrInit(m, stage);
  assertTransition(s.status, 'failed');
  s.status = 'failed';
  s.finished_at = new Date().toISOString();
  s.error = error;
  putStage(m, stage, s);
  return writeManifest(m);
}

// ── P2.6 approval gates ───────────────────────────────────────────────────────

/** True if this stage must stop for human approval and has not been approved yet. */
export function isApprovalPending(m: Manifest, stage: StageName): boolean {
  if (!m.approvals_required.includes(stage)) return false;
  return getOrInit(m, stage).approved !== true;
}

/**
 * Mark a blocked/approval-gated stage as approved and (if it was holding outputs at the gate)
 * transition it to complete. Generalizes the proven human cut-point gate into a project-wide convention.
 */
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

/** A human-readable QA summary for an approval gate (what to review before approving). */
export function gateSummary(m: Manifest, stage: StageName): string {
  const s = getOrInit(m, stage);
  const lines = [
    `── APPROVAL REQUIRED — project "${m.project_id}" · stage "${stage}" ──`,
    `status: ${s.status} · attempts: ${s.attempts}`,
    `outputs (${s.outputs.length}):`,
    ...s.outputs.map((o) => `  • ${o}`),
    'params:',
    `  ${JSON.stringify(s.params)}`,
    'Review the outputs, then call approveStage() (or set stages.' + stage + '.approved=true) to proceed.',
  ];
  return lines.join('\n');
}

// ── P2.6b versioning helpers (auto-fork on revision, GAP-55) ──────────────────

/** The version record currently considered authoritative (approved, else lowest v). */
export function activeVersion(s: Stage): VersionRecord | undefined {
  if (!s.versions || s.versions.length === 0) return undefined;
  return s.versions.find((r) => r.approved) ?? s.versions[0];
}

/** All forked versions for a stage (empty until the first revision). */
export function listVersions(project: string, stage: StageName): VersionRecord[] {
  const s = getOrInit(readManifest(project), stage);
  return s.versions ?? [];
}

/**
 * Re-approve a specific forked version (P2.6b). Sets v=target.approved=true, unapproves all other
 * versions, and swaps `stage.outputs` + `stage.params_hash` to that version's record so the rest of
 * the pipeline sees the newly-approved set as authoritative. Both versions' files stay on disk.
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

// ── retry helpers ─────────────────────────────────────────────────────────────

export function canRetry(m: Manifest, stage: StageName): boolean {
  return getOrInit(m, stage).attempts <= m.retry_policy.max_retries;
}

/** Backoff before the next attempt (attempt is 1-based: the attempt we are about to make). */
export function backoffMs(m: Manifest, attempt: number): number {
  const base = 1000;
  switch (m.retry_policy.backoff) {
    case 'none':
      return 0;
    case 'linear':
      return base * Math.max(0, attempt - 1);
    case 'exponential':
      return base * 2 ** Math.max(0, attempt - 1);
  }
}
