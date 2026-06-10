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

test('P1E.1 the panel registry has the 17-specialist roster (SSOT — 10 craft lanes + the 7 MAX-OUT lenses)', () => {
  assertEqual(SPECIALISTS.length, 17, 'seventeen specialists');
  const ids = SPECIALISTS.map((s) => s.id).sort();
  assertEqual(
    ids.join(','),
    'brand,broll-concept,color,composition,continuity,cut,detail,hook,language,motion-design,ocr-text,performance,sound,story,sync,typography,viewer',
    'expected roster',
  );
});

test('P1E.1 perceive vs judge rosters (judge-only lenses stay out of the conceptualize panel)', () => {
  const perceive = rosterFor('perceive').map((s) => s.id);
  const judge = rosterFor('judge').map((s) => s.id);
  for (const judgeOnly of ['brand', 'sync', 'ocr-text', 'language', 'motion-design', 'viewer']) {
    assert(!perceive.includes(judgeOnly), `${judgeOnly} is judge-only — not in the conceptualize/perceive panel`);
  }
  for (const both of ['broll-concept', 'hook', 'continuity']) {
    assert(perceive.includes(both) && judge.includes(both), `${both} runs in both modes`);
  }
  assertEqual(perceive.length, 11, 'eleven conceptualize at ingest');
  assertEqual(judge.length, 17, 'all seventeen judge at delivery');
});

test('P1E.1 the MAX-OUT lenses carry their craft anchors (hook frame-1 · continuity both-sides · sync 45ms · viewer no-tech-duplication)', () => {
  const hook = buildPrompt(specialistById('hook')!, 'judge', {});
  assert(/0:00\.0|frame 1/i.test(hook) && /muted/i.test(hook), 'hook lens reads frame 1 + the muted-feed test');
  const continuity = buildPrompt(specialistById('continuity')!, 'judge', {});
  assert(/last.frame.before|both sides/i.test(continuity), 'continuity compares both sides of every cut');
  const sync = buildPrompt(specialistById('sync')!, 'judge', {});
  assert(/45 ?ms/.test(sync) && /plosive/i.test(sync), 'sync lens carries the 45ms threshold + plosive technique');
  const viewer = buildPrompt(specialistById('viewer')!, 'judge', {});
  assert(/may not duplicate technical lanes/i.test(viewer) && /muted/i.test(viewer), 'viewer is the gestalt lens, not a technician');
  const ocr = buildPrompt(specialistById('ocr-text')!, 'judge', {});
  assert(/character-by-character|æ\/ø\/å/i.test(ocr), 'ocr lens reads character-by-character incl. diacritics');
  const language = buildPrompt(specialistById('language')!, 'judge', {});
  assert(/idiom/i.test(language) && /register/i.test(language), 'language lens judges idiom + register');
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

test('P1E.1 the editing-protocol SSOT exists and the rule IDs resolve (incl. the MAX-OUT additions)', () => {
  const proto = fs.readFileSync(path.join(REPO_ROOT, '.claude', 'skills', 'video-editor', 'references', 'editing-protocol.md'), 'utf8');
  for (const id of ['A1', 'A6', 'C1', 'C6', 'C7', 'V4', 'N1', 'N6', 'N7', 'F4', 'F5', 'K4', 'D4', 'D6', 'D7', 'P3', 'T5', 'T6', 'B4']) {
    assert(new RegExp(`\\b${id}\\b`).test(proto), `protocol defines rule ${id}`);
  }
  assert(/\[GEMINI\]/.test(proto) && /\[METER\]/.test(proto), 'verifier-routing tags present');
  assert(/--votes/.test(proto), 'the ensemble knob is documented in the protocol');
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
