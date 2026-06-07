/**
 * lib/progress.ts — UIP6.5: the cockpit progress strip's pure math (unit-tested).
 *
 * fraction = complete-stages / recorded-stages over the manifest (canonical order), with the
 * RUNNING stage's live render-job frame fraction interpolated into its slot. Pre-plan (zero
 * recorded stages) is an honest "awaiting plan ○" — never a fake 0 %.
 */
import { STAGE_ORDER, type JobRecord, type Manifest, type Stage, type StageName } from './types';

export interface ProgressInfo {
  /** stages present on the manifest (the denominator). 0 = pre-plan. */
  recorded: number;
  complete: number;
  /** 0..1 incl. the running stage's interpolated slot; 0 when recorded === 0. */
  fraction: number;
  runningStage: StageName | null;
  /** 0..100 of the running stage's render job (null when no live job progress exists). */
  runningPct: number | null;
  /** the mono label, e.g. "3/6 stages · motion ◔ 41%" or "awaiting plan ○". */
  label: string;
  empty: boolean;
}

/** A running job's 0..1 fraction (frame/totalFrames beats the coarse progress field). */
export function jobFraction(j: JobRecord): number | null {
  if (typeof j.frame === 'number' && typeof j.totalFrames === 'number' && j.totalFrames > 0) {
    return Math.min(1, Math.max(0, j.frame / j.totalFrames));
  }
  if (typeof j.progress === 'number') return Math.min(1, Math.max(0, j.progress));
  return null;
}

export function progressInfo(m: Manifest, jobs: JobRecord[]): ProgressInfo {
  const stages = m.stages as Record<string, Stage | undefined>;
  const present = STAGE_ORDER.filter((s) => stages[s]);
  const recorded = present.length;
  if (recorded === 0) {
    return { recorded: 0, complete: 0, fraction: 0, runningStage: null, runningPct: null, label: 'awaiting plan ○', empty: true };
  }
  const complete = present.filter((s) => stages[s]!.status === 'complete').length;
  const runningStage = present.find((s) => stages[s]!.status === 'running') ?? null;

  let runningFrac = 0;
  let runningPct: number | null = null;
  if (runningStage) {
    const live = jobs.find((j) => j.project === m.project_id && j.status === 'running');
    const f = live ? jobFraction(live) : null;
    if (f !== null) {
      runningFrac = f;
      runningPct = Math.round(f * 100);
    }
  }

  const fraction = Math.min(1, (complete + runningFrac) / recorded);
  let label = `${complete}/${recorded} stages`;
  if (runningStage) label += ` · ${runningStage} ◔${runningPct !== null ? ` ${runningPct}%` : ''}`;
  return { recorded, complete, fraction, runningStage, runningPct, label, empty: false };
}
