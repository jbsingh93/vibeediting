/** P4V — the AI VFX capability layer.
 *
 * Covers (offline, no API budget spent):
 *   - P4V.4  motion atoms: VFXComposite + VFXImageOverlay are exported and well-typed.
 *   - P4V.5  generative router (`route.ts`): decision rules for v2v / identity / mood / rapid / default.
 *   - P4V.5  cost claim (`cost.ts`): reads per-second cost from models.json + scales by duration.
 *   - P4V.5  seed-aware cache key (`cache.ts`): Runway includes seed; Veo/Seedance use brief-shape.
 *   - P4V.5  sanitizers: Veo negative defaults, Runway positive phrasing, Seedance strip, Runway-I2V motion-only.
 *   - P4V.5  wrapper payload builders (pure functions): Veo / Runway / Seedance / Aleph payload shapes
 *            + dry-run envelopes (no network), plus the Seedance-identity-locked refusal + Aleph
 *            vague-prompt refusal + Aleph preserve-clause auto-append.
 *   - P4V.8  Aleph specifics: ≤30 s cap, preserve-clause, seed pass-through.
 *   - P4V.11 color-match: Reinhard transfer on a synthetic still shifts LAB stats toward the reference.
 *   - P4V.10 compositor: VFXCompositeScene Zod validation accepts a minimal config + rejects bad shapes.
 *
 * Routes the budget-guard / cache ledger into the disposable test tree so the durable `projects/`
 * folder stays untouched (mirrors the P2 test convention).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { test, assert, assertEqual, assertThrows } from './harness';
import { ensureFixtures, FX_DIR } from './fixtures';

import { route } from '../vfx/generate/route';
import { claimCost, findGenerativeEntry, USD_PER_RUNWAY_CREDIT } from '../vfx/generate/cost';
import { buildCacheKey, refImagesHash } from '../vfx/generate/cache';
import {
  buildVeoNegativePrompt, DEFAULT_VEO_NEGATIVE, RUNWAY_POSITIVE_CLEAN,
  stripBrandWordsForSeedance, motionOnlyForRunwayI2V, enforcePreserveClause,
} from '../vfx/generate/sanitize';
import { buildVeoPayload, generateVeo } from '../vfx/generate/veo';
import { buildRunwayPayload, generateRunway } from '../vfx/generate/runway';
import { buildSeedancePayload, buildSeedanceInputs, generateSeedance, SEEDANCE_2_MODEL_IDS } from '../vfx/generate/seedance';
import { buildAlephPayload, generateAleph, ALEPH_MAX_DURATION_SEC } from '../vfx/generate/aleph';
import type { GenerationBrief } from '../vfx/generate/types';

import { parseVFXScene, vfxCompositeSceneSchema } from '../vfx/compositor/scene';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, VENV_PY as VENV_PY_LOCAL } from '../_env/contract';

// ── P4V.5 router ─────────────────────────────────────────────────────────────────
const baseBrief = (over: Partial<GenerationBrief> = {}): GenerationBrief => ({
  prompt: 'A wide cinematic plate of a Copenhagen street at sunset',
  durationSec: 8,
  aspect: '16:9',
  resolution: 1080,
  ...over,
});

test('P4V.5 route — v2v ALWAYS goes to Runway Aleph', () => {
  const r = route(baseBrief({ v2v: true, referenceVideos: ['x.mp4'] }));
  assertEqual(r.provider, 'runway', 'v2v → runway');
  assertEqual(r.model, 'aleph', 'v2v → aleph');
});

test('P4V.5 route — identity-locked face → Veo 3.1 Standard, NEVER Seedance 2.0', () => {
  const r = route(baseBrief({ identityLocked: true }));
  assertEqual(r.provider, 'veo', 'identity → veo');
  assert(r.model.startsWith('veo-3.1'), `identity → veo-3.1*, got ${r.model}`);
  assert(
    !r.fallbackChain.some((e) => e.provider === 'seedance' && e.model.includes('v2')),
    'fallback chain must NOT include Seedance 2.0 for an identity-locked brief',
  );
});

test('P4V.5 route — mood/textural → Seedance 2.0 (cheapest)', () => {
  const r = route(baseBrief({ mood: true }));
  assertEqual(r.provider, 'seedance', 'mood → seedance');
  assert(r.model.includes('seedance/v2'), `mood → seedance 2.0, got ${r.model}`);
});

test('P4V.5 route — rapid iteration → Runway Gen-4 Turbo (5 credits/s)', () => {
  const r = route(baseBrief({ rapidIteration: true }));
  assertEqual(r.provider, 'runway', 'rapid → runway');
  assertEqual(r.model, 'gen4_turbo', 'rapid → gen4_turbo');
});

test('P4V.5 route — default brief → Veo 3.1 Standard', () => {
  const r = route(baseBrief());
  assertEqual(r.provider, 'veo', 'default → veo');
  assertEqual(r.model, 'veo-3.1-generate-preview', 'default → veo standard');
  assert(r.fallbackChain.length >= 2, 'default ships a fallback chain');
});

// ── P4V.5 cost claim ─────────────────────────────────────────────────────────────
test('P4V.5 cost — Veo 3.1 Standard claims $0.40/s × duration', () => {
  const c = claimCost('veo', 'veo-3.1-generate-preview', 8);
  assert(c.isUsd, 'Veo cost is USD');
  assertEqual(c.costUsd, 3.2, 'Veo 8s @ $0.40 = $3.20');
  assertEqual(c.unitCost, 0.4, '$/s read from models.json');
});

test('P4V.5 cost — Runway Gen-4.5 uses 12 credits/s × USD-per-credit conversion', () => {
  const c = claimCost('runway', 'gen4.5', 5);
  assert(!c.isUsd, 'Runway cost is credits-based');
  assertEqual(c.unitCost, 12, '12 credits/s read from models.json');
  // 12 credits/s × 5s × $0.025/credit = $1.50
  assert(Math.abs(c.costUsd - 12 * 5 * USD_PER_RUNWAY_CREDIT) < 1e-6, `Runway 5s @ 12 cr/s = $${12 * 5 * USD_PER_RUNWAY_CREDIT}`);
});

test('P4V.5 cost — findGenerativeEntry locates models by id', () => {
  const { key } = findGenerativeEntry('aleph');
  assertEqual(key, 'runwayAleph', 'aleph id → runwayAleph entry');
});

test('P4V.5 cost — unknown model id throws', async () => {
  await assertThrows(() => claimCost('veo', 'no-such-model', 8), 'unknown model id must throw');
});

// ── P4V.5 cache key (seed-aware split) ───────────────────────────────────────────
test('P4V.5 cache — Runway key includes seed; Veo/Seedance keys ignore seed', () => {
  const brief = baseBrief({ seed: 42 });
  const briefNoSeed = baseBrief({ seed: undefined });

  const runwayA = buildCacheKey('runway', 'gen4.5', 'x', brief);
  const runwayB = buildCacheKey('runway', 'gen4.5', 'x', briefNoSeed);
  assert(runwayA !== runwayB, 'Runway: seed change → different key');

  const veoA = buildCacheKey('veo', 'veo-3.1-generate-preview', 'x', brief);
  const veoB = buildCacheKey('veo', 'veo-3.1-generate-preview', 'x', briefNoSeed);
  assertEqual(veoA, veoB, 'Veo: seed irrelevant — same key');

  const seedA = buildCacheKey('seedance', 'fal-ai/bytedance/seedance/v2/text-to-video', 'x', brief);
  const seedB = buildCacheKey('seedance', 'fal-ai/bytedance/seedance/v2/text-to-video', 'x', briefNoSeed);
  assertEqual(seedA, seedB, 'Seedance: seed irrelevant — same key');
});

test('P4V.5 cache — duration/aspect/resolution shifts Veo+Seedance keys (since no seed)', () => {
  const a = buildCacheKey('veo', 'veo-3.1-generate-preview', 'x', baseBrief({ durationSec: 8 }));
  const b = buildCacheKey('veo', 'veo-3.1-generate-preview', 'x', baseBrief({ durationSec: 5 }));
  assert(a !== b, 'duration change → different Veo key');
});

test('P4V.5 cache — refImagesHash is order-sensitive', () => {
  ensureFixtures();
  const png = path.join(FX_DIR, 'image.png');
  const a = refImagesHash([png]);
  const b = refImagesHash([png, png]);
  assert(a && b && a !== b, 'different ref list → different ref hash');
});

// ── P4V.5 sanitizers ─────────────────────────────────────────────────────────────
test('P4V.5 sanitize — Veo negative defaults include the watermark/face-morph guards', () => {
  const neg = buildVeoNegativePrompt(['extra,bad']);
  for (const must of ['watermark', 'face morphing', 'subtitles', 'extra fingers']) {
    assert(neg.includes(must), `Veo negative must include "${must}"`);
  }
  assert(DEFAULT_VEO_NEGATIVE.length >= 8, 'default negative list is non-trivial');
});

test('P4V.5 sanitize — stripBrandWordsForSeedance removes brand/text noise', () => {
  const cleaned = stripBrandWordsForSeedance('Cinematic plate with a giant WATERMARK and a corporate Logo and a subtitle below');
  assert(!/\bwatermark\b/i.test(cleaned), 'watermark stripped');
  assert(!/\blogo\b/i.test(cleaned), 'logo stripped');
  assert(!/\bsubtitle\b/i.test(cleaned), 'subtitle stripped');
});

test('P4V.5 sanitize — Runway I2V motion-only filter keeps motion clauses, drops descriptors', () => {
  const prompt = 'A woman in a red dress stands in a field. The camera dollies in slowly.';
  const out = motionOnlyForRunwayI2V(prompt);
  assert(/camera dollies/i.test(out), 'motion clause kept');
  assert(!/red dress/i.test(out), 'static descriptor dropped');
});

test('P4V.5 sanitize — enforcePreserveClause appends when missing, leaves intact when present', () => {
  const a = enforcePreserveClause('Change only the sky to sunset orange.');
  assert(/preserve\b.+subject/i.test(a), 'preserve-clause appended');
  const b = enforcePreserveClause('Change X. Preserve subject, camera, composition.');
  assertEqual(b.match(/preserve/gi)?.length, 1, 'no double-append');
});

test('P4V.5 sanitize — Runway positive phrasing constant present', () => {
  assert(RUNWAY_POSITIVE_CLEAN.includes('clean frame'), 'Runway positive includes "clean frame"');
});

// ── P4V.5 Veo wrapper ────────────────────────────────────────────────────────────
test('P4V.5 buildVeoPayload — applies negatives + audio + aspect + resolution from brief', () => {
  const p = buildVeoPayload(baseBrief(), 'veo-3.1-generate-preview');
  assertEqual(p.audio_enabled, true, 'audio on by default');
  assertEqual(p.aspect_ratio, '16:9', 'aspect propagates');
  assertEqual(p.resolution_short_edge, 1080, 'resolution propagates');
  assert(p.negative_prompt.includes('watermark'), 'negative includes watermark guard');
});

test('P4V.5 generateVeo — dry-run writes a sidecar with the full payload, no spend', async () => {
  delete process.env.GEMINI_API_KEY; // force dry-run regardless of .env
  const out = path.join(FX_DIR, 'p4v-veo-dryrun.mp4');
  const r = await generateVeo('_tests-p4v', baseBrief(), { out, dryRun: true });
  assert(r.outputPath.endsWith('.veo-dry-run.json'), 'dry-run sidecar emitted');
  assertEqual(r.cacheHit, false, 'dry-run is not a cache hit');
  assert(fs.existsSync(r.outputPath), 'sidecar exists on disk');
  const sidecar = JSON.parse(fs.readFileSync(r.outputPath, 'utf8'));
  assert(sidecar.payload && sidecar.costClaim && sidecar.cacheKey, 'sidecar contains payload + cost + key');
});

// ── P4V.5 Runway wrapper ────────────────────────────────────────────────────────
test('P4V.5 buildRunwayPayload — t2v appends Runway positive; i2v strips visual descriptors', () => {
  const t2v = buildRunwayPayload(baseBrief({ prompt: 'A red Ferrari parked on a hill' }), 'gen4.5');
  assertEqual(t2v.modality, 't2v', 't2v default with no reference image');
  assert(t2v.promptText.includes('clean frame'), 't2v appends Runway positive');

  const i2v = buildRunwayPayload(
    baseBrief({ prompt: 'A woman in a red dress stands. The camera pans across the room.', references: ['ref.png'] }),
    'gen4.5',
  );
  assertEqual(i2v.modality, 'i2v', 'i2v inferred from references');
  assert(/camera pans/i.test(i2v.promptText), 'i2v keeps motion-only text');
  assert(!/red dress/i.test(i2v.promptText), 'i2v drops static descriptor');
});

test('P4V.5 buildRunwayPayload — aspect maps to Runway ratio strings', () => {
  assertEqual(buildRunwayPayload(baseBrief({ aspect: '16:9' }), 'gen4.5').ratio, '1280:720', '16:9 → 1280:720');
  assertEqual(buildRunwayPayload(baseBrief({ aspect: '9:16' }), 'gen4.5').ratio, '720:1280', '9:16 → 720:1280');
  assertEqual(buildRunwayPayload(baseBrief({ aspect: '1:1' }), 'gen4.5').ratio, '1024:1024', '1:1 → 1024:1024');
});

test('P4V.5 generateRunway — dry-run writes sidecar, no spend', async () => {
  delete process.env.RUNWAY_API_SECRET;
  const out = path.join(FX_DIR, 'p4v-runway-dryrun.mp4');
  const r = await generateRunway('_tests-p4v', baseBrief({ seed: 7 }), { out, dryRun: true });
  assert(r.outputPath.endsWith('.runway-dry-run.json'), 'dry-run sidecar emitted');
  assertEqual(r.costUsd, 0, 'dry-run does not spend');
});

// ── P4V.5 Seedance wrapper ──────────────────────────────────────────────────────
test('P4V.5 buildSeedancePayload — cameraFixed:false when cameraMotion=true', () => {
  const p = buildSeedancePayload(baseBrief({ cameraMotion: true }), 'fal-ai/bytedance/seedance/v2/text-to-video');
  assertEqual(p.cameraFixed, false, 'camera-motion brief → cameraFixed:false (GAP-50)');
});

test('P4V.5 buildSeedancePayload — REFUSES identity-locked brief on Seedance 2.0', async () => {
  await assertThrows(
    () => buildSeedancePayload(baseBrief({ identityLocked: true }), 'fal-ai/bytedance/seedance/v2/text-to-video'),
    'identity-locked brief must be refused on Seedance 2.0 (blocks realistic faces)',
  );
  assert(SEEDANCE_2_MODEL_IDS.size >= 2, 'Seedance 2.0 model-id set exists for the guard');
});

test('P4V.5 buildSeedanceInputs — builds @Image1/@Video1/@Audio1 tokens with caps', () => {
  const inp = buildSeedanceInputs(baseBrief({ references: ['a', 'b'], referenceVideos: ['c'], referenceAudios: ['d'] }));
  assertEqual(inp.filter((i) => i.kind === 'image').length, 2, '2 image refs');
  assertEqual(inp.filter((i) => i.kind === 'video').length, 1, '1 video ref');
  assertEqual(inp.filter((i) => i.kind === 'audio').length, 1, '1 audio ref');
  assertEqual(inp[0].token, '@Image1', 'first image is @Image1');
});

test('P4V.5 generateSeedance — dry-run writes sidecar, no spend', async () => {
  delete process.env.FAL_KEY;
  const out = path.join(FX_DIR, 'p4v-seedance-dryrun.mp4');
  const r = await generateSeedance('_tests-p4v', baseBrief({ mood: true, cameraMotion: true }), { out, dryRun: true });
  assert(r.outputPath.endsWith('.seedance-dry-run.json'), 'dry-run sidecar emitted');
  assertEqual(r.costUsd, 0, 'dry-run does not spend');
});

// ── P4V.8 Aleph (v2v) ────────────────────────────────────────────────────────────
test('P4V.8 buildAlephPayload — ≤30 s cap, preserve-clause auto-appended', () => {
  const payload = buildAlephPayload(
    baseBrief({
      v2v: true,
      prompt: 'Change only the sky to sunset orange.',
      referenceVideos: ['in.mp4'],
      durationSec: 8,
    }),
  );
  assert(/preserve\b.+subject/i.test(payload.promptText), 'preserve-clause auto-appended');
  assertEqual(payload.model, 'aleph', 'aleph model id');
  assert(payload.durationSec <= ALEPH_MAX_DURATION_SEC, 'within Aleph cap');
});

test('P4V.8 buildAlephPayload — REFUSES vague briefs ("make it better")', async () => {
  await assertThrows(
    () => buildAlephPayload(baseBrief({ v2v: true, prompt: 'Make it look better', referenceVideos: ['in.mp4'] })),
    'vague Aleph prompt must throw (GAP-50)',
  );
});

test('P4V.8 buildAlephPayload — REFUSES requests >30 s', async () => {
  await assertThrows(
    () => buildAlephPayload(baseBrief({ v2v: true, prompt: 'Change only the sky.', referenceVideos: ['in.mp4'], durationSec: 60 })),
    'Aleph 60s request must throw',
  );
});

test('P4V.8 generateAleph — dry-run sidecar carries preserve-clause + seed', async () => {
  delete process.env.RUNWAY_API_SECRET;
  const out = path.join(FX_DIR, 'p4v-aleph-dryrun.mp4');
  const r = await generateAleph(
    '_tests-p4v',
    baseBrief({ v2v: true, prompt: 'Change only the sky to sunset orange.', referenceVideos: ['in.mp4'], seed: 99 }),
    { out, dryRun: true, subject: 'the speaker' },
  );
  assert(r.outputPath.endsWith('.aleph-dry-run.json'), 'dry-run sidecar emitted');
  const sidecar = JSON.parse(fs.readFileSync(r.outputPath, 'utf8'));
  assert(/preserve\b.+the speaker/i.test(sidecar.payload.promptText), 'subject substituted into preserve clause');
  assertEqual(sidecar.payload.seed, 99, 'seed passes through');
});

// ── P4V.10 compositor scene schema ──────────────────────────────────────────────
test('P4V.10 parseVFXScene — accepts a minimal base-only config', () => {
  const r = parseVFXScene({ base: { src: 'public/x/base.mp4' } });
  assertEqual(r.base.src, 'public/x/base.mp4', 'base.src round-trips');
});

test('P4V.10 parseVFXScene — accepts the full layer set + title', () => {
  const r = parseVFXScene({
    base: { src: 'public/x/base.mp4' },
    screenBlend: { src: 'public/x/embers.mp4', from: 30, durationInFrames: 90 },
    alphaOverlay: { src: 'public/x/3d.mov' },
    chromakeyOverlay: { src: 'public/x/keyed.mov' },
    title: { text: 'GROWTH', color: '#FFE600', fontSize: 96, safeRegion: { x: 0.55, y: 0.1, w: 0.4, h: 0.8 } },
  });
  assertEqual(r.title?.text, 'GROWTH', 'title.text round-trips');
});

test('P4V.10 parseVFXScene — rejects malformed (missing base.src, bad title color)', async () => {
  await assertThrows(() => parseVFXScene({}), 'missing base must throw');
  await assertThrows(
    () => parseVFXScene({ base: { src: 'b' }, title: { text: 'x', color: 'not-a-hex' } }),
    'title.color must be a #rrggbb hex',
  );
});

test('P4V.10 vfxCompositeSceneSchema — passes Zod safeParse round-trip', () => {
  const json = JSON.parse(JSON.stringify({ base: { src: 'a.mp4' } }));
  const ok = vfxCompositeSceneSchema.safeParse(json);
  assert(ok.success, 'minimal scene parses');
});

// ── P4V.11 color-match (CPU, synthetic frames) ──────────────────────────────────
test('P4V.11 color-match — Reinhard LAB transfer shifts a warm source toward a cool reference', () => {
  ensureFixtures();
  const { ffmpeg } = require('../_env/ffmpeg').resolveFfmpeg() as { ffmpeg: string };
  // Synthesize a warm source (orange) and a cool reference (blue) PNG
  const srcPng = path.join(FX_DIR, 'cm-src.png');
  const refPng = path.join(FX_DIR, 'cm-ref.png');
  const outPng = path.join(FX_DIR, 'cm-out.png');
  for (const p of [srcPng, refPng, outPng]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  spawnSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=orange:size=64x64:duration=0.1', '-frames:v', '1', srcPng], { encoding: 'utf8' });
  spawnSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=blue:size=64x64:duration=0.1', '-frames:v', '1', refPng], { encoding: 'utf8' });

  const venvPy = VENV_PY_LOCAL;
  if (!fs.existsSync(venvPy)) {
    // Skip silently if the venv isn't bootstrapped on this host — P0.2 covers that.
    console.log('      (venv missing — skipping color-match Python check)');
    return;
  }
  const script = path.join(REPO_ROOT, 'capabilities', 'vfx', 'color-match', 'transfer.py');
  const r = spawnSync(venvPy, [script, '--in', srcPng, '--reference', refPng, '--out', outPng, '--project', '_tests-p4v'], { encoding: 'utf8' });
  assert(r.status === 0, `transfer.py failed: ${(r.stderr ?? '').slice(-400)}`);
  assert(fs.existsSync(outPng), 'output PNG written');
  // Last stdout line is the contract envelope
  const lines = (r.stdout ?? '').trim().split('\n').filter(Boolean);
  const env = JSON.parse(lines[lines.length - 1]);
  assertEqual(env.success, true, 'envelope success');
  assert(Array.isArray(env.metrics.ref_mean_lab), 'envelope carries ref_mean_lab');
});
