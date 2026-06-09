/** P2 — the orchestration spine: manifest contract · provenance · split verifier · proxy · approval gate · budget guard. */
import * as fs from 'node:fs';
import * as path from 'node:path';

// Route the durable manifest/provenance into the disposable test tree (NOT git-tracked projects/).
process.env.VIBE_PROJECTS_DIR = path.join(__dirname, '..', '..', 'out', 'work', '_tests', 'projects');

import { test, assert, assertEqual, assertThrows } from './harness';
import { ensureFixtures, FX_DIR, runTsx, lastEnvelope } from './fixtures';
import { emptyManifest, parseManifest } from '../orchestrate/manifest.schema';
import {
  activeVersion, approveStage, approveVersion, assertTransition, completeStage, createManifest,
  failStage, gateSummary, isApprovalPending, listVersions, manifestPath, readManifest, startStage,
} from '../orchestrate/manifest';
import { logProvenance, provenanceLogPath, readProvenance } from '../orchestrate/provenance';
import { decide, technicalGate, type CouncilSummary, type ObjectiveCheck } from '../orchestrate/verify';
import { APIBudgetGuard, cacheKey, GenerationCache } from '../orchestrate/budget-guard';

function freshProject(name: string): string {
  const dir = path.join(process.env.VIBE_PROJECTS_DIR as string, name);
  fs.rmSync(dir, { recursive: true, force: true });
  return name;
}
function check(o: Partial<ObjectiveCheck> & { ok: boolean; severity: ObjectiveCheck['severity']; stage: ObjectiveCheck['stage'] }): ObjectiveCheck {
  return { id: o.id ?? 'x', message: o.message ?? '', ...o };
}
function council(specialists: { id: string; blockers: number }[], aggregate = 'fix'): CouncilSummary {
  return { aggregateVerdict: aggregate, totalBlockers: specialists.reduce((n, s) => n + s.blockers, 0), totalMajors: 0, specialists: specialists.map((s) => ({ id: s.id, verdict: s.blockers ? 'fix-first' : 'ship', blockers: s.blockers, majors: 0 })) };
}

// ── P2.1 manifest schema ────────────────────────────────────────────────────────
test('P2.1 manifestSchema fills defaults + parseManifest validates', () => {
  const m = emptyManifest('demo', { inputs: { brief: 'x' } });
  assertEqual(m.version, 1, 'default version');
  assertEqual(m.status, 'planned', 'default status');
  assertEqual(m.retry_policy.max_retries, 2, 'default retries');
  assertEqual(m.retry_policy.backoff, 'exponential', 'default backoff');
  const round = parseManifest(JSON.parse(JSON.stringify(m)));
  assertEqual(round.project_id, 'demo', 'roundtrips');
});
test('P2.1 parseManifest rejects malformed (missing id, bad stage key)', async () => {
  await assertThrows(() => parseManifest({ version: 1 }), 'missing project_id must throw');
  await assertThrows(() => parseManifest({ project_id: 'x', created_at: 'n', updated_at: 'n', stages: { bogus: {} } }), 'invalid stage key must throw');
});

// ── P2.2 lifecycle + transitions + atomic write + never-overwrite ────────────────
test('P2.2 createManifest writes atomically + stage lifecycle pending→running→complete', () => {
  const p = freshProject('_tests-orch');
  const m = createManifest(p, { inputs: { src: 'clip.mp4' } });
  assert(fs.existsSync(manifestPath(p)), 'manifest.json written');
  assertEqual(m.status, 'planned', 'empty → planned');
  let cur = startStage(p, 'ingest', { fps: 60 });
  assertEqual(cur.stages.ingest.status, 'running', 'ingest running');
  assertEqual(cur.stages.ingest.attempts, 1, 'attempt counted');
  assertEqual(cur.status, 'running', 'rollup running');
  cur = completeStage(p, 'ingest', [FX_DIR + '/clip.mp4']);
  assertEqual(cur.stages.ingest.status, 'complete', 'ingest complete');
  assertEqual(cur.status, 'complete', 'all stages complete → complete');
});
test('P2.2 a complete stage is terminal (never overwrite its outputs)', async () => {
  const p = freshProject('_tests-orch-term');
  createManifest(p);
  startStage(p, 'audio');
  completeStage(p, 'audio', ['a.wav']);
  await assertThrows(() => completeStage(p, 'audio', ['b.wav']), 're-complete must throw');
  await assertThrows(() => assertTransition('complete', 'running'), 'complete→running illegal');
});
test('P2.2 failStage records error + rollup failed; retry path legal', () => {
  const p = freshProject('_tests-orch-fail');
  createManifest(p);
  startStage(p, 'color');
  const m = failStage(p, 'color', 'lut3d exploded');
  assertEqual(m.stages.color.status, 'failed', 'failed');
  assertEqual(m.status, 'failed', 'rollup failed');
  assertEqual(readManifest(p).stages.color.error, 'lut3d exploded', 'error persisted');
  const r = startStage(p, 'color'); // failed → running retry
  assertEqual(r.stages.color.attempts, 2, 'attempt incremented on retry');
});

