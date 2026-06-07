/**
 * src/server/manifest-routes.ts — manifest service routes: the read side (project list / detail /
 * provenance / budget / gate / storyboard / verify-result) plus the mutate side (start / approve /
 * approveVersion).
 *
 * Thin wrappers over the package-side manifest service (manifest.ts), which operates on the served
 * project via context.projectsRoot(). Manifest objects pass through VERBATIM — snake_case preserved,
 * since the manifest is a cross-language, human-editable contract and must never be camelCased here.
 * This server only START/APPROVE/READs; it NEVER calls completeStage/failStage (those belong to the
 * capability runs / the agent). manifest.ts errors (illegal transition, not-gated, already-complete)
 * map to 409; a missing manifest maps to 404 — the message is surfaced verbatim so the UI can show a
 * real toast.
 *
 * GET  /api/projects                                      → { projects: ManifestSummary[] }
 * GET  /api/projects/:id                                  → Manifest (verbatim)
 * GET  /api/projects/:id/provenance                       → ProvenanceRecord[]
 * GET  /api/projects/:id/budget                           → budget.json content | null
 * GET  /api/projects/:id/verify-result                    → newest VerifyResult | null
 * GET  /api/projects/:id/stages/:stage/gate               → { stage, status, summary, ... }
 * GET  /api/projects/:id/storyboard                       → { stage, images: StoryboardImage[] }
 * POST /api/projects                                      {body}     → Manifest
 * POST /api/projects/:id/stages/:stage/start              {params?}  → Manifest
 * POST /api/projects/:id/stages/:stage/approve                       → Manifest
 * POST /api/projects/:id/stages/:stage/versions/:v/approve          → Manifest
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { projectsRoot, workDir, deliverDir, outDir, readVibeConfig } from './context.js';
import {
  manifestExists,
  readManifest,
  createManifest,
  startStage,
  approveStage,
  approveVersion,
} from './manifest.js';
import { STAGE_NAMES } from './manifest.schema.js';
import type { Manifest, StageName, Stage } from './manifest.schema.js';
import { readProvenance } from './provenance.js';
import { writeInitialBrief } from './p6-routes.js';

/** The default gated stage that holds the plan/storyboard (plan-gate convention). */
export const DEFAULT_PLAN_GATE_STAGE: StageName = 'motion';

/**
 * Plan-gate convention: the agent parks the human-readable plan/scene table in `manifest.notes`
 * and names the gated StageName it will block on in `inputs.plan_gate_stage` (default `motion`).
 * The UI's "Plan" view renders `notes`; its Approve approves THIS stage.
 */
export function planGateStage(m: Manifest): StageName {
  const v = (m.inputs as Record<string, unknown>).plan_gate_stage;
  return typeof v === 'string' && (STAGE_NAMES as readonly string[]).includes(v)
    ? (v as StageName)
    : DEFAULT_PLAN_GATE_STAGE;
}

const isStageName = (s: string): s is StageName => (STAGE_NAMES as readonly string[]).includes(s);

export interface ManifestSummary {
  project_id: string;
  status: Manifest['status'];
  updated_at: string;
  blockedStages: StageName[];
  thumbnail?: string;
}

/** Blocked stage names — the gates the UI must surface. */
function blockedStages(m: Manifest): StageName[] {
  return (Object.entries(m.stages) as [StageName, Manifest['stages'][string]][])
    .filter(([, s]) => s.status === 'blocked')
    .map(([name]) => name);
}

function summarize(m: Manifest): ManifestSummary {
  return {
    project_id: m.project_id,
    status: m.status,
    updated_at: m.updated_at,
    blockedStages: blockedStages(m),
  };
}

/** Scan projectsRoot() for directories holding a manifest.json. Missing dir → empty list. */
export function listManifestSummaries(): ManifestSummary[] {
  const root = projectsRoot();
  if (!fs.existsSync(root)) return [];
  const out: ManifestSummary[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!manifestExists(entry.name)) continue;
    try {
      out.push(summarize(readManifest(entry.name)));
    } catch {
      /* skip a malformed manifest rather than failing the whole gallery */
    }
  }
  return out.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

/** budget.json lives under the disposable work tree: out/work/<project>/orchestrate/budget.json. */
function budgetPath(project: string): string {
  return path.join(workDir(), project, 'orchestrate', 'budget.json');
}

/** Map a manifest.ts throw to an HTTP status: missing → 404, every business-rule violation → 409. */
function mapManifestError(e: unknown): { code: number; error: string } {
  const msg = e instanceof Error ? e.message : String(e);
  return { code: /no manifest for project/i.test(msg) ? 404 : 409, error: msg };
}

/**
 * Human-readable approval summary for a gated stage. Mirrors the engine's gateSummary so the UI's
 * gate-review text matches what the agent/CLI would print at the same gate.
 */
