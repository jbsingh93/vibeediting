#!/usr/bin/env tsx
/**
 * capabilities/screen-record/cdp-screencast.ts — FALLBACK B: raw CDP capture (plan P1G.5, GAP-62).
 *
 * Reach for this only when the high-level `page.screencast` API doesn't expose a knob you need —
 * `everyNthFrame` (render at 60, keep every 2nd → a clean 30) or `maxWidth/maxHeight` HiDPI downsample.
 *
 * CDP `Page.startScreencast({format:'jpeg', quality, maxWidth, maxHeight, everyNthFrame})` emits
 * `Page.screencastFrame` events carrying base64 JPEG + `metadata.timestamp` (real wall-clock seconds —
 * the monotonic stamp for timestamp-driven assembly). CRITICAL: each frame MUST be
 * `Page.screencastFrameAck({sessionId})`'d or Chrome stops sending (single-frame flow control, GAP-62).
 * We write frames to disk + a concat manifest (buildConcatManifest, faithful Δtimestamp timing), then
 * encode.ts's 'concat' recipe resamples to a constant 30 fps.
 *
 * Like record-session.ts, playwright is imported dynamically (on-demand devDep, GAP-67). The pure
 * frame→manifest logic lives in encode.ts and is unit-tested without a browser.
 *
 * CLI: tsx cdp-screencast.ts --plan PLAN.json --project NAME [--out FILE] [--fps 30] [--every-nth 2]
 *      [--max-width 1920] [--quality 90]
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { requireInputFile, run, runCapability } from '../_env/contract';
import { resolveFfmpeg } from '../_env/ffmpeg';
import { buildConcatManifest, runEncode } from './encode';
import { resolvePacing } from './pacing';
import { assertSafeOutputPath, determinismInitScript, isShipPath } from './guards';
import { runAction, validatePlan, planNavTargets } from './actions';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

async function main(): Promise<void> {
  await runCapability('screen-record/cdp-screencast', async () => {
    const planPath = requireInputFile(arg('plan'), 'plan');
    const project = arg('project');
    if (!project) throw new Error('missing --project');
    const plan = validatePlan(JSON.parse(fs.readFileSync(planPath, 'utf8')));
    const fps = parseInt(arg('fps') ?? '30', 10);
    const everyNth = parseInt(arg('every-nth') ?? '2', 10); // render @60 → keep every 2nd → 30
    const maxWidth = arg('max-width') ? parseInt(arg('max-width')!, 10) : undefined;
    const quality = parseInt(arg('quality') ?? '90', 10);
    const width = parseInt(arg('width') ?? String(plan.target?.width ?? 1920), 10);
    const height = parseInt(arg('height') ?? String(plan.target?.height ?? 1080), 10);
    const pacing = resolvePacing(plan.pacing);

    const outRel = arg('out') ?? plan.output ?? `out/${project}/screen-record/${plan.slug ?? 'recording'}-cdp.mp4`;
    const output = assertSafeOutputPath(outRel);
    const framesDir = path.join(path.dirname(output), `${path.basename(output, path.extname(output))}-frames`);
    fs.mkdirSync(framesDir, { recursive: true });

    const pw: any = await import('playwright').catch((e) => {
      throw new Error(`cdp-screencast needs Playwright (npm i -D playwright). Cause: ${e?.message ?? e}`);
    });

    const browser = await pw.chromium.launch({ channel: 'chrome', headless: false });
    const context = await browser.newContext({
      viewport: { width, height },
      locale: plan.target?.locale ?? 'en-US',
      timezoneId: plan.target?.timezoneId ?? 'UTC',
    });
    await context.addInitScript({ content: determinismInitScript() });
    await context.addInitScript({ path: path.join(__dirname, 'assets', 'cursor-overlay.js') });
    const page = await context.newPage();
    const client = await context.newCDPSession(page);

    const frames: { file: string; ts: number }[] = [];
    client.on('Page.screencastFrame', async (params: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
      const idx = frames.length;
      const file = path.join(framesDir, `frame-${String(idx).padStart(6, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(params.data, 'base64'));
      frames.push({ file, ts: params.metadata?.timestamp ?? idx / 60 });
      // MUST ack or Chrome sends no more frames (single-frame flow control, GAP-62).
      await client.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => undefined);
    });

    await client.send('Page.startScreencast', { format: 'jpeg', quality, everyNthFrame: everyNth, ...(maxWidth ? { maxWidth } : {}) });
    try {
      for (const a of plan.actions) await runAction(page, a, pacing);
    } finally {
      await client.send('Page.stopScreencast').catch(() => undefined);
    }
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);

    if (frames.length === 0) throw new Error('CDP screencast captured 0 frames (ACK loop failed?)');

    // reconstruct real timing from Δtimestamp, then resample to a constant 30 fps (concat recipe).
    const durations: { file: string; durationSec: number }[] = frames.map((f, i) => ({
      file: f.file,
      durationSec: i < frames.length - 1 ? Math.max(0.0001, frames[i + 1].ts - f.ts) : 1 / fps,
    }));
    const manifest = path.join(framesDir, 'frames.txt');
    fs.writeFileSync(manifest, buildConcatManifest(durations), 'utf8');

    const enc = await runEncode({ source: 'concat', input: manifest, output, fps });
    if (!enc.success || !fs.existsSync(output)) throw new Error(`concat encode failed (rc=${enc.returncode}): ${enc.stderr.slice(-600)}`);

    const { ffprobe } = resolveFfmpeg();
    const probe = run(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets,r_frame_rate', '-show_entries', 'format=duration', '-of', 'json', output]);
    const meta = JSON.parse(probe.stdout || '{}');
    const v = meta.streams?.[0] ?? {};
    const scriptSha256 = crypto.createHash('sha256').update(fs.readFileSync(planPath)).digest('hex');
    const urls = planNavTargets(plan);

    return {
      outputs: [output],
      metrics: {
        capture: 'cdp.startScreencast', everyNthFrame: everyNth, fps,
        framesCaptured: frames.length, frameCount: parseInt(v.nb_read_packets ?? '0', 10),
        durationSec: +parseFloat(meta.format?.duration ?? '0').toFixed(3), rFrameRate: v.r_frame_rate ?? null,
        ship: isShipPath(output), scriptSha256, targetUrls: urls,
      },
      project, source: urls[0], args: process.argv.slice(2),
    };
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Symlink-safe main-guard: macOS tmp/cwd paths can reach the same file via /var → /private/var,
// so a plain path.resolve comparison misses (live-found on Apple-silicon CI at GATE V3).
const realpathSafe = (p: string): string => { try { return fs.realpathSync(path.resolve(p)); } catch { return path.resolve(p); } };
if (process.argv[1] && realpathSafe(process.argv[1]) === realpathSafe(__filename)) void main();
