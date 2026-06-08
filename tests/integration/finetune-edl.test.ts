/**
 * finetune-edl.test.ts (VE.2.5) — a RESTRUCTURED EDL flows through the existing finetune save:
 * the segments.json write path validates the new shape, the stage-running fork gate still fires,
 * and a bad transition/effect is rejected at the boundary. No new server route (D25).
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

function seedEdl(id: string, doc: unknown): void {
  const dir = path.join(tmp.dir, 'public', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'segments.json'), JSON.stringify(doc), 'utf8');
}

const BASE = {
  fps: 30,
  crossfadeFrames: 0,
  src: 'edl1/clip.mp4',
  segments: [
    { id: 's1', srcStart: 0, srcEnd: 1 },
    { id: 's2', srcStart: 1, srcEnd: 2 },
    { id: 's3', srcStart: 2, srcEnd: 3 },
  ],
};

// A split (s2 → s2-a/s2-b) + reorder, exactly what the editor's pure ops produce.
const RESTRUCTURED = {
  ...BASE,
  segments: [
    { id: 's2-a', srcStart: 1, srcEnd: 1.5 },
    { id: 's3', srcStart: 2, srcEnd: 3 },
    { id: 's2-b', srcStart: 1.5, srcEnd: 2, transition: { kind: 'cut', durationFrames: 0 } },
  ],
};

describe('finetune save — restructured EDL (VE.2.5)', () => {
  it('loads the EDL as a segments doc', async () => {
    tmp.seedManifest('edl1');
    seedEdl('edl1', BASE);
    const got = await app.inject({ method: 'GET', url: '/api/projects/edl1/finetune' });
    expect(got.statusCode).toBe(200);
    const seg = (got.json() as { docs: Array<{ name: string; kind: string }> }).docs.find((d) => d.name === 'segments.json');
    expect(seg?.kind).toBe('segments');
  });

  it('saving a restructured cut while motion is running hits the fork gate, then forks with consent', async () => {
    tmp.seedManifest('edl1', { running: ['motion'] });
    seedEdl('edl1', BASE);

    // no fork → 409 stage-running (the structural edit would change the in-flight render)
    const conflict = await app.inject({
      method: 'POST',
      url: '/api/projects/edl1/finetune/save',
      payload: { files: [{ name: 'segments.json', data: RESTRUCTURED }] },
    });
    expect(conflict.statusCode).toBe(409);
    expect((conflict.json() as { conflict: string }).conflict).toBe('stage-running');

    // with fork:true → 200, the restructured cut persists + a fork version is recorded
    const forked = await app.inject({
      method: 'POST',
      url: '/api/projects/edl1/finetune/save',
      payload: { files: [{ name: 'segments.json', data: RESTRUCTURED }], fork: true },
    });
    expect(forked.statusCode).toBe(200);
    const body = forked.json() as { saved: string[]; forked?: { stage: string; v: number } };
    expect(body.saved).toContain('segments.json');
    expect(body.forked?.stage).toBe('motion');

    const onDisk = JSON.parse(fs.readFileSync(path.join(tmp.dir, 'public', 'edl1', 'segments.json'), 'utf8')) as {
      segments: Array<{ id: string }>;
    };
    expect(onDisk.segments.map((s) => s.id)).toEqual(['s2-a', 's3', 's2-b']);
  });

  it('saving a restructured cut on an idle project just writes it (no fork, no conflict)', async () => {
    tmp.seedManifest('edl1'); // no running stage
    seedEdl('edl1', BASE);
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/edl1/finetune/save',
      payload: { files: [{ name: 'segments.json', data: RESTRUCTURED }] },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { saved: string[] }).saved).toContain('segments.json');
  });

  it('rejects a restructured cut carrying a bad transition (400, before any write)', async () => {
    tmp.seedManifest('edl2');
    seedEdl('edl2', BASE);
    const bad = {
      ...BASE,
      segments: [
        { id: 's1', srcStart: 0, srcEnd: 1, transition: { kind: 'glitch', durationFrames: 8 } },
        { id: 's2', srcStart: 1, srcEnd: 2 },
      ],
    };
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/edl2/finetune/save',
      payload: { files: [{ name: 'segments.json', data: bad }] },
    });
    expect(res.statusCode).toBe(400);
    // unchanged on disk
    const onDisk = JSON.parse(fs.readFileSync(path.join(tmp.dir, 'public', 'edl2', 'segments.json'), 'utf8')) as {
      segments: Array<{ id: string }>;
    };
    expect(onDisk.segments.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });
});