function gateSummary(m: Manifest, stage: StageName): string {
  const s = (m.stages as Record<string, Stage>)[stage];
  const status = s?.status ?? 'pending';
  const attempts = s?.attempts ?? 0;
  const outputs = s?.outputs ?? [];
  const params = s?.params ?? {};
  const lines = [
    `── APPROVAL REQUIRED — project "${m.project_id}" · stage "${stage}" ──`,
    `status: ${status} · attempts: ${attempts}`,
    `outputs (${outputs.length}):`,
    ...outputs.map((o) => `  • ${o}`),
    'params:',
    `  ${JSON.stringify(params)}`,
    `Review the outputs, then approve stage "${stage}" (or set stages.${stage}.approved=true) to proceed.`,
  ];
  return lines.join('\n');
}

// ── storyboard ────────────────────────────────────────────────────────────────
// The agent's storyboard frames land in the disposable out/work/<project>/<stage>/ tree. The server
// static-serves that tree read-only at /work (see index.ts); here we just enumerate the images so the
// client can lay them out as a grid with the SafeZone overlay. URLs are /work-relative.
export interface StoryboardImage {
  name: string;
  url: string;
}
const IMG_RE = /\.(png|jpe?g|webp)$/i;

export function listStoryboard(project: string, stage: StageName = 'motion'): StoryboardImage[] {
  const dir = path.join(workDir(), project, stage);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && IMG_RE.test(e.name))
    .map((e) => e.name)
    .sort()
    .map((name) => ({
      name,
      url: `/work/${encodeURIComponent(project)}/${stage}/${encodeURIComponent(name)}`,
    }));
}

// ── QA: locate the newest VerifyResult on disk ──────────────────────────────────
// verify.ts writes `<video>.verify.json` next to its INPUT — for a UI-delivered video that is the
// deliverables dir. We scan the project's disposable out/work tree, the deliverables dir, the
// pre-loudnorm renders under out/<p>/, and the manifest's stage outputs (sibling .verify.json),
// returning the newest. The UI never writes these — capability runs do (tests seed fixtures the same way).
function collectVerifyCandidates(project: string): string[] {
  const found = new Set<string>();
  // Relative manifest outputs resolve against the served project root (the parent of out/ and
  // deliver/), recovered from workDir() = <project>/out/work.
  const projectRoot = path.dirname(path.dirname(workDir()));
  const walk = (dir: string, depth: number): void => {
    if (depth > 4 || !fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name.endsWith('.verify.json')) found.add(p);
    }
  };
  walk(path.join(workDir(), project), 0);
  walk(path.join(deliverDir(), project), 2); // deliverables — shallow (depth 4 cap shared)
  walk(path.join(outDir(), project), 2); // pre-loudnorm renders
  if (manifestExists(project)) {
    try {
      const m = readManifest(project);
      for (const s of Object.values(m.stages) as Stage[]) {
        const outs = [...s.outputs, ...(s.versions ?? []).flatMap((v) => v.outputs)];
        for (const o of outs) {
          const abs = path.isAbsolute(o) ? o : path.join(projectRoot, o);
          const sibling = abs.replace(/\.[^.]+$/, '') + '.verify.json';
          if (sibling !== abs && fs.existsSync(sibling)) found.add(sibling);
        }
      }
    } catch {
      /* malformed manifest — work-tree scan already covered */
    }
  }
  return [...found];
}

export function latestVerifyResult(
  project: string,
): { path: string; mtime: string; result: unknown } | null {
  let best: { path: string; mtimeMs: number } | null = null;
  for (const p of collectVerifyCandidates(project)) {
    try {
      const mtimeMs = fs.statSync(p).mtimeMs;
      if (!best || mtimeMs > best.mtimeMs) best = { path: p, mtimeMs };
    } catch {
      /* raced delete */
    }
  }
  if (!best) return null;
  try {
    return {
      path: best.path,
      mtime: new Date(best.mtimeMs).toISOString(),
      result: JSON.parse(fs.readFileSync(best.path, 'utf8')),
    };
  } catch {
    return null;
  }
}

// create body — project_id is the folder name → strict slug.
const createBody = z.object({
  project_id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,63}$/, 'project id must be lowercase-kebab-case (a-z, 0-9, dashes)'),
  inputs: z.record(z.string(), z.unknown()).optional(),
  approvals_required: z.array(z.enum(STAGE_NAMES)).optional(),
  notes: z.string().optional(),
});

