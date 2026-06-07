/**
 * server-health.test.ts — GET /api/health (health-routes.ts): the doctor report as a UI page.
 * Locks the payload shape (version/checks/summary/ok + modifiedEngineFiles:number) and the 4s TTL
 * cache (a second call returns the same version fast). resetHealthCache() clears it between fixtures.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/index.js';
import { resetHealthCache } from '../../src/server/health-routes.js';
import { makeTempVibeProject, type TempVibeProject } from '../helpers/temp-vibe-project.js';

let app: FastifyInstance;
let tmp: TempVibeProject;

beforeEach(async () => {
  tmp = makeTempVibeProject();
  resetHealthCache();
  app = await buildApp();
});
afterEach(async () => {
  await app.close();
  tmp.cleanup();
  resetHealthCache();
});

describe('GET /api/health', () => {
  it('returns the doctor report shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      version: string;
      checks: Array<{ id: string; status: string }>;
      summary: { ok: number; warn: number; fail: number };
      ok: boolean;
      modifiedEngineFiles: number;
    };
    expect(typeof body.version).toBe('string');
    expect(Array.isArray(body.checks)).toBe(true);
    expect(body.checks.length).toBeGreaterThan(0);
    expect(body.summary).toHaveProperty('ok');
    expect(body.summary).toHaveProperty('warn');
    expect(body.summary).toHaveProperty('fail');
    expect(typeof body.ok).toBe('boolean');
    expect(typeof body.modifiedEngineFiles).toBe('number');
  });

  it('serves a second call from the TTL cache (same version)', async () => {
    const first = (await app.inject({ method: 'GET', url: '/api/health' })).json() as { version: string };
    const second = (await app.inject({ method: 'GET', url: '/api/health' })).json() as { version: string };
    expect(second.version).toBe(first.version);
  });
});
