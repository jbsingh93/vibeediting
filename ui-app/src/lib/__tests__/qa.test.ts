/**
 * Ported + adapted from the parent verdict.test.ts. The parent built its fixtures through the real
 * engine `decide()` (capabilities/orchestrate/verify.ts) so the UI logic could never drift from it.
 * That engine module is Node-flavored and lives in template/ (out of ui-app's compile scope), so we
 * build VerifyResult fixtures directly — faithful to each decide() branch — and assert the CLIENT
 * qaView / isTasteLens logic (the only part that lives in ui-app/src/lib).
 */
import { describe, it, expect } from 'vitest';
import { qaView, isTasteLens } from '../qa';
import type { CouncilSummary, ObjectiveCheck, VerifyResult } from '../types';

const okCheck = (id: string): ObjectiveCheck => ({ id, ok: true, severity: 'blocker', stage: 'audio', message: `${id} ok` });
const badCheck = (id: string): ObjectiveCheck => ({ id, ok: false, severity: 'blocker', stage: 'audio', message: `${id} out of spec` });

const council = (specialists: { id: string; blockers: number }[]): CouncilSummary => ({
  aggregateVerdict: specialists.some((s) => s.blockers > 0) ? 'fix' : 'ship',
  totalBlockers: specialists.reduce((a, s) => a + s.blockers, 0),
  totalMajors: 0,
  specialists: specialists.map((s) => ({ id: s.id, verdict: s.blockers > 0 ? 'fix' : 'ship', blockers: s.blockers, majors: 0 })),
});

const CLEAN_EYES = council([
  { id: 'detail', blockers: 0 },
  { id: 'cut', blockers: 0 },
  { id: 'story', blockers: 0 },
]);

/** Local mirror of engine decide() (verify.ts) — objective gate authoritative, taste-only escalates. */
function decide(checks: ObjectiveCheck[], eyes: CouncilSummary | null): VerifyResult {
  const objBlockers = checks.filter((c) => !c.ok && c.severity === 'blocker');
  const eyesBlocking = eyes?.specialists.filter((s) => s.blockers > 0) ?? [];
  const base = { stage_to_retry: null, reasons: [] as string[], technical: checks, eyes };
  if (objBlockers.length > 0 && eyesBlocking.length > 0) return { ...base, verdict: 'rework' };
  if (objBlockers.length > 0) return { ...base, verdict: 'fix' };
  if (eyesBlocking.length > 0) {
    const technical = eyesBlocking.filter((s) => !isTasteLens(s.id));
    if (technical.length > 0) return { ...base, verdict: 'fix' };
    return { ...base, verdict: 'escalate' };
  }
  return { ...base, verdict: 'ship' };
}

describe('qaView over decide() branches', () => {
  it('ship — everything clean → Ship ENABLED', () => {
    const r = decide([okCheck('loudness'), okCheck('frame-count')], CLEAN_EYES);
    expect(r.verdict).toBe('ship');
    const v = qaView(r);
    expect(v.shipEnabled).toBe(true);
    expect(v.objectiveFailed).toBe(false);
    expect(v.canOverride).toBe(false);
    expect(v.tasteUnverified).toBe(false);
  });

  it('fix (objective blocker) — red meter → Ship DISABLED, NO override path even if council says ship', () => {
    const r = decide([badCheck('loudness'), okCheck('frame-count')], CLEAN_EYES);
    expect(r.verdict).toBe('fix');
    const v = qaView(r);
    expect(v.shipEnabled).toBe(false);
    expect(v.objectiveFailed).toBe(true);
    expect(v.canOverride).toBe(false);
    expect(qaView(r, true).shipEnabled).toBe(false);
  });

  it('fix (council technical lens) — meters clean, detail-lens blocker → Ship DISABLED', () => {
    const r = decide([okCheck('loudness')], council([{ id: 'detail', blockers: 1 }, { id: 'story', blockers: 0 }]));
    expect(r.verdict).toBe('fix');
    const v = qaView(r);
    expect(v.shipEnabled).toBe(false);
    expect(v.canOverride).toBe(false);
  });

  it('escalate (taste-only blocker) — your call: Ship disabled UNTIL overridden', () => {
    const r = decide([okCheck('loudness')], council([{ id: 'cut', blockers: 1 }, { id: 'detail', blockers: 0 }]));
    expect(r.verdict).toBe('escalate');
    const v = qaView(r);
    expect(v.shipEnabled).toBe(false);
    expect(v.canOverride).toBe(true);
    expect(v.objectiveFailed).toBe(false);
    expect(qaView(r, true).shipEnabled).toBe(true); // the logged-reason override
  });

  it('rework (objective + council both broken) → Ship DISABLED', () => {
    const r = decide([badCheck('frame-count')], council([{ id: 'story', blockers: 2 }]));
    expect(r.verdict).toBe('rework');
    const v = qaView(r);
    expect(v.shipEnabled).toBe(false);
    expect(qaView(r, true).shipEnabled).toBe(false);
  });

  it('eyes skipped → ship but flagged "taste UNVERIFIED"', () => {
    const r = decide([okCheck('loudness')], null);
    expect(r.verdict).toBe('ship');
    const v = qaView(r);
    expect(v.shipEnabled).toBe(true);
    expect(v.tasteUnverified).toBe(true);
  });
});

describe('taste lenses', () => {
  it('matches verify.ts SPECIALIST_STAGE (cut/broll-concept/story/performance + reel-segment are taste; the rest technical)', () => {
    for (const t of ['cut', 'broll-concept', 'story', 'performance', 'reel-segment']) expect(isTasteLens(t)).toBe(true);
    for (const t of ['sound', 'composition', 'color', 'detail', 'typography', 'brand', 'screencast']) expect(isTasteLens(t)).toBe(false);
  });
});
