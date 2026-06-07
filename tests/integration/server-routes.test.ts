/**
 * server-routes.test.ts — the manifest service routes (manifest-routes.ts): project list/create,
 * detail, stage start/approve transitions, the approval gate, version approve, provenance + budget.
 * Boots buildApp() (no static, no watch) against a fresh temp fixture per test; app.inject() drives
 * HTTP. The manifest is a snake_case cross-language contract — these tests lock that it stays verbatim.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/index.js';
import { appendVersion } from '../../src/server/manifest.js';
import { makeTempVibeProject, type TempVibeProject } from '../helpers/temp-vibe-project.js';

let app: FastifyInstance;
let tmp: TempVibeProject;

beforeEach(async () => {
  tmp = makeTempVibeProject();
  app = await buildApp();
});
afterEach(async () => {
  await app.close();
  tmp.cleanup();
});

describe('GET /api/projects', () => {
  it('returns an empty list when no projects exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ projects: [] });
  });

  it('lists created projects with snake_case summaries', async () => {
    tmp.seedManifest('p1');
    const res = await app.inject({ method: 'GET', url: '/api/projects' });
    const body = res.json() as { projects: Array<{ project_id: string; status: string }> };
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0]).toMatchObject({ project_id: 'p1', status: 'planned' });
  });
});

describe('POST /api/projects', () => {
  it('creates a manifest + brief.md from a wizard body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        project_id: 'promo-ad',
        inputs: { mode: 'wizard', format: '9:16', style: 'ali-abdaal' },
      },
    });
    expect(res.statusCode).toBe(200);
    const m = res.json() as { project_id: string; inputs: Record<string, unknown> };
    expect(m.project_id).toBe('promo-ad');
    // lang defaulted from vibe.config.json
    expect(m.inputs.lang).toBe('en');

    // manifest + brief.md on disk
    const got = await app.inject({ method: 'GET', url: '/api/projects/promo-ad' });
    expect(got.statusCode).toBe(200);
    const brief = await app.inject({ method: 'GET', url: '/api/projects/promo-ad/brief' });
    const bb = brief.json() as { exists: boolean; md: string };
    expect(bb.exists).toBe(true);
    expect(bb.md).toContain('# Brief — promo-ad');
  });

  it('rejects a duplicate project (no clobber)', async () => {
    tmp.seedManifest('dup');
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { project_id: 'dup' },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string }).error).toMatch(/already exists/i);
  });

  it('rejects a non-kebab project id with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { project_id: 'Bad Id!' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/projects/:id', () => {
  it('returns the manifest verbatim (snake_case)', async () => {
    tmp.seedManifest('detail', { notes: 'the plan' });
    const res = await app.inject({ method: 'GET', url: '/api/projects/detail' });
    expect(res.statusCode).toBe(200);
    const m = res.json() as Record<string, unknown>;
    expect(m).toHaveProperty('project_id', 'detail');
    expect(m).toHaveProperty('created_at');
    expect(m).toHaveProperty('updated_at');
    expect(m).toHaveProperty('approvals_required');
  });

  it('404s an unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects/nope' });
    expect(res.statusCode).toBe(404);
  });
});

describe('stage transitions', () => {
  it('starts a pending stage → running', async () => {
    tmp.seedManifest('s1');
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/s1/stages/ingest/start',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const m = res.json() as { stages: Record<string, { status: string; attempts: number }> };
    expect(m.stages.ingest!.status).toBe('running');
    expect(m.stages.ingest!.attempts).toBe(1);
  });

  it('rejects an illegal transition with 409 (complete is terminal)', async () => {
    // a complete stage may never restart: seed a gated+blocked stage, approve it (→ complete),
    // then try to start it again.
    tmp.seedBlockedProject('s2done'); // motion gated+blocked
    await app.inject({ method: 'POST', url: '/api/projects/s2done/stages/motion/approve' }); // → complete
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/s2done/stages/motion/start',
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string }).error).toMatch(/illegal stage transition|terminal/i);
  });

  it('400s an unknown stage name', async () => {
    tmp.seedManifest('s3');
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/s3/stages/not-a-stage/start',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('approval gate', () => {
  it('approving a blocked gated stage transitions it to complete', async () => {
    tmp.seedBlockedProject('gate');
    // sanity: it is blocked + surfaced as a blocked stage on the summary
    const list = await app.inject({ method: 'GET', url: '/api/projects' });
    const summary = (list.json() as { projects: Array<{ project_id: string; blockedStages: string[] }> })
      .projects.find((p) => p.project_id === 'gate');
    expect(summary?.blockedStages).toContain('motion');

    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/gate/stages/motion/approve',
    });
    expect(res.statusCode).toBe(200);
    const m = res.json() as { stages: Record<string, { status: string; approved?: boolean }> };
    expect(m.stages.motion!.status).toBe('complete');
    expect(m.stages.motion!.approved).toBe(true);
  });

  it('409s an approve on a stage not in approvals_required', async () => {
    tmp.seedManifest('nogate', { running: ['ingest'] });
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/nogate/stages/ingest/approve',
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string }).error).toMatch(/does not require approval/i);
  });

  it('exposes the gate review text', async () => {
    tmp.seedBlockedProject('gate2');
    const res = await app.inject({ method: 'GET', url: '/api/projects/gate2/stages/motion/gate' });
    expect(res.statusCode).toBe(200);
    const g = res.json() as { stage: string; status: string; is_gate: boolean; summary: string };
    expect(g.stage).toBe('motion');
    expect(g.status).toBe('blocked');
    expect(g.is_gate).toBe(true);
    expect(g.summary).toContain('APPROVAL REQUIRED');
  });
});

describe('version approve flow', () => {
  it('approves a forked version and swaps the stage outputs', async () => {
    tmp.seedManifest('vproj', { running: ['motion'] });
    // seed two versions via the real manifest service
    appendVersion('vproj', 'motion', {
      approved: true,
      outputs: ['out/v1.mp4'],
      created_at: new Date().toISOString(),
    });
    appendVersion('vproj', 'motion', {
      approved: false,
      outputs: ['out/v2.mp4'],
      created_at: new Date().toISOString(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/vproj/stages/motion/versions/2/approve',
    });
    expect(res.statusCode).toBe(200);
    const m = res.json() as {
      stages: Record<string, { outputs: string[]; versions: Array<{ v: number; approved: boolean }> }>;
    };
    expect(m.stages.motion!.outputs).toEqual(['out/v2.mp4']);
    const v2 = m.stages.motion!.versions.find((v) => v.v === 2);
    expect(v2?.approved).toBe(true);
    expect(m.stages.motion!.versions.find((v) => v.v === 1)?.approved).toBe(false);
  });

  it('400s a non-existent version number', async () => {
    tmp.seedManifest('vproj2', { running: ['motion'] });
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/vproj2/stages/motion/versions/9/approve',
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string }).error).toMatch(/no v9/i);
  });
});

describe('provenance + budget', () => {
  it('reads the provenance log, skipping a corrupt NDJSON line', async () => {
    tmp.seedManifest('prov');
    tmp.seedProvenanceLine(
      'prov',
      JSON.stringify({ ts: '2026-01-01T00:00:00Z', capability: 'ingest/probe', note: 'ok' }),
    );
    tmp.seedProvenanceLine('prov', '{ this is not valid json');
    tmp.seedProvenanceLine(
      'prov',
      JSON.stringify({ ts: '2026-01-02T00:00:00Z', capability: 'deliver/render-preset' }),
    );

    const res = await app.inject({ method: 'GET', url: '/api/projects/prov/provenance' });
    expect(res.statusCode).toBe(200);
    const recs = res.json() as Array<{ capability: string }>;
    expect(recs).toHaveLength(2); // corrupt line skipped
    expect(recs.map((r) => r.capability)).toEqual(['ingest/probe', 'deliver/render-preset']);
  });

  it('returns null budget when none seeded, and the object when seeded', async () => {
    tmp.seedManifest('bud');
    const empty = await app.inject({ method: 'GET', url: '/api/projects/bud/budget' });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toBeNull();

    tmp.seedBudget('bud', { spentUsd: 0.42, capUsd: 5 });
    const full = await app.inject({ method: 'GET', url: '/api/projects/bud/budget' });
    expect(full.json()).toEqual({ spentUsd: 0.42, capUsd: 5 });
  });
});