// ── P2.3 provenance (durable, append-only) ───────────────────────────────────────
test('P2.3 logProvenance hashes outputs + readProvenance is append-only', () => {
  const p = freshProject('_tests-orch-prov');
  const fx = ensureFixtures();
  fs.rmSync(provenanceLogPath(p), { force: true });
  const rec = logProvenance(p, 'audio/master', { args: ['--in', 'x'], outputs: [fx.voiceWav] });
  assert(!!rec.outputs && rec.outputs[0].sha256.length === 64, 'sha256 recorded');
  logProvenance(p, 'color/grade', { outputs: [fx.clipMp4] });
  const all = readProvenance(p);
  assertEqual(all.length, 2, 'two append-only records');
  assertEqual(all[0].capability, 'audio/master', 'order preserved');
});

// ── P2.4 split-verifier decision table (pure, offline) ───────────────────────────
test('P2.4 decide: clean objective + no eyes → ship', () => {
  const r = decide([check({ ok: true, severity: 'blocker', stage: 'audio' })], null);
  assertEqual(r.verdict, 'ship', 'ships');
  assert(r.reasons.some((x) => x.includes('UNVERIFIED')), 'notes taste unverified');
});
test('P2.4 decide: objective blocker → fix that stage (objective is authoritative)', () => {
  const r = decide([check({ ok: false, severity: 'blocker', stage: 'audio', message: 'LUFS off' })], null);
  assertEqual(r.verdict, 'fix', 'fix');
  assertEqual(r.stage_to_retry, 'audio', 'routes to audio');
});
test('P2.4 decide: lenient council "ship" NEVER overrides a failed meter (GAP-36)', () => {
  const r = decide([check({ ok: false, severity: 'blocker', stage: 'audio' })], council([{ id: 'detail', blockers: 0 }], 'ship'));
  assertEqual(r.verdict, 'fix', 'objective wins over a lenient ship');
});
test('P2.4 decide: council technical-lens blocker → fix; taste-lens only → escalate', () => {
  const tech = decide([check({ ok: true, severity: 'blocker', stage: 'audio' })], council([{ id: 'detail', blockers: 2 }]));
  assertEqual(tech.verdict, 'fix', 'detail (technical) → fix');
  assertEqual(tech.stage_to_retry, 'motion', 'detail routes to motion');
  const taste = decide([check({ ok: true, severity: 'blocker', stage: 'audio' })], council([{ id: 'cut', blockers: 1 }]));
  assertEqual(taste.verdict, 'escalate', 'cut (taste) → human');
  assertEqual(taste.stage_to_retry, null, 'no auto-stage on taste');
});
test('P2.4 decide: both axes broken → rework', () => {
  const r = decide([check({ ok: false, severity: 'blocker', stage: 'color' })], council([{ id: 'detail', blockers: 1 }]));
  assertEqual(r.verdict, 'rework', 'rework');
});
test('P2.4 technicalGate runs the objective signals on a real clip (offline)', () => {
  const fx = ensureFixtures();
  const { checks } = technicalGate(fx.clipMp4, { targetLufs: -14, targetTp: -1 });
  assert(checks.some((c) => c.id === 'frame-count'), 'frame-count measured');
  assert(checks.find((c) => c.id === 'frame-count')?.ok === true, 'fixture frame count is self-consistent');
});
test('P2.4 verify.ts CLI emits a well-formed verdict envelope (--no-eyes)', () => {
  const fx = ensureFixtures();
  const r = runTsx('capabilities/orchestrate/verify.ts', ['--in', fx.clipMp4, '--no-eyes', '--project', '_tests-orch']);
  const env = lastEnvelope(r.stdout);
  assert(env.success, `verify failed: ${env.error ?? r.stderr.slice(-300)}`);
  assert(['ship', 'fix', 'rework', 'escalate'].includes(env.metrics.verdict as string), 'verdict in set');
  assert((env.metrics.objectiveChecks as number) > 0, 'ran objective checks');
});

