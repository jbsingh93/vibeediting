/**
 * src/server/provenance.ts — read the project's durable provenance log
 * (projects/<p>/provenance.log, append-only NDJSON, written by the engine + agent).
 * The server only READS it (the Budget & History tab); appending stays the engine's job.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { projectsRoot } from './context.js';

/** Mirror of the engine's ProvenanceRecord (capabilities/_env/contract.ts). */
export interface ProvenanceRecord {
  ts: string;
  capability: string;
  args?: string[];
  outputs?: Array<{ path: string; sha256: string; bytes: number }>;
  source?: string;
  note?: string;
}

export function provenanceLogPath(project: string): string {
  return path.join(projectsRoot(), project, 'provenance.log');
}

/** Read the whole log back (skips blank/corrupt lines defensively — NDJSON discipline). */
export function readProvenance(project: string): ProvenanceRecord[] {
  const p = provenanceLogPath(project);
  if (!fs.existsSync(p)) return [];
  const out: ProvenanceRecord[] = [];
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as ProvenanceRecord);
    } catch {
      /* skip a corrupt line defensively */
    }
  }
  return out;
}
