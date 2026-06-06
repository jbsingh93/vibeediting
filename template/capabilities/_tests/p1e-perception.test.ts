/** P1E — perception: council roster + forced-evidence prompts, reference-analyze, model guard, aliases. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertEqual } from './harness';
import { ensureFixtures } from './fixtures';
import { REPO_ROOT } from '../_env/contract';
import { SPECIALISTS, specialistPrompt } from '../perception/gemini-council';
import { REF_SPECIALISTS, refSpecialistPrompt, objectiveSignals } from '../perception/reference-analyze';
import { visualCortexModel } from '../perception/gemini-client';

test('P1E.1 council has the 7-specialist roster (GAP-45)', () => {
  assertEqual(SPECIALISTS.length, 7, 'seven specialists');
  const ids = SPECIALISTS.map((s) => s.id).sort();
  assertEqual(ids.join(','), 'avsync,brand,color,composition,detail,story,transition', 'expected roster');
});

test('P1E.1 specialist prompts BAN the non-answer and force frame-tiling + JSON evidence', () => {
  const p = specialistPrompt(SPECIALISTS[0], '9:16 Meta Reel, English, 30s');
  assert(/INVALID answer/i.test(p), 'rejects evidence-free "looks great"');
  assert(/quadrant/i.test(p), 'forces frame-tiling (quadrant scan)');
  assert(/MM:SS/.test(p), 'requires timestamps');
  assert(/blocker/i.test(p), 'severity classification');
});

test('P1E.1 the visual cortex is gemini-3.1-flash-lite (GAP-38), never 2.5', () => {
  assertEqual(visualCortexModel(), 'gemini-3.1-flash-lite', 'flash-lite governing rule');
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