// ── P2.5 proxy-first (480p, keeps source fps per GAP-24) ─────────────────────────
test('P2.5 makeProxy drops resolution but KEEPS source fps (GAP-24)', () => {
  const fx = ensureFixtures();
  const r = runTsx('capabilities/orchestrate/proxy.ts', ['--in', fx.clipMp4, '--height', '120', '--project', '_tests-orch']);
  const env = lastEnvelope(r.stdout);
  assert(env.success, `proxy failed: ${env.error ?? r.stderr.slice(-300)}`);
  const proxy = env.metrics.proxy as { height: number; fps: number };
  assertEqual(proxy.height, 120, 'downscaled to 120p');
  assertEqual(env.metrics.fpsKept, true, 'fps preserved for timeline validity');
});

// ── P2.6 approval gate ───────────────────────────────────────────────────────────
test('P2.6 a stage in approvals_required blocks at completion until approved', () => {
  const p = freshProject('_tests-orch-gate');
  createManifest(p, { approvals_required: ['color'] });
  startStage(p, 'color');
  let m = completeStage(p, 'color', ['graded.mp4']); // held at the gate
  assertEqual(m.stages.color.status, 'blocked', 'held blocked, not complete');
  assertEqual(m.status, 'blocked', 'rollup blocked');
  assert(isApprovalPending(m, 'color'), 'approval pending');
  assert(gateSummary(m, 'color').includes('APPROVAL REQUIRED'), 'gate summary present');
  m = approveStage(p, 'color');
  assertEqual(m.stages.color.status, 'complete', 'approved → complete');
  assertEqual(m.stages.color.outputs[0], 'graded.mp4', 'held outputs preserved');
});

