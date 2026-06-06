/**
 * capabilities/orchestrate/provenance.ts — the durable, append-only provenance log (plan P2.3).
 *
 * Append-only record of WHAT ran, with WHICH args, producing WHICH outputs (sha256 + bytes). The
 * audit trail behind the manifest: idempotent artifacts + an append-only log is the research's
 * reproducibility contract (AG §5.4 rule 4; CP §5.1).
 *
 * Two logs, by design (not duplication):
 *   - the DISPOSABLE work-tree log (`out/work/<project>/provenance.log`) that P1 engines append via
 *     `contract.appendProvenance` during a run — wiped with out/;
 *   - this DURABLE, git-tracked project log (`projects/<project>/provenance.log`, GAP-9) that the
 *     ORCHESTRATOR maintains across runs. Same record shape (ProvenanceRecord) so they interoperate.
 *
 * NDJSON (one JSON record per line) — appendable without parsing, greppable, diff-friendly in git.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describeOutputs, type ProvenanceRecord } from '../_env/contract';
import { projectsRoot } from './manifest';

export type { ProvenanceRecord };

export function provenanceLogPath(project: string): string {
  return path.join(projectsRoot(), project, 'provenance.log');
}

/**
 * Append one provenance record. `outputs` are hashed (sha256 + bytes) here so callers pass plain
 * paths. Returns the record actually written.
 */
export function logProvenance(
  project: string,
  capability: string,
  opts: { args?: string[]; outputs?: string[]; source?: string; note?: string } = {},
): ProvenanceRecord {
  const rec: ProvenanceRecord = {
    ts: new Date().toISOString(),
    capability,
    args: opts.args,
    outputs: opts.outputs ? describeOutputs(opts.outputs) : undefined,
    source: opts.source,
    note: opts.note,
  };
  const p = provenanceLogPath(project);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(rec) + '\n', 'utf8');
  return rec;
}

/** Read the whole log back (skips any blank/corrupt lines defensively). */
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
