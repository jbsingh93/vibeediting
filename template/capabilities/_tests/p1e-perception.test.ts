/** P1E — perception: specialist-panel registry (perceive+judge) · reference-analyze · model guard · aliases. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertEqual } from './harness';
import { ensureFixtures } from './fixtures';
import { REPO_ROOT } from '../_env/contract';
import { SPECIALISTS, specialistPrompt } from '../perception/gemini-council';
import { applyRepetition, buildPrompt, rosterFor, specialistById } from '../perception/specialists';
import { REF_SPECIALISTS, refSpecialistPrompt, objectiveSignals } from '../perception/reference-analyze';
import { visualCortexModel } from '../perception/gemini-client';

test('P1E.1 the panel registry has the 10-specialist roster (SSOT)', () => {
  assertEqual(SPECIALISTS.length, 10, 'ten specialists');
  const ids = SPECIALISTS.map((s) => s.id).sort();
  assertEqual(ids.join(','), 'brand,broll-concept,color,composition,cut,detail,performance,sound,story,typography', 'expected roster');
});

test('P1E.1 perceive vs judge rosters (brand is judge-only; broll-concept runs both)', () => {
  const perceive = rosterFor('perceive').map((s) => s.id);
  const judge = rosterFor('judge').map((s) => s.id);
  assert(!perceive.includes('brand'), 'brand is judge-only — not in the conceptualize/perceive panel');
  assert(perceive.includes('broll-concept') && judge.includes('broll-concept'), 'broll-concept runs in both modes');
  assert(judge.length === 10, 'all ten judge');
});

test('P1E.1 a visual JUDGE prompt BANS the non-answer + forces quadrant scan + MM:SS + severity', () => {
  const detail = specialistById('detail');
  assert(!!detail, 'detail specialist present');
  const p = specialistPrompt(detail!, '9:16 Meta Reel, English, 30s'); // back-compat wrapper → judge prompt
  assert(/rejected/i.test(p), 'rejects evidence-free "looks good"');
  assert(/quadrant/i.test(p), 'forces frame-tiling (quadrant scan)');
  assert(/MM:SS/.test(p), 'requires timestamps');
  assert(/blocker/i.test(p), 'severity calibration present');
  assert(/Based on the video above/i.test(p), 'task is anchored after the video context');
});

test('P1E.1 the audio specialist uses the audio scan variant (no quadrant), grades A-rules', () => {
  const sound = specialistById('sound');
  assert(!!sound, 'sound specialist present');
  const p = buildPrompt(sound!, 'judge', { context: '9:16, 30s' });
  assert(/full frequency range/i.test(p), 'audio scan variant (not visual quadrants)');
  assert(/A1|A5/.test(p), 'references its protocol rule IDs');
  assert(/output_schema/i.test(p), 'carries a strict JSON schema contract');
});

test('P1E.1 the concept-visualization gate (teach-test) is baked into broll-concept', () => {
  const bc = specialistById('broll-concept');
  const p = buildPrompt(bc!, 'perceive', { transcript: '[00:00] hello world' });
  assert(/understand .* the spoken words alone did not give them/i.test(p), 'teach-test present');
  assert(/TRANSCRIPT_START/.test(p), 'transcript anchor injected when provided');
});

test('P1E.1 prompt repetition wraps low-effort lanes (free accuracy; Google Research Dec-2025)', () => {
  const composition = specialistById('composition')!; // repetition: double
  const once = buildPrompt(composition, 'judge', {});
  const wrapped = applyRepetition(once, composition.repetition.judge);
  assert(wrapped.length > once.length && /Let me repeat that/.test(wrapped), 'double repetition applied to a low-effort lane');
});

test('P1E.1 the visual cortex is gemini-3.1-flash-lite (GAP-38), never 2.5', () => {
  assertEqual(visualCortexModel(), 'gemini-3.1-flash-lite', 'flash-lite governing rule');
});

test('P1E.1 the editing-protocol SSOT exists and the rule IDs resolve', () => {
  const proto = fs.readFileSync(path.join(REPO_ROOT, '.claude', 'skills', 'video-editor', 'references', 'editing-protocol.md'), 'utf8');
  for (const id of ['A1', 'C1', 'V4', 'N1', 'F4', 'K4', 'D4', 'P3', 'T5', 'B4']) {
    assert(new RegExp(`\\b${id}\\b`).test(proto), `protocol defines rule ${id}`);
  }
  assert(/\[GEMINI\]/.test(proto) && /\[METER\]/.test(proto), 'verifier-routing tags present');
});

test('P1E.4 reference-analyze has the 9-specialist deconstruction roster', () => {
  assertEqual(REF_SPECIALISTS.length, 9, 'nine reference specialists');
  assert(REF_SPECIALISTS.some((s) => s.id === 'type'), 'typography/fonts specialist present');
  const p = refSpecialistPrompt(REF_SPECIALISTS[0], { durationSec: 30, cutCount: 16, aslSec: 1.8, palette: ['#112233'], lufs: -14 });
  assert(/GROUND TRUTH/.test(p), 'grounds claims in measured signals');
  assert(/1\.8/.test(p), 'injects the measured ASL');
});

test('P1E.4 reference-analyze extracts objective signals offline (ASL + palette)', () => {
  const fx = ensureFixtures();
  const s = objectiveSignals(fx.sceneMp4);
  assert(s.cutCount >= 1, 'detected the scene cut');
  assert(s.palette.length >= 1, 'extracted a palette');
  assert(s.durationSec > 1, 'measured duration');
});

test('P1E.1/.2 the canonical scripts are physically promoted (no delegate shims left)', () => {
  for (const rel of ['perception/gemini-video-review.ts', 'perception/cut-doctor.ts', 'generate/elevenlabs-tts.ts', 'generate/elevenlabs-music.ts', 'generate/elevenlabs-sfx.ts']) {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'capabilities', rel), 'utf8');
    assert(!/delegateToSkillScript\(/.test(src), `${rel} must be the real script, not a delegate shim`);
    assert(src.length > 2000, `${rel} looks too small to be the promoted canonical script`);
  }
  assert(!fs.existsSync(path.join(REPO_ROOT, 'capabilities', '_env', 'delegate.ts')), 'delegate.ts must be gone (promotion done)');
});