// ── P2.6b auto-fork on revision (GAP-55) ─────────────────────────────────────────
test('P2.6b completeStage with a different params_hash on a complete stage auto-forks to v2', () => {
  const p = freshProject('_tests-orch-fork');
  createManifest(p);
  startStage(p, 'motion');
  completeStage(p, 'motion', ['scenes/03-attention-trap-v1.mp4'], { params_hash: 'h-v1' });
  // re-complete with a new params_hash → must fork (NOT throw, NOT overwrite v1)
  const m = completeStage(p, 'motion', ['scenes/03-attention-trap-v2.mp4'], { params_hash: 'h-v2' });
  assertEqual(m.stages.motion.status, 'complete', 'status stays complete (v1 is still approved)');
  assertEqual(m.stages.motion.outputs[0], 'scenes/03-attention-trap-v1.mp4', 'approved outputs untouched');
  const vs = m.stages.motion.versions ?? [];
  assertEqual(vs.length, 2, 'two version records (v1 seeded + v2 appended)');
  assertEqual(vs[0].v, 1, 'first record is v1');
  assertEqual(vs[0].approved, true, 'v1 approved');
  assertEqual(vs[0].outputs[0], 'scenes/03-attention-trap-v1.mp4', 'v1 outputs preserved');
  assertEqual(vs[1].v, 2, 'second record is v2');
  assertEqual(vs[1].approved, false, 'v2 NOT auto-approved');
  assertEqual(vs[1].outputs[0], 'scenes/03-attention-trap-v2.mp4', 'v2 outputs captured');
  assertEqual(activeVersion(m.stages.motion)?.v, 1, 'activeVersion still v1');
});
test('P2.6b re-completing complete stage with the SAME params_hash still throws (idempotency)', async () => {
  const p = freshProject('_tests-orch-fork-same');
  createManifest(p);
  startStage(p, 'motion');
  completeStage(p, 'motion', ['out.mp4'], { params_hash: 'h-v1' });
  await assertThrows(() => completeStage(p, 'motion', ['out.mp4'], { params_hash: 'h-v1' }), 'identical hash must throw');
});
test('P2.6b re-completing a complete stage WITHOUT a params_hash still throws (preserves contract)', async () => {
  const p = freshProject('_tests-orch-fork-nohash');
  createManifest(p);
  startStage(p, 'motion');
  completeStage(p, 'motion', ['out.mp4']); // no hash on v1
  await assertThrows(() => completeStage(p, 'motion', ['out2.mp4']), 'no hash → terminal-complete contract');
});
test('P2.6b a third revision appends v3 (auto-incrementing version numbers)', () => {
  const p = freshProject('_tests-orch-fork-v3');
  createManifest(p);
  startStage(p, 'motion');
  completeStage(p, 'motion', ['v1.mp4'], { params_hash: 'a' });
  completeStage(p, 'motion', ['v2.mp4'], { params_hash: 'b' });
  const m = completeStage(p, 'motion', ['v3.mp4'], { params_hash: 'c' });
  const vs = m.stages.motion.versions ?? [];
  assertEqual(vs.length, 3, 'three versions');
  assertEqual(vs.map((r) => r.v).join(','), '1,2,3', 'monotonic version numbers');
  assertEqual(vs.filter((r) => r.approved).length, 1, 'only one version is approved');
  assertEqual(vs[0].approved, true, 'v1 stays approved until approveVersion() is called');
});
test('P2.6b approveVersion swaps the active approved version + outputs (either can be re-approved)', () => {
  const p = freshProject('_tests-orch-fork-approve');
  createManifest(p);
  startStage(p, 'motion');
  completeStage(p, 'motion', ['v1.mp4'], { params_hash: 'a' });
  completeStage(p, 'motion', ['v2.mp4'], { params_hash: 'b' });
  const m = approveVersion(p, 'motion', 2);
  const vs = m.stages.motion.versions ?? [];
  assertEqual(vs.find((r) => r.v === 1)?.approved, false, 'v1 unapproved');
  assertEqual(vs.find((r) => r.v === 2)?.approved, true, 'v2 approved');
  assertEqual(m.stages.motion.outputs[0], 'v2.mp4', 'stage.outputs swapped to v2');
  assertEqual(m.stages.motion.params_hash, 'b', 'stage.params_hash swapped to v2');
  // both v1 + v2 still present on disk (records intact)
  assertEqual(vs.length, 2, 'no version dropped');
  assertEqual(listVersions(p, 'motion').length, 2, 'listVersions reads both');
});
test('P2.6b approveVersion throws on an unknown version number', async () => {
  const p = freshProject('_tests-orch-fork-bad-v');
  createManifest(p);
  startStage(p, 'motion');
  completeStage(p, 'motion', ['v1.mp4'], { params_hash: 'a' });
  completeStage(p, 'motion', ['v2.mp4'], { params_hash: 'b' });
  await assertThrows(() => approveVersion(p, 'motion', 9), 'v9 does not exist must throw');
});
test('P2.6b approval gate + fork interplay: gate → approve → revise → forks v2', () => {
  const p = freshProject('_tests-orch-fork-gated');
  createManifest(p, { approvals_required: ['motion'] });
  startStage(p, 'motion');
  let m = completeStage(p, 'motion', ['scene-v1.mp4'], { params_hash: 'a' });
  assertEqual(m.stages.motion.status, 'blocked', 'held at gate');
  m = approveStage(p, 'motion');
  assertEqual(m.stages.motion.status, 'complete', 'gate cleared');
  // revise (different hash) → auto-fork instead of throwing
  m = completeStage(p, 'motion', ['scene-v2.mp4'], { params_hash: 'b' });
  const vs = m.stages.motion.versions ?? [];
  assertEqual(vs.length, 2, 'forked');
  assertEqual(vs[0].outputs[0], 'scene-v1.mp4', 'gated v1 preserved');
  assertEqual(vs[1].outputs[0], 'scene-v2.mp4', 'v2 captured');
});

