/**
 * src/server/manifest.schema.ts — the manifest CONTRACT, package-side mirror.
 *
 * The on-disk shape is owned by the scaffolded engine (template/capabilities/orchestrate/
 * manifest.schema.ts) — `projects/<p>/manifest.json` is a cross-language, git-tracked,
 * human-editable contract in snake_case. The UI server needs to read/mutate the same files,
 * so this module mirrors that schema 1:1. If the template schema ever changes shape, change
 * BOTH (the scaffold-e2e suite exercises the project side; the server integration tests this side).
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

/** Per-stage lifecycle. `blocked` = waiting on a human approval gate. `complete` is terminal. */
export const stageStatusSchema = z.enum(['pending', 'running', 'complete', 'failed', 'blocked']);
export type StageStatus = z.infer<typeof stageStatusSchema>;

/** Whole-project rollup status, derived from the stages on every write. */
export const manifestStatusSchema = z.enum(['planned', 'running', 'blocked', 'complete', 'failed']);
export type ManifestStatus = z.infer<typeof manifestStatusSchema>;

/** One forked version of a stage's output set (auto-fork on revision — GAP-55). */
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
  approved: z.boolean().optional(),
  params_hash: z.string().optional(),
  versions: z.array(versionRecordSchema).optional(),
});
export type Stage = z.infer<typeof stageSchema>;

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
  inputs: z.record(z.string(), z.unknown()).default({}),
  stages: z
    .record(z.string(), stageSchema)
    .refine((obj) => Object.keys(obj).every(isStageName), {
      message: `stage keys must each be one of: ${STAGE_NAMES.join(', ')}`,
    })
    .default({}),
  approvals_required: z.array(z.enum(STAGE_NAMES)).default([]),
  retry_policy: retryPolicySchema.default({ max_retries: 2, backoff: 'exponential' }),
  notes: z.string().optional(),
});
export type Manifest = z.infer<typeof manifestSchema>;

/** Validate arbitrary data as a Manifest, throwing a readable error. */
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

/** A fresh manifest for `projectId` with sane defaults. */
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