export function registerManifestRoutes(app: FastifyInstance): void {
  app.get('/api/projects', async () => ({
    projects: listManifestSummaries(),
  }));

  // create a project. Both wizard-create and agent-create flow through here: the create body carries
  // `inputs` verbatim, so the inputs.mode==='agent' discriminator and inputs.plan_gate_stage are
  // preserved on the manifest. Never force: an existing manifest → 409.
  app.post<{ Body: unknown }>('/api/projects', async (req, reply) => {
    const parsed = createBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'bad body' });
    }
    const b = parsed.data;
    // Default the project language from vibe.config.json (falls back to 'en') unless the body
    // already supplied one in inputs.
    const inputs = { lang: readVibeConfig().language ?? 'en', ...(b.inputs ?? {}) };
    try {
      const m = createManifest(b.project_id, {
        inputs,
        approvals_required: b.approvals_required,
        notes: b.notes,
      });
      // compose the initial projects/<p>/brief.md for BOTH modes (brief contract).
      writeInitialBrief(b.project_id, inputs);
      return m;
    } catch (e) {
      const { code, error } = mapManifestError(e);
      return reply.code(code).send({ error });
    }
  });

  // the newest VerifyResult for the QA screen (null when none exists yet).
  app.get<{ Params: { id: string } }>('/api/projects/:id/verify-result', async (req) => {
    return latestVerifyResult(req.params.id);
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    const { id } = req.params;
    if (!manifestExists(id)) return reply.code(404).send({ error: `no manifest for project "${id}"` });
    try {
      return readManifest(id);
    } catch (e) {
      return reply.code(409).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id/provenance', async (req) => {
    return readProvenance(req.params.id);
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id/budget', async (req) => {
    const p = budgetPath(req.params.id);
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return null;
    }
  });

  // ── gate review text ──────────────────────────────────────────────────────
  app.get<{ Params: { id: string; stage: string } }>(
    '/api/projects/:id/stages/:stage/gate',
    async (req, reply) => {
      const { id, stage } = req.params;
      if (!isStageName(stage)) return reply.code(400).send({ error: `unknown stage "${stage}"` });
      if (!manifestExists(id)) return reply.code(404).send({ error: `no manifest for project "${id}"` });
      try {
        const m = readManifest(id);
        const s = (m.stages as Record<string, Stage>)[stage];
        return {
          stage,
          status: s?.status ?? 'pending',
          is_gate: m.approvals_required.includes(stage),
          is_plan_gate: planGateStage(m) === stage,
          summary: gateSummary(m, stage),
          outputs: s?.outputs ?? [],
        };
      } catch (e) {
        const { code, error } = mapManifestError(e);
        return reply.code(code).send({ error });
      }
    },
  );

  // ── storyboard frame list ─────────────────────────────────────────────────
  app.get<{ Params: { id: string }; Querystring: { stage?: string } }>(
    '/api/projects/:id/storyboard',
    async (req, reply) => {
      const { id } = req.params;
      const stage = req.query.stage;
      if (stage && !isStageName(stage)) return reply.code(400).send({ error: `unknown stage "${stage}"` });
      return { stage: stage ?? 'motion', images: listStoryboard(id, (stage as StageName) ?? 'motion') };
    },
  );

  // ── mutations: start / approve / approveVersion ───────────────────────────
  const startBody = z.object({ params: z.record(z.string(), z.unknown()).optional() });

  app.post<{ Params: { id: string; stage: string }; Body: unknown }>(
    '/api/projects/:id/stages/:stage/start',
    async (req, reply) => {
      const { id, stage } = req.params;
      if (!isStageName(stage)) return reply.code(400).send({ error: `unknown stage "${stage}"` });
      const parsed = startBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'bad body' });
      }
      if (!manifestExists(id)) return reply.code(404).send({ error: `no manifest for project "${id}"` });
      try {
        return startStage(id, stage, parsed.data.params);
      } catch (e) {
        const { code, error } = mapManifestError(e);
        return reply.code(code).send({ error });
      }
    },
  );

  app.post<{ Params: { id: string; stage: string } }>(
    '/api/projects/:id/stages/:stage/approve',
    async (req, reply) => {
      const { id, stage } = req.params;
      if (!isStageName(stage)) return reply.code(400).send({ error: `unknown stage "${stage}"` });
      if (!manifestExists(id)) return reply.code(404).send({ error: `no manifest for project "${id}"` });
      try {
        return approveStage(id, stage);
      } catch (e) {
        const { code, error } = mapManifestError(e);
        return reply.code(code).send({ error });
      }
    },
  );

  app.post<{ Params: { id: string; stage: string; v: string } }>(
    '/api/projects/:id/stages/:stage/versions/:v/approve',
    async (req, reply) => {
      const { id, stage, v } = req.params;
      if (!isStageName(stage)) return reply.code(400).send({ error: `unknown stage "${stage}"` });
      const vn = Number(v);
      if (!Number.isInteger(vn) || vn < 1) return reply.code(400).send({ error: `bad version "${v}"` });
      if (!manifestExists(id)) return reply.code(404).send({ error: `no manifest for project "${id}"` });
      try {
        return approveVersion(id, stage, vn);
      } catch (e) {
        const { code, error } = mapManifestError(e);
        return reply.code(code).send({ error });
      }
    },
  );
}