// ── P2 acceptance: one project driven end-to-end through the manifest ─────────────
test('P2 acceptance: ingest→audio→color→assemble driven by the manifest + provenance + verifier', () => {
  const p = freshProject('_tests-orch-e2e');
  const fx = ensureFixtures();
  fs.rmSync(provenanceLogPath(p), { force: true });
  createManifest(p, { inputs: { src: fx.clipMp4 } });
  const stageOut: Record<string, string> = { ingest: fx.capsJson, audio: fx.voiceWav, color: fx.clipMp4, assemble: fx.clipMp4 };
  for (const stage of ['ingest', 'audio', 'color', 'assemble'] as const) {
    startStage(p, stage);
    completeStage(p, stage, [stageOut[stage]]);
    logProvenance(p, `${stage}/run`, { outputs: [stageOut[stage]] });
  }
  const m = readManifest(p);
  assertEqual(m.status, 'complete', 'all four stages complete');
  assertEqual(readProvenance(p).length, 4, 'four provenance records');
  // verifier gates delivery on the final assembled output
  const { checks } = technicalGate(stageOut.assemble, { targetLufs: -14, targetTp: -1 });
  const verdict = decide(checks, null).verdict;
  assert(['ship', 'fix', 'rework', 'escalate'].includes(verdict), `verifier produced a verdict (${verdict})`);
});

// ── budget guard + generation cache (GAP-43) ─────────────────────────────────────
test('budget-guard: cost ceiling blocks over-budget + persists across instances', () => {
  const proj = '_tests-orch-budget';
  fs.rmSync(path.join(__dirname, '..', '..', 'out', 'work', proj), { recursive: true, force: true });
  const g = new APIBudgetGuard(proj, { maxCostUsd: 1.0, maxRpm: 100 });
  assert(g.canSpend(0.4).allowed, 'first call allowed');
  g.record('vfx/generate', 'veo', 0.4);
  g.record('vfx/generate', 'veo', 0.4);
  assert(!g.canSpend(0.4).allowed, '0.8 + 0.4 > 1.0 blocked');
  const g2 = new APIBudgetGuard(proj, { maxCostUsd: 1.0, maxRpm: 100 }); // reload persisted ledger
  assertEqual(g2.spentUsd(), 0.8, 'ledger persisted across instances');
});
test('budget-guard: rate limit blocks > max_rpm', () => {
  const proj = '_tests-orch-rpm';
  fs.rmSync(path.join(__dirname, '..', '..', 'out', 'work', proj), { recursive: true, force: true });
  const g = new APIBudgetGuard(proj, { maxCostUsd: 1000, maxRpm: 3 });
  for (let i = 0; i < 3; i++) g.record('x', 'm', 0.001);
  assert(!g.canSpend(0.001).allowed, '4th call within 60s blocked by rpm');
  assert(g.canSpend(0.001).reason.includes('rate limit'), 'rpm reason');
});
test('budget-guard: cacheKey is deterministic + GenerationCache reuses existing files', () => {
  const proj = '_tests-orch-cache';
  fs.rmSync(path.join(__dirname, '..', '..', 'out', 'work', proj), { recursive: true, force: true });
  const k1 = cacheKey({ prompt: 'a fox', model: 'veo' });
  const k2 = cacheKey({ prompt: 'a fox', model: 'veo' });
  const k3 = cacheKey({ prompt: 'a fox', model: 'veo', seed: 7 });
  assertEqual(k1, k2, 'same input → same key');
  assert(k1 !== k3, 'seed changes the key');
  const fx = ensureFixtures();
  const cache = new GenerationCache(proj);
  assertEqual(cache.get(k1), null, 'miss before put');
  cache.put(k1, fx.clipMp4);
  assertEqual(cache.get(k1), path.resolve(fx.clipMp4), 'hit returns existing file');
  assertEqual(cache.get('deadbeef'), null, 'unknown key misses');
});
