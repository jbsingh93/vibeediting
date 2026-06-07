/**
 * server-brand.test.ts — the Brand page backend (brand-routes.ts). brand/brand.json is THE config
 * boundary; the form edits it with sha256 optimistic concurrency. Locks: GET exposes the object +
 * sha, stale PUT → 409 + current sha, valid PUT rewrites pretty + trailing newline, missing file →
 * exists:false + agentPrompt.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/index.js';
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

function brandPath(): string {
  return path.join(tmp.dir, 'brand', 'brand.json');
}

describe('GET /api/brand', () => {
  it('returns the existing brand object + a sha256', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/brand' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { exists: boolean; brand: { name: string }; sha256: string };
    expect(body.exists).toBe(true);
    expect(body.brand.name).toBe('Acme Demo');
    expect(body.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns exists:false + agentPrompt when brand.json is missing', async () => {
    fs.rmSync(brandPath());
    const res = await app.inject({ method: 'GET', url: '/api/brand' });
    const body = res.json() as { exists: boolean; brand: unknown; agentPrompt: string };
    expect(body.exists).toBe(false);
    expect(body.brand).toBeNull();
    expect(body.agentPrompt).toMatch(/set up my brand/i);
  });
});

describe('PUT /api/brand', () => {
  it('409s a stale expectSha and returns the current sha', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/brand',
      payload: { brand: { name: 'Changed' }, expectSha: 'deadbeef' },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: string; sha256: string };
    expect(body.error).toMatch(/changed since/i);
    expect(body.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rewrites the file pretty + trailing newline on a valid save', async () => {
    const get = await app.inject({ method: 'GET', url: '/api/brand' });
    const sha = (get.json() as { sha256: string }).sha256;
    const next = { name: 'Acme Demo', tone: 'warmer', colors: { primary: '#ff0000' } };

    const res = await app.inject({
      method: 'PUT',
      url: '/api/brand',
      payload: { brand: next, expectSha: sha },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { saved: boolean }).saved).toBe(true);

    const onDisk = fs.readFileSync(brandPath(), 'utf8');
    expect(onDisk.endsWith('\n')).toBe(true);
    expect(onDisk).toBe(JSON.stringify(next, null, 2) + '\n'); // pretty, 2-space
  });

  it('400s a non-object brand', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/brand', payload: { brand: 'nope' } });
    expect(res.statusCode).toBe(400);
  });

  it('two writers from the same expectSha → exactly ONE 409, the winner content intact', async () => {
    const get = await app.inject({ method: 'GET', url: '/api/brand' });
    const baseSha = (get.json() as { sha256: string }).sha256;

    // Writer A commits first against the base sha → 200.
    const a = await app.inject({
      method: 'PUT',
      url: '/api/brand',
      payload: { brand: { name: 'Writer A' }, expectSha: baseSha },
    });
    // Writer B commits against the now-stale base sha → 409.
    const b = await app.inject({
      method: 'PUT',
      url: '/api/brand',
      payload: { brand: { name: 'Writer B' }, expectSha: baseSha },
    });

    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([200, 409]); // exactly one conflict
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(409);
    expect((b.json() as { error: string }).error).toMatch(/changed since/i);
    // the winner's content is on disk; the loser never clobbered it.
    const onDisk = JSON.parse(fs.readFileSync(brandPath(), 'utf8')) as { name: string };
    expect(onDisk.name).toBe('Writer A');
  });
});
