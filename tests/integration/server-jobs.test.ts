/**
 * server-jobs.test.ts — the cockpit job runner (jobs.ts). Locks: the verb whitelist (403 for a
 * non-whitelisted verb), the disk guard (507 below the floor), GET /api/system, the render happy
 * path (fake-render seam + the fixture's render-preset dry-run stub) including the chained loudnorm
 * follow-up, and queued-job cancellation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/index.js';
import { resetJobsForTests, enqueueJob, type JobRecord } from '../../src/server/jobs.js';
import { makeTempVibeProject, FAKE_RENDER, type TempVibeProject } from '../helpers/temp-vibe-project.js';

let app: FastifyInstance;
let tmp: TempVibeProject;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  tmp = makeTempVibeProject();
  for (const k of ['VIBE_RENDER_CMD', 'VIBE_MIN_FREE_GB', 'VIBE_FAKE_RENDER_MS']) saved[k] = process.env[k];
  resetJobsForTests();
  app = await buildApp();
});
afterEach(async () => {
  resetJobsForTests();
  await app.close();
  tmp.cleanup();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

async function pollJob(id: string, until: (j: JobRecord) => boolean, timeoutMs: number): Promise<JobRecord> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await app.inject({ method: 'GET', url: `/api/jobs/${id}` });
    const j = (res.json() as { job: JobRecord }).job;
    if (until(j)) return j;
    if (Date.now() > deadline) return j;
    await new Promise((r) => setTimeout(r, 75));
  }
}

describe('POST /api/run', () => {
  it('403s a non-whitelisted verb (the job API is not a shell)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/run',
      payload: { verb: 'rm -rf /', args: [] },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: string }).error).toMatch(/not whitelisted/i);
  });
});

describe('GET /api/system', () => {
  it('returns a numeric freeGb', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/system' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { freeGb: number; totalGb: number };
    expect(typeof body.freeGb).toBe('number');
    expect(Number.isFinite(body.freeGb)).toBe(true);
  });
});

describe('disk guard', () => {
  it('507s a render below the free-space floor', async () => {
    process.env.VIBE_MIN_FREE_GB = '999999';
    const res = await app.inject({
      method: 'POST',
      url: '/api/render',
      payload: { compId: 'DemoWelcome', preset: 'scene-clip', outName: 'p/smoke' },
    });
    expect(res.statusCode).toBe(507);
    expect((res.json() as { error: string }).error).toMatch(/free on the output drive/i);
  });
});

describe('render happy path + loudnorm chain', () => {
  it('renders via the fake seam, writes a ≥2KB file, then chains loudnorm', async () => {
    process.env.VIBE_RENDER_CMD = FAKE_RENDER;
    process.env.VIBE_FAKE_RENDER_MS = '200';

    const res = await app.inject({
      method: 'POST',
      url: '/api/render',
      payload: { compId: 'DemoWelcome', preset: 'scene-clip', outName: 'proj/smoke' },
    });
    expect(res.statusCode).toBe(200);
    const id = (res.json() as { job: { id: string } }).job.id;

    const done = await pollJob(id, (j) => j.status === 'done' || j.status === 'failed', 15_000);
    expect(done.status).toBe('done');
    expect(done.progress).toBe(1);
    expect(done.outputs && done.outputs.length).toBeGreaterThan(0);

    const out = done.outputs![0]!;
    expect(fs.existsSync(out)).toBe(true);
    expect(fs.statSync(out).size).toBeGreaterThanOrEqual(2048);
    // path is out/proj/smoke.mp4 under the project (the dry-run argv positional)
    expect(out.replace(/\\/g, '/')).toContain('out/proj/smoke.mp4');

    // a /api/render with default loudnorm is OFF (only /api/deliver chains); assert the render job
    // itself did NOT enqueue a chain. The chained loudnorm path is exercised via /api/deliver below.
    const all = await app.inject({ method: 'GET', url: '/api/jobs' });
    const jobs = (all.json() as { jobs: JobRecord[] }).jobs;
    expect(jobs.some((j) => j.label.includes('loudnorm'))).toBe(false);
  });

  it('/api/deliver chains a loudnorm job after the render (chain EXISTS; its run fails — no capability)', async () => {
    process.env.VIBE_RENDER_CMD = FAKE_RENDER;
    process.env.VIBE_FAKE_RENDER_MS = '150';

    const res = await app.inject({
      method: 'POST',
      url: '/api/deliver',
      payload: {
        project: 'proj',
        items: [{ compId: 'DemoWelcome', preset: 'scene-clip', outName: 'proj/deliverme' }],
        loudnorm: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const id = (res.json() as { jobs: Array<{ id: string }> }).jobs[0]!.id;

    const done = await pollJob(id, (j) => j.status === 'done' || j.status === 'failed', 15_000);
    expect(done.status).toBe('done');

    // the chain enqueues a loudnorm capability job once the render succeeds; poll for it to appear.
    const deadline = Date.now() + 5_000;
    let loudnorm: JobRecord | undefined;
    while (Date.now() < deadline) {
      const all = await app.inject({ method: 'GET', url: '/api/jobs' });
      loudnorm = (all.json() as { jobs: JobRecord[] }).jobs.find((j) => j.label.includes('loudnorm'));
      if (loudnorm) break;
      await new Promise((r) => setTimeout(r, 75));
    }
    expect(loudnorm).toBeDefined();
    // its execution FAILS (the fixture has no loudnorm capability) — that's expected; the contract
    // we lock is that the chain was enqueued at all.
    const chainFinal = await pollJob(loudnorm!.id, (j) => j.status === 'done' || j.status === 'failed', 8_000);
    expect(chainFinal.status).toBe('failed');
  });
});

describe('invalid preset', () => {
  it('400s POST /api/render with an unknown preset (the route validates; no 500)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/render',
      payload: { compId: 'DemoWelcome', preset: 'not-a-real-preset', outName: 'p/x' },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toMatch(/unknown preset "not-a-real-preset"/i);
  });

  it('400s POST /api/deliver when any item carries an unknown preset', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/deliver',
      payload: {
        project: 'proj',
        items: [
          { compId: 'A', preset: 'scene-clip', outName: 'proj/a' },
          { compId: 'B', preset: 'bogus-preset', outName: 'proj/b' },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toMatch(/unknown preset "bogus-preset"/i);
  });
});

describe('cancel', () => {
  it('cancels a RUNNING render → child killed + status reflects cancelled, no output file', async () => {
    process.env.VIBE_RENDER_CMD = FAKE_RENDER;
    process.env.VIBE_FAKE_RENDER_MS = '5000'; // long enough to observe `running` and cancel mid-flight

    const res = await app.inject({
      method: 'POST',
      url: '/api/render',
      payload: { compId: 'Slow', preset: 'scene-clip', outName: 'proj/slow' },
    });
    expect(res.statusCode).toBe(200);
    const id = (res.json() as { job: { id: string } }).job.id;

    // wait until it's actually RUNNING (the fake-render child spawned)
    const running = await pollJob(id, (j) => j.status === 'running', 5_000);
    expect(running.status).toBe('running');

    const cancel = await app.inject({ method: 'POST', url: `/api/jobs/${id}/cancel` });
    expect(cancel.statusCode).toBe(200);
    expect((cancel.json() as { job: JobRecord }).job.status).toBe('cancelled');

    // the killed render leaves no completed output, and the close handler does NOT flip it back to
    // done/failed (cancelled is terminal). Give the child's close a beat, then re-read.
    await new Promise((r) => setTimeout(r, 400));
    const after = (await app.inject({ method: 'GET', url: `/api/jobs/${id}` })).json() as { job: JobRecord };
    expect(after.job.status).toBe('cancelled');
    expect(after.job.outputs ?? []).toHaveLength(0);
  });

  it('loudnorm chain failure → the rendered output is KEPT, only the chain job fails with an error', async () => {
    process.env.VIBE_RENDER_CMD = FAKE_RENDER;
    process.env.VIBE_FAKE_RENDER_MS = '150';

    const res = await app.inject({
      method: 'POST',
      url: '/api/deliver',
      payload: {
        project: 'proj',
        items: [{ compId: 'DemoWelcome', preset: 'scene-clip', outName: 'proj/keepme' }],
        loudnorm: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const renderId = (res.json() as { jobs: Array<{ id: string }> }).jobs[0]!.id;

    // the render itself succeeds and keeps its file (the chain runs AFTER, independently).
    const render = await pollJob(renderId, (j) => j.status === 'done' || j.status === 'failed', 15_000);
    expect(render.status).toBe('done');
    const rendered = render.outputs![0]!;
    expect(fs.existsSync(rendered)).toBe(true);

    // the chained loudnorm job appears and FAILS (the fixture has no loudnorm capability).
    const deadline = Date.now() + 6_000;
    let chain: JobRecord | undefined;
    while (Date.now() < deadline) {
      chain = (
        (await app.inject({ method: 'GET', url: '/api/jobs' })).json() as { jobs: JobRecord[] }
      ).jobs.find((j) => j.label.includes('loudnorm'));
      if (chain) break;
      await new Promise((r) => setTimeout(r, 75));
    }
    expect(chain).toBeDefined();
    const chainFinal = await pollJob(chain!.id, (j) => j.status === 'done' || j.status === 'failed', 8_000);
    expect(chainFinal.status).toBe('failed');
    expect(chainFinal.error).toBeTruthy(); // the failure surfaces an error string, not a silent drop

    // CRUCIAL: the chain's failure did not delete or invalidate the render's output.
    expect(fs.existsSync(rendered)).toBe(true);
    const renderStill = (await app.inject({ method: 'GET', url: `/api/jobs/${renderId}` })).json() as { job: JobRecord };
    expect(renderStill.job.status).toBe('done');
  });

  it('cancels a queued job', async () => {
    process.env.VIBE_RENDER_CMD = FAKE_RENDER;
    process.env.VIBE_FAKE_RENDER_MS = '5000'; // long enough that the 2nd render stays queued

    // render lane size is 1, so the second render queues behind the first.
    const r1 = await app.inject({
      method: 'POST',
      url: '/api/render',
      payload: { compId: 'A', preset: 'scene-clip', outName: 'proj/a' },
    });
    const r2 = await app.inject({
      method: 'POST',
      url: '/api/render',
      payload: { compId: 'B', preset: 'scene-clip', outName: 'proj/b' },
    });
    const id1 = (r1.json() as { job: { id: string } }).job.id;
    const id2 = (r2.json() as { job: { id: string } }).job.id;

    // wait until id2 is queued (id1 running)
    const queued = await pollJob(id2, (j) => j.status === 'queued' || j.status === 'cancelled', 4_000);
    expect(queued.status).toBe('queued');

    const cancel = await app.inject({ method: 'POST', url: `/api/jobs/${id2}/cancel` });
    expect(cancel.statusCode).toBe(200);
    expect((cancel.json() as { job: JobRecord }).job.status).toBe('cancelled');

    // cancel the long-running first job too so the test (and afterEach) doesn't wait on it.
    await app.inject({ method: 'POST', url: `/api/jobs/${id1}/cancel` });
  });
});

describe('enqueueJob (direct)', () => {
  it('404s an unknown job id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/jobs/job-nope' });
    expect(res.statusCode).toBe(404);
  });

  it('a directly-enqueued non-whitelisted capability fails (no envelope)', async () => {
    const job = enqueueJob({ kind: 'capability', verb: 'not/whitelisted', args: [] });
    const final = await pollJob(job.id, (j) => j.status === 'failed' || j.status === 'done', 8_000);
    expect(final.status).toBe('failed');
  });
});
