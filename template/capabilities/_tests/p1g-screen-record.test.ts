/**
 * P1G — screen-record: the clean constant-30 fps capture capability (GAP-60..67).
 *
 * Fast tier (npm test, NO browser/network): pure ffmpeg-argv recipes, pacing defaults, the cursor-overlay
 * asset, the path-guard, plan validation, the screencast verifier meters, and the verifier's pure decide().
 * Render tier (npm run test:render): a REAL stitch — synthetic JPEG frames through the live-pipe encoder
 * (the exact deliverable path) → assert ffprobe reports CFR 30/1 + correct frame count + resolution.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertEqual, assertIncludes, assertThrows } from './harness';
import { REPO_ROOT } from '../_env/contract';
import { resolveFfmpeg } from '../_env/ffmpeg';
import {
  buildEncodeArgs, buildVideoFilter, buildConcatManifest, spawnLivePipeEncoder,
} from '../screen-record/encode';
import { DEFAULT_PACING, resolvePacing, scrollTicks } from '../screen-record/pacing';
import { assertSafeOutputPath, isShipPath, determinismInitScript } from '../screen-record/guards';
import { validatePlan, planNavTargets } from '../screen-record/actions';
import { buildScreencastChecks, type ScreencastProbe } from '../screen-record/verify-screencast';
import { decide } from '../orchestrate/verify';
import { wantsScreencastLens, SCREENCAST_SPECIALIST } from '../perception/gemini-council';

// ── P1G.4 — the stitch: pure ffmpeg-argv recipes ───────────────────────────────

test('P1G.4 image2pipe live-pipe recipe = mjpeg stdin → fps=30 -vsync cfr libx264 crf 18 +faststart', () => {
  const args = buildEncodeArgs({ source: 'image2pipe', output: 'out.mp4' });
  const s = args.join(' ');
  assertIncludes(s, '-f image2pipe', 'reads an image pipe');
  assertIncludes(s, '-vcodec mjpeg', 'expects mjpeg frames');
  assertIncludes(s, '-use_wallclock_as_timestamps 1', 'real arrival timestamps so fps=30 fills sparse VFR gaps');
  assertIncludes(s, '-i pipe:0', 'from stdin');
  assertIncludes(s, '-vf fps=30,scale=in_range=pc:out_range=tv,format=yuv420p', 'constant 30 fps + full→tv range + yuv420p (not yuvj420p)');
  assertIncludes(s, '-vsync cfr', 'forces CFR');
  assertIncludes(s, '-c:v libx264 -crf 18 -preset fast', 'x264 CRF 18');
  assertIncludes(s, '-movflags +faststart', 'web-optimized');
  assertEqual(args[args.length - 1], 'out.mp4', 'output is last');
});

test('P1G.4 concat recipe wires the frame manifest; webm recipe transcodes VFR→CFR', () => {
  const c = buildEncodeArgs({ source: 'concat', input: 'frames.txt', output: 'o.mp4' }).join(' ');
  assertIncludes(c, '-f concat -safe 0 -i frames.txt', 'concat demuxer on the manifest');
  assertIncludes(c, 'fps=30,scale=in_range=pc:out_range=tv,format=yuv420p', 'resamples to 30 + range-converts JPEG frames');
  const w = buildEncodeArgs({ source: 'webm', input: 'raw.webm', output: 'o.mp4' }).join(' ');
  assertIncludes(w, '-i raw.webm', 'reads the webm');
  assertIncludes(w, '-vf fps=30,format=yuv420p', 'webm is already tv-range — no pc→tv conversion');
  assertIncludes(w, '-vsync cfr', 'CFR output');
});

test('P1G.4 minterpolate REPLACES plain fps; downscale adds lanczos; nvenc swaps the encoder', () => {
  assertEqual(buildVideoFilter({ minterpolate: true }), 'minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,format=yuv420p', 'minterpolate chain');
  assertEqual(buildVideoFilter({ downscale: { width: 1920, height: 1080 } }), 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', 'lanczos downscale');
  const n = buildEncodeArgs({ source: 'image2pipe', output: 'o.mp4', encoder: 'h264_nvenc' }).join(' ');
  assertIncludes(n, '-c:v h264_nvenc -rc constqp -qp 18 -preset p4', 'NVENC constqp path');
  assert(!n.includes('libx264'), 'no x264 when nvenc selected');
});

test('P1G.4 concat manifest reconstructs Δtimestamp timing and repeats the final frame', async () => {
  const m = buildConcatManifest([{ file: 'a.jpg', durationSec: 0.033 }, { file: 'b.jpg', durationSec: 0.05 }]);
  const lines = m.trim().split('\n');
  assertEqual(lines[0], "file 'a.jpg'", 'first frame');
  assertIncludes(lines[1], 'duration 0.033', 'its real delta');
  assertEqual(lines[lines.length - 1], "file 'b.jpg'", 'final file repeated (concat-demuxer quirk)');
  await assertThrows(() => buildConcatManifest([]), 'empty manifest throws');
});

test('P1G.4 concat/webm recipes require an input', async () => {
  await assertThrows(() => buildEncodeArgs({ source: 'concat', output: 'o.mp4' }), 'concat needs input');
  await assertThrows(() => buildEncodeArgs({ source: 'webm', output: 'o.mp4' }), 'webm needs input');
});

// ── P1G.2 — pacing + cursor overlay ────────────────────────────────────────────

test('P1G.2 pacing defaults are watchable; resolvePacing overrides; scrollTicks computes', () => {
  assert(DEFAULT_PACING.moveSteps >= 20, 'cursor glides (many steps)');
  assert(DEFAULT_PACING.typeDelayMs > 0, 'typing has a per-key delay');
  assertEqual(resolvePacing({ moveSteps: 10 }).moveSteps, 10, 'override applied');
  assertEqual(resolvePacing({ moveSteps: 10 }).postClickMs, DEFAULT_PACING.postClickMs, 'others keep defaults');
  assertEqual(scrollTicks(700), Math.round(700 / DEFAULT_PACING.scrollDeltaPx), 'tick count from total px');
});

test('P1G.2 cursor-overlay asset is pointer-events:none and max z-index (never eats a click)', () => {
  const js = fs.readFileSync(path.join(REPO_ROOT, 'capabilities', 'screen-record', 'assets', 'cursor-overlay.js'), 'utf8');
  assertIncludes(js, 'pointer-events:none', 'overlay never intercepts input');
  assertIncludes(js, 'z-index:2147483647', 'sits above every app layer');
  assertIncludes(js, 'setInterval', 'keep-alive re-creates the cursor if the parser/SPA wipes it');
  assertIncludes(js, 'function ensure', 'lazily (re)creates the cursor node — survives document_start documentElement swap');
});

// ── P1G.6 — security/determinism guards ────────────────────────────────────────

test('P1G.6 path-guard accepts out/ & public/, rejects out-of-repo and disallowed roots', async () => {
  assertIncludes(assertSafeOutputPath('out/x/screen-record/a.mp4'), path.join('out', 'x'), 'out/ allowed');
  assert(isShipPath('public/proj/a.mp4'), 'public/ is a ship path');
  assert(!isShipPath('out/proj/a.mp4'), 'out/ is not a ship path');
  await assertThrows(() => assertSafeOutputPath('C:/Users/someone/OneDrive/secret.mp4'), 'rejects a synced personal folder');
  await assertThrows(() => assertSafeOutputPath('../escape.mp4'), 'rejects escaping the repo');
  await assertThrows(() => assertSafeOutputPath('src/proj/a.mp4'), 'rejects a non-output root');
});

test('P1G.6 determinism init-script freezes Date and seeds Math.random', () => {
  const s = determinismInitScript();
  assertIncludes(s, 'Date = F', 'clock frozen');
  assertIncludes(s, 'Math.random', 'RNG seeded');
});

// ── P1G.3 — plan validation ─────────────────────────────────────────────────────

test('P1G.3 validatePlan accepts a good plan and extracts nav targets', () => {
  const plan = validatePlan({ slug: 't', actions: [{ type: 'navigate', url: 'https://a.com' }, { type: 'click', selector: '#go' }, { type: 'navigate', url: 'https://b.com' }] });
  assertEqual(plan.actions.length, 3, 'all actions kept');
  assertEqual(planNavTargets(plan).join(','), 'https://a.com,https://b.com', 'nav targets enumerated');
});

test('P1G.3 validatePlan rejects empty/malformed plans', async () => {
  await assertThrows(() => validatePlan({ actions: [] }), 'empty actions');
  await assertThrows(() => validatePlan({ actions: [{ type: 'navigate' }] }), 'navigate without url');
  await assertThrows(() => validatePlan({ actions: [{ type: 'click' }] }), 'click without selector');
});

// ── P1G.7 — the screencast verifier meters + the pure decide() ───────────────────

const goodProbe: ScreencastProbe = { width: 1920, height: 1080, avgFrameRate: '30/1', rFrameRate: '30/1', nbReadPackets: 600, durationSec: 20, pixFmt: 'yuv420p', distinctFrameSignals: 12 };

test('P1G.7 a clean 30fps clip passes every screencast meter', () => {
  const checks = buildScreencastChecks(goodProbe);
  assert(checks.every((c) => c.ok), `all meters pass: ${checks.filter((c) => !c.ok).map((c) => c.id).join(', ')}`);
  assert(checks.every((c) => c.stage === 'screen-record'), 'all route to screen-record');
});

test('P1G.7 VFR / wrong-frame-count / wrong-res / wrong-pixfmt / frozen all fail', () => {
  const vfr = buildScreencastChecks({ ...goodProbe, avgFrameRate: '24/1', rFrameRate: '30/1' }).find((c) => c.id === 'screencast-cfr');
  assert(vfr && !vfr.ok && vfr.severity === 'blocker', 'VFR is a blocker');
  const fc = buildScreencastChecks({ ...goodProbe, nbReadPackets: 480 }).find((c) => c.id === 'screencast-frame-count');
  assert(fc && !fc.ok, 'dropped frames flagged');
  const res = buildScreencastChecks({ ...goodProbe, width: 1280, height: 720 }).find((c) => c.id === 'screencast-resolution');
  assert(res && !res.ok, 'wrong resolution flagged');
  const pf = buildScreencastChecks({ ...goodProbe, pixFmt: 'yuv444p' }).find((c) => c.id === 'screencast-pixfmt');
  assert(pf && !pf.ok, 'wrong pixfmt flagged');
  const frozen = buildScreencastChecks({ ...goodProbe, distinctFrameSignals: 1 }).find((c) => c.id === 'screencast-not-frozen');
  assert(frozen && !frozen.ok && frozen.severity === 'blocker', 'frozen capture is a blocker');
});

test('P1G.7 verify.decide() routes a screencast blocker back to the screen-record stage', () => {
  const checks = buildScreencastChecks({ ...goodProbe, avgFrameRate: '0/0', rFrameRate: '30/1', nbReadPackets: 0 });
  const r = decide(checks, null);
  assertEqual(r.verdict, 'fix', 'a failed meter → fix');
  assertEqual(r.stage_to_retry, 'screen-record', 'routes to the capture stage');
});

test('P1G.7 council screencast sub-lens is opt-in by flag or context', () => {
  assert(wantsScreencastLens(true, undefined), 'explicit flag includes it');
  assert(wantsScreencastLens(false, '9:16 product demo, English'), 'a demo context includes it');
  assert(!wantsScreencastLens(false, '9:16 Meta reel, English'), 'a generic reel does not');
  assertIncludes(SCREENCAST_SPECIALIST.lens.toLowerCase(), 'cursor', 'the lens checks the cursor');
});

// ── P1G.9 render tier — REAL stitch through the deliverable encoder ──────────────

test('[render] P1G.9 live-pipe encoder stitches JPEG frames into a CFR 30/1 mp4', async () => {
  if (!process.argv.includes('--render')) return; // fast tier skips the real encode
  const { ffmpeg, ffprobe } = resolveFfmpeg();
  const dir = path.join(REPO_ROOT, 'out', 'work', '_tests', 'screen-record');
  fs.mkdirSync(dir, { recursive: true });

  // synthesize 60 JPEG frames (2s @ 30fps, moving testsrc2) — stands in for page.screencast onFrame buffers
  const gen = spawnSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=2', '-q:v', '3', path.join(dir, 'f-%04d.jpg')], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assertEqual(gen.status, 0, `frame gen failed: ${(gen.stderr ?? '').slice(-300)}`);
  const frames = fs.readdirSync(dir).filter((f) => f.startsWith('f-') && f.endsWith('.jpg')).sort();
  assert(frames.length >= 30, `generated ${frames.length} frames`);

  const out = path.join(dir, 'stitched.mp4');
  const enc = spawnLivePipeEncoder({ output: out, fps: 30 });
  // pace the writes ~33 ms apart to mimic real page.screencast VFR arrival (wall-clock timestamps + fps=30
  // then dup-fill to a real-duration constant-30 clip — the exact deliverable behavior).
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  for (const f of frames.slice(0, 45)) {
    enc.proc.stdin.write(fs.readFileSync(path.join(dir, f)));
    await sleep(33);
  }
  enc.proc.stdin.end();
  const res = await enc.whenDone();
  assert(res.success, `encode failed (rc=${res.returncode}): ${res.stderr.slice(-400)}`);
  assert(fs.existsSync(out), 'mp4 produced');

  const probe = spawnSync(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets,r_frame_rate,avg_frame_rate,width,height,pix_fmt', '-show_entries', 'format=duration', '-of', 'json', out], { encoding: 'utf8' });
  const meta = JSON.parse(probe.stdout || '{}');
  const v = meta.streams?.[0] ?? {};
  const durationSec = parseFloat(meta.format?.duration ?? '0');
  assertEqual(v.avg_frame_rate, '30/1', 'avg frame rate is CFR 30');
  assertEqual(v.r_frame_rate, '30/1', 'r frame rate is CFR 30');
  // for a truly-CFR clip, frame count == round(duration × 30) exactly (the GAP-66 meter)
  assertEqual(parseInt(v.nb_read_packets, 10), Math.round(durationSec * 30), 'CFR: frame count == round(duration × 30)');
  assert(parseInt(v.nb_read_packets, 10) > 30, `non-trivial clip (${v.nb_read_packets} frames over ${durationSec.toFixed(2)}s)`);
  assertEqual(v.width, 640, 'width preserved');
  assertEqual(v.pix_fmt, 'yuv420p', 'broad-compat pixel format (full→tv range-converted, not yuvj420p)');
});
