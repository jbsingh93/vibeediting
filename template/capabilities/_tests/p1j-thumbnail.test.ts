/** P1J — generate/thumbnail (GAP-72): size math, prompt scaffold, naming, dry-run envelope. No API spend. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertEqual, assertIncludes } from './harness';
import { ensureFixtures, lastEnvelope, runTsx } from './fixtures';
import { modelId } from '../_env/contract';
import { buildPrompt, finalSize, genSize, parseAt } from '../generate/thumbnail';

test('P1J.1 genSize maps video aspects to legal gpt-image-2 sizes (multiples of 16, long edge 2048)', () => {
  assertEqual(JSON.stringify(genSize(1920, 1080)), JSON.stringify({ gw: 2048, gh: 1152 }), '16:9 → 2048x1152 (native)');
  assertEqual(JSON.stringify(genSize(1080, 1920)), JSON.stringify({ gw: 1152, gh: 2048 }), '9:16 → 1152x2048 (native)');
  const sq = genSize(1000, 1000);
  assert(sq.gw === 2048 && sq.gh === 2048, '1:1 → 2048x2048');
  const odd = genSize(320, 240);
  assert(odd.gw % 16 === 0 && odd.gh % 16 === 0, 'odd aspect still multiples of 16');
});

test('P1J.2 finalSize delivers the video resolution, capped at the generated size (never upscale)', () => {
  assertEqual(JSON.stringify(finalSize(1920, 1080, 2048, 1152)), JSON.stringify({ tw: 1920, th: 1080 }), '1080p kept as-is');
  assertEqual(JSON.stringify(finalSize(3840, 2160, 2048, 1152)), JSON.stringify({ tw: 2048, th: 1152 }), '4K capped to gen size');
});

test('P1J.3 parseAt accepts seconds and mm:ss', () => {
  assertEqual(parseAt('75'), 75, 'plain seconds');
  assertEqual(parseAt('1:15'), 75, 'mm:ss');
  let threw = false;
  try { parseAt('abc'); } catch { threw = true; }
  assert(threw, 'rejects garbage');
});

test('P1J.4 buildPrompt = Change+Preserve scaffold; no-text default; verbatim headline block', () => {
  const p = buildPrompt('dark studio backdrop', 'landscape 16:9-class');
  assertIncludes(p, 'CHANGE: dark studio backdrop', 'user style is the CHANGE block');
  assertIncludes(p, 'PRESERVE (do not alter in any way)', 'preserve list present');
  assertIncludes(p, 'Do not render any text', 'no-text constraint by default');
  const h = buildPrompt('x', 'square', 'AI SKOLEN');
  assertIncludes(h, 'EXACT TEXT, render verbatim', 'headline rendered verbatim');
  assertIncludes(h, '"AI SKOLEN"', 'headline quoted');
  assert(!h.includes('Do not render any text'), 'no-text constraint dropped when headline given');
});

test('P1J.5 models.json registers image.thumbnail = the pinned gpt-image-2 snapshot', () => {
  assertEqual(modelId('image.thumbnail'), 'gpt-image-2-2026-04-21', 'pinned snapshot id');
});

test('P1J.6 dry-run: extracts the frame, plans the call, names "<video_name> thumbnail.png" beside the video', () => {
  const fx = ensureFixtures();
  const r = runTsx('capabilities/generate/thumbnail.ts', ['--video', fx.clipMp4, '--prompt', 'premium dark backdrop', '--project', '_tests', '--dry-run']);
  assertEqual(r.status, 0, `dry-run exit:\n${r.stderr.slice(-600)}`);
  const env = lastEnvelope(r.stdout);
  assert(env.success, 'envelope success');
  const m = env.metrics as { dryRun: boolean; size: string; finalSize: string; outputs: string[]; frame: string };
  assert(m.dryRun === true, 'dryRun flagged');
  assertEqual(m.finalSize, '320x240', 'final = video resolution');
  assert(m.outputs[0].endsWith(`clip thumbnail.png`), `named "<video_name> thumbnail.png" — got ${m.outputs[0]}`);
  assertEqual(path.dirname(m.outputs[0]), path.dirname(fx.clipMp4), 'lands NEXT TO the video');
  assert(fs.existsSync(m.frame), 'frame actually extracted');
  const plan = JSON.parse(fs.readFileSync(env.outputs[1], 'utf8'));
  assertIncludes(plan.prompt, 'PRESERVE', 'plan carries the scaffolded prompt');
});

test('P1J.8 dry-run: --aspect 3:4 overrides the video aspect (1536x2048)', () => {
  const fx = ensureFixtures();
  const r = runTsx('capabilities/generate/thumbnail.ts', ['--video', fx.clipMp4, '--prompt', 'x', '--aspect', '3:4', '--project', '_tests', '--dry-run']);
  assertEqual(r.status, 0, `exit:\n${r.stderr.slice(-600)}`);
  const m = lastEnvelope(r.stdout).metrics as { size: string; finalSize: string };
  assertEqual(m.size, '1536x2048', '3:4 gen size');
  assertEqual(m.finalSize, '1536x2048', '3:4 final size');
});

test('P1J.7 dry-run warns on æ/ø/å in --headline (overlay non-ASCII text in Remotion instead)', () => {
  const fx = ensureFixtures();
  const r = runTsx('capabilities/generate/thumbnail.ts', ['--video', fx.clipMp4, '--prompt', 'x', '--headline', 'CAFÉ SØNDAG ÆBLE', '--project', '_tests', '--dry-run']);
  assertEqual(r.status, 0, `exit:\n${r.stderr.slice(-600)}`);
  const env = lastEnvelope(r.stdout) as unknown as { warnings?: string[] };
  assert((env.warnings ?? []).some((w) => w.includes('non-ASCII')), 'non-ASCII glyph warning emitted');
});
