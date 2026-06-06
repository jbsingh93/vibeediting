/**
 * capabilities/orchestrate/manifest.schema.ts — the manifest CONTRACT (plan P2.1; AG §5.3).
 *
 * The `manifest.json` is the SINGLE SOURCE OF TRUTH for a project: every stage's inputs, params,
 * outputs, status, the approvals it requires, and the retry policy. The planner (the
 * `video-editor` router) writes it; executors (capabilities) read their one stage and run it;
 * the verifier (verify.ts) gates delivery against it.
 *
 * Field names are snake_case to match the research's verbatim schema (AG §5.3) — the manifest is a
 * cross-language, git-tracked, human-editable contract, not a TS-internal object. Lives (durable,
 * git-tracked, GAP-9) at `projects/<project>/manifest.json`; the disposable per-stage artifacts live
 * under `out/work/<project>/<stage>/`.
 *
 * Zod 4 (already a dependency; see src/components/captions.ts). Dependency-free otherwise (runs under tsx).
 */
import { z } from 'zod';

/** The capability stages a manifest can track (mirrors the capabilities/ tree). */
export const STAGE_NAMES = [
  'acquire',
  'screen-record',
  'ingest',
  'audio',
  'color',
  'motion',
  '3d',
  'vfx',
  'generate',
  'assemble',
  'deliver',
] as const;
export type StageName = (typeof STAGE_NAMES)[number];

/** Per-stage lifecycle. `blocked` = waiting on a human approval gate (P2.6). `complete` is terminal. */
export const stageStatusSchema = z.enum(['pending', 'running', 'complete', 'failed', 'blocked']);
export type StageStatus = z.infer<typeof stageStatusSchema>;

/** Whole-project rollup status, derived from the stages on every write. */
export const manifestStatusSchema = z.enum(['planned', 'running', 'blocked', 'complete', 'failed']);
export type ManifestStatus = z.infer<typeof manifestStatusSchema>;

/**
 * One forked version of a stage's output set (P2.6b / GAP-55). When `completeStage` is called on
 * an already-`complete` stage with a *different* `params_hash`, the new run is appended here as
 * v{K+1} (approved=false) instead of overwriting the approved v1 — Chronixel's regret-protection
 * rule. Render filenames carry the matching `-v{K}` suffix (P3.5b).
 */
export const versionRecordSchema = z.object({
  v: z.number().int().positive(),
  approved: z.boolean().default(false),
  outputs: z.array(z.string()).default([]),
  params_hash: z.string().optional(),
  created_at: z.string(),
  finished_at: z.string().optional(),
});
export type VersionRecord = z.infer<typeof versionRecordSchema>;

/** One stage's record. `outputs` are absolute paths; `params` are the executor's inputs. */
export const stageSchema = z.object({
  status: stageStatusSchema.default('pending'),
  params: z.record(z.string(), z.unknown()).default({}),
  outputs: z.array(z.string()).default([]),
  attempts: z.number().int().nonnegative().default(0),
  started_at: z.string().optional(),
  finished_at: z.string().optional(),
  error: z.string().optional(),
  /** approval-gate state (P2.6): present only for a stage listed in approvals_required. */
  approved: z.boolean().optional(),
  /** sha256 (or any deterministic digest) of the params/props that produced `outputs` (P2.6b). */
  params_hash: z.string().optional(),
  /** forked output sets (P2.6b / GAP-55). Empty until the first revision. */
  versions: z.array(versionRecordSchema).optional(),
});
export type Stage = z.infer<typeof stageSchema>;

/** Bounded-retry policy (AG §5.3 retry_policy). */
export const retryPolicySchema = z.object({
  max_retries: z.number().int().nonnegative().default(2),
  backoff: z.enum(['none', 'linear', 'exponential']).default('exponential'),
});
export type RetryPolicy = z.infer<typeof retryPolicySchema>;

const isStageName = (k: string): k is StageName => (STAGE_NAMES as readonly string[]).includes(k);

export const manifestSchema = z.object({
  project_id: z.string().min(1),
  version: z.number().int().positive().default(1),
  status: manifestStatusSchema.default('planned'),
  created_at: z.string(),
  updated_at: z.string(),
  /** brief / source assets / target format etc. — whatever the planner wrote. */
  inputs: z.record(z.string(), z.unknown()).default({}),
  /**
   * stages keyed by StageName. Modeled as a string-record + refine (robust across Zod 4 minor
   * versions vs partial/total enum-record semantics); the refine enforces valid keys, a subset is fine.
   */
  stages: z
    .record(z.string(), stageSchema)
    .refine((obj) => Object.keys(obj).every(isStageName), {
      message: `stage keys must each be one of: ${STAGE_NAMES.join(', ')}`,
    })
    .default({}),
  /** stages that STOP for human approval before they may complete (P2.6). */
  approvals_required: z.array(z.enum(STAGE_NAMES)).default([]),
  retry_policy: retryPolicySchema.default({ max_retries: 2, backoff: 'exponential' }),
  notes: z.string().optional(),
});
export type Manifest = z.infer<typeof manifestSchema>;

/**
 * Validate arbitrary data as a Manifest, throwing a readable error (mirrors parseCaptions) — fail
 * fast rather than driving a pipeline off a malformed contract.
 */
export function parseManifest(data: unknown): Manifest {
  const result = manifestSchema.safeParse(data);
  if (!result.success) {
    const preview = result.error.issues
      .slice(0, 6)
      .map((i) => `[${i.path.join('.') || 'root'}] ${i.message}`)
      .join('; ');
    throw new Error(`Invalid manifest.json (${result.error.issues.length} issue(s)): ${preview}`);
  }
  return result.data;
}

/** A fresh manifest for `projectId` with sane defaults; the planner fills inputs/stages/approvals. */
export function emptyManifest(
  projectId: string,
  opts: {
    inputs?: Record<string, unknown>;
    approvals_required?: StageName[];
    retry_policy?: Partial<RetryPolicy>;
    notes?: string;
  } = {},
): Manifest {
  const now = new Date().toISOString();
  return manifestSchema.parse({
    project_id: projectId,
    created_at: now,
    updated_at: now,
    inputs: opts.inputs ?? {},
    stages: {},
    approvals_required: opts.approvals_required ?? [],
    retry_policy: opts.retry_policy ?? {},
    notes: opts.notes,
  });
}
