/** Ported from the parent p6-pure.test.ts progress-strip math. */
import { describe, it, expect } from 'vitest';
import { progressInfo, jobFraction } from '../progress';
import type { JobRecord, Manifest } from '../types';

function mkManifest(stages: Record<string, { status: string }>): Manifest {
  return {
    project_id: 'p',
    status: 'running',
    created_at: '',
    updated_at: '',
    inputs: {},
    approvals_required: [],
    stages: Object.fromEntries(
      Object.entries(stages).map(([k, v]) => [k, { status: v.status, params: {}, outputs: [], attempts: 1 }]),
    ),
  } as unknown as Manifest;
}

function mkJob(p: Partial<JobRecord>): JobRecord {
  return { id: 'j1', kind: 'render', label: 'x', status: 'running', logTail: [], createdAt: '', ...p } as JobRecord;
}

describe('progress strip math', () => {
  it('0 recorded stages → the honest awaiting-plan empty state (never a fake 0 %)', () => {
    const p = progressInfo(mkManifest({}), []);
    expect(p.empty).toBe(true);
    expect(p.label).toBe('awaiting plan ○');
    expect(p.fraction).toBe(0);
  });
  it('k/n math over recorded stages', () => {
    const p = progressInfo(mkManifest({ ingest: { status: 'complete' }, audio: { status: 'complete' }, motion: { status: 'pending' } }), []);
    expect(p.recorded).toBe(3);
    expect(p.complete).toBe(2);
    expect(p.fraction).toBeCloseTo(2 / 3);
    expect(p.label).toBe('2/3 stages');
  });
  it('interpolates the running stage from its live render-job frames', () => {
    const m = mkManifest({ ingest: { status: 'complete' }, motion: { status: 'running' } });
    const p = progressInfo(m, [mkJob({ project: 'p', frame: 41, totalFrames: 100 })]);
    expect(p.runningStage).toBe('motion');
    expect(p.runningPct).toBe(41);
    expect(p.fraction).toBeCloseTo((1 + 0.41) / 2);
    expect(p.label).toBe('1/2 stages · motion ◔ 41%');
  });
  it('a running stage with NO live job shows the glyph without a fake percent', () => {
    const p = progressInfo(mkManifest({ motion: { status: 'running' } }), []);
    expect(p.label).toBe('0/1 stages · motion ◔');
    expect(p.runningPct).toBeNull();
  });
  it("another project's job never leaks in", () => {
    const m = mkManifest({ motion: { status: 'running' } });
    const p = progressInfo(m, [mkJob({ project: 'other', frame: 50, totalFrames: 100 })]);
    expect(p.runningPct).toBeNull();
  });
  it('jobFraction clamps and prefers frames over coarse progress', () => {
    expect(jobFraction(mkJob({ frame: 120, totalFrames: 100 }))).toBe(1);
    expect(jobFraction(mkJob({ progress: 0.4 }))).toBe(0.4);
    expect(jobFraction(mkJob({}))).toBeNull();
  });
});
