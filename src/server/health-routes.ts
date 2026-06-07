/**
 * src/server/health-routes.ts — GET /api/health: the doctor report as a UI page.
 *
 * Runs the package doctor IN-PROCESS (src/commands/doctor.ts — node/disk/ffmpeg/agents/.env/
 * venv + the project engine's own doctor) and extends it with the modified-engine-files count
 * (doc 07 §4: users who hand-edit engine files fork off the upgrade path — the Health page
 * makes that visible). 4-second TTL + in-flight coalesce: the TopBar dot and the Health
 * screen share ONE doctor run.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { runDoctor, type DoctorReport } from '../commands/doctor.js';
import { projectDir } from './context.js';

const TTL_MS = 4_000;

interface HealthPayload extends DoctorReport {
  /** Engine files (capabilities/, src/components/) whose hash differs from the init baseline. */
  modifiedEngineFiles: number;
}

let cached: { at: number; payload: HealthPayload } | null = null;
let inflight: Promise<HealthPayload> | null = null;

function isEngineFile(rel: string): boolean {
  return rel.startsWith('capabilities/') || rel.startsWith('src/components/');
}

/** Count seeded engine files whose on-disk sha256 differs from the .vibe/state.json baseline. */
export function countModifiedEngineFiles(dir: string = projectDir()): number {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(dir, '.vibe', 'state.json'), 'utf8')) as {
      files?: Record<string, string>;
    };
    if (!state.files) return 0;
    let modified = 0;
    for (const [rel, baseline] of Object.entries(state.files)) {
      if (!isEngineFile(rel)) continue;
      const p = path.join(dir, rel);
      try {
        const hash = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
        if (hash !== baseline) modified++;
      } catch {
        /* deleted file counts as modified — the user diverged from the baseline */
        modified++;
      }
    }
    return modified;
  } catch {
    return 0;
  }
}

async function freshHealth(): Promise<HealthPayload> {
  const report = await runDoctor(projectDir());
  return { ...report, modifiedEngineFiles: countModifiedEngineFiles() };
}

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/api/health', async () => {
    if (cached && Date.now() - cached.at < TTL_MS) return cached.payload;
    if (!inflight) {
      inflight = freshHealth()
        .then((payload) => {
          cached = { at: Date.now(), payload };
          return payload;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  });
}

/** Test seam: drop the TTL cache between integration tests. */
export function resetHealthCache(): void {
  cached = null;
  inflight = null;
}
