#!/usr/bin/env tsx
/**
 * capabilities/screen-record/record-session.ts — the DETERMINISTIC RECORD stage (plan P1G.3, GAP-60/62/64).
 *
 * Stage 2 of the two-stage capture (mirrors Blender's author→render, GAP-51): a self-contained Playwright
 * script — NO MCP in the loop — replays an action plan the EXPLORE stage discovered, with deliberate
 * pacing + an injected visible cursor, capturing via the PRIMARY path:
 *
 *     page.screencast.start({ onFrame }) → JPEG Buffer per frame → ffmpeg stdin (-f image2pipe -vcodec mjpeg)
 *       → fps=30 -vsync cfr -c:v libx264 -crf 18  →  CLEAN constant-30 fps H.264 mp4   (encode.ts / GAP-63)
 *
 * The MCP/recordVideo WebM path is NEVER the deliverable (1 Mbit VP8, VFR, no audio — GAP-62). This pass is
 * idempotent (re-encode without re-driving the browser) and is what auto-fork-on-revision (P2.6b) versions.
 *
 * playwright is an ON-DEMAND devDep (GAP-67): imported dynamically so this file type-checks and the fast
 * test suite loads actions/pacing/encode/guards WITHOUT a browser installed.
 *
 * CLI:
 *   tsx record-session.ts --plan PLAN.json --project NAME [--out FILE] [--fps 30]
 *                         [--width 1920] [--height 1080] [--dscf 1] [--encoder libx264|h264_nvenc]
 *                         [--storage-state auth.json] [--minterpolate] [--no-cursor]
 *
 * PLAN.json shape (the EXPLORE stage authors this) — see actions.ts RecordPlan:
 *   { "slug":"dashboard-tour", "target":{ "width":1920,"height":1080,"locale":"en-US" },
 *     "output":"public/<project>/dashboard-tour.mp4", "actions":[ {"type":"navigate","url":"…"}, … ] }
 */
import { spawn } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { requireInputFile, run, runCapability } from '../_env/contract';
import { resolveFfmpeg } from '../_env/ffmpeg';
import { runAction, validatePlan, planNavTargets } from './actions';
import { resolvePacing } from './pacing';
import { spawnLivePipeEncoder } from './encode';
import { assertSafeOutputPath, determinismInitScript, framePumpInitScript, isShipPath, redactAuthRef, stealthInitScript, titleLockInitScript } from './guards';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function main(): Promise<void> {
  await runCapability('screen-record/record-session', async () => {
    const planPath = requireInputFile(arg('plan'), 'plan');
    const project = arg('project');
    if (!project) throw new Error('missing --project');
    const plan = validatePlan(JSON.parse(fs.readFileSync(planPath, 'utf8')));

    const fps = parseInt(arg('fps') ?? '30', 10);
    const width = parseInt(arg('width') ?? String(plan.target?.width ?? 1920), 10);
    const height = parseInt(arg('height') ?? String(plan.target?.height ?? 1080), 10);
    const dscf = parseFloat(arg('dscf') ?? String(plan.target?.deviceScaleFactor ?? 1));
    const encoder = (arg('encoder') ?? 'libx264') as 'libx264' | 'h264_nvenc';
    const storageState = arg('storage-state');
    const cursor = !process.argv.includes('--no-cursor');
    const minterpolate = process.argv.includes('--minterpolate');
    const pacing = resolvePacing(plan.pacing);
    // capture method (GAP-62): 'screencast' = sandboxed page.screencast→ffmpeg (default);
    // 'gdigrab' = clock-driven Windows screen-grab of the Chrome window — true CFR, captures the moving
    // overlay cursor even when the compositor throttles CDP screencast. gdigrab films the real screen
    // region, so use it only for non-secret/public content (GAP-65).
    const captureMode = (arg('capture') ?? 'screencast') as 'screencast' | 'gdigrab' | 'screenshot';

    // Resolve + path-guard the output (never a synced personal folder, GAP-65).
    const outRel = arg('out') ?? plan.output ?? `out/${project}/screen-record/${plan.slug ?? 'recording'}.mp4`;
    const output = assertSafeOutputPath(outRel);
    fs.mkdirSync(path.dirname(output), { recursive: true });

    // playwright is a pinned devDep (GAP-67) — imported dynamically so the fast test suite loads
    // actions/pacing/encode/guards with no browser, and a missing install gives a clear message.
    const pw: any = await import('playwright').catch((e) => {
      throw new Error(`record-session needs Playwright (npm i -D playwright && npx playwright install chromium). Cause: ${e?.message ?? e}`);
    });

    const cursorScript = path.join(__dirname, 'assets', 'cursor-overlay.js');
    const baseArgs = [
      '--disable-blink-features=AutomationControlled',
      '--no-default-browser-check',
      // KEEP COMPOSITING ALIVE when the window is unfocused/occluded (GAP-62 footgun).
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-features=CalculateNativeWinOcclusion',
    ];
    // gdigrab captures the Chrome window BY TITLE (DPI-/position-independent); size it so the page inner area
    // is ~width×height (so plan coordinates line up). screencast mode just maximizes.
    const GDI_TITLE_MARKER = 'Vibe Screen Recording';
    const launchArgs =
      captureMode === 'gdigrab'
        ? [...baseArgs, `--window-size=${width},${height + 128}`]
        : ['--start-maximized', ...baseArgs];
    const browser = await pw.chromium.launch({ channel: 'chrome', headless: false, args: launchArgs });
    const context = await browser.newContext({
      // gdigrab captures the REAL window, so let the window size drive the page (viewport:null); screencast
      // mode uses a fixed CDP viewport.
      viewport: captureMode === 'gdigrab' ? null : { width, height },
      deviceScaleFactor: captureMode === 'gdigrab' ? undefined : dscf,
      locale: plan.target?.locale ?? 'en-US',
      timezoneId: plan.target?.timezoneId ?? 'UTC',
      ...(storageState ? { storageState } : {}),
    });
    await context.addInitScript({ content: determinismInitScript() });
    await context.addInitScript({ content: stealthInitScript() }); // public-content realism (GAP-65: demo only)
    await context.addInitScript({ content: framePumpInitScript() }); // keep screencast frames flowing (GAP-62/63)
    if (captureMode === 'gdigrab') await context.addInitScript({ content: titleLockInitScript(GDI_TITLE_MARKER) });
    if (cursor) await context.addInitScript({ path: cursorScript });
    const page = await context.newPage();
    await page.bringToFront().catch(() => undefined); // make the page 'visible' so the compositor ticks

    let framesCaptured = 0;
    let captureLabel = 'page.screencast';
    let encStderr = '';
    const { ffmpeg } = resolveFfmpeg();
    let startedAt = Date.now();
    let wallSec = 0;

    if (captureMode === 'gdigrab') {
      // Clock-driven Windows screen-grab of the Chrome window region. The overlay cursor moving on the real
      // screen is captured at a true 30 fps regardless of compositor throttling (GAP-62 Fallback A).
      captureLabel = 'gdigrab';
      await page.waitForTimeout(600); // let the (locked) window title settle
      // find the Chrome window by its locked title (DPI-/position-independent; no fragile geometry math)
      const ps = run('powershell', ['-NoProfile', '-Command',
        `(Get-Process | Where-Object { $_.MainWindowTitle -like '*${GDI_TITLE_MARKER}*' } | Select-Object -First 1).MainWindowTitle`]);
      const winTitle = (ps.stdout || '').trim().split(/\r?\n/)[0]?.trim() ?? '';
      if (!winTitle) throw new Error(`gdigrab: could not find the Chrome window titled '*${GDI_TITLE_MARKER}*' (is it visible/not minimized?)`);
      const codec = encoder === 'h264_nvenc'
        ? ['-c:v', 'h264_nvenc', '-rc', 'constqp', '-qp', '18', '-preset', 'p4']
        : ['-c:v', 'libx264', '-crf', '18', '-preset', 'fast'];
      // even-dimension safety via a scale-down-to-even pad-free crop in the filter
      const gdiArgs = ['-y', '-f', 'gdigrab', '-framerate', String(fps), '-draw_mouse', '0',
        '-i', `title=${winTitle}`,
        '-vf', `crop=trunc(iw/2)*2:trunc(ih/2)*2,fps=${fps},format=yuv420p`, '-vsync', 'cfr', ...codec, '-movflags', '+faststart', output];
      const proc = spawn(ffmpeg, gdiArgs, { stdio: ['pipe', 'inherit', 'pipe'] });
      proc.stderr.on('data', (d: Buffer) => { encStderr += d.toString(); if (encStderr.length > 200_000) encStderr = encStderr.slice(-100_000); });
      await page.waitForTimeout(500); // let gdigrab spin up before the first action
      startedAt = Date.now();
      try {
        for (const a of plan.actions) await runAction(page, a, pacing);
      } finally {
        try { proc.stdin.write('q'); proc.stdin.end(); } catch { /* already closing */ }
      }
      wallSec = (Date.now() - startedAt) / 1000;
      const rc = await new Promise<number>((res) => proc.on('close', (c) => res(c ?? -1)));
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
      if (rc !== 0 || !fs.existsSync(output)) throw new Error(`gdigrab failed (rc=${rc}): ${encStderr.slice(-600)}`);
    } else if (captureMode === 'screenshot') {
      // Robust-anywhere path: a clock-paced CDP screenshot loop. Each page.screenshot() FORCES a fresh
      // composite, so the moving overlay cursor is captured even when the browser renders off-display and the
      // passive screencast/compositor is frame-throttled (GAP-62/63). JPEG buffers → ffmpeg image2pipe.
      captureLabel = 'screenshot-loop';
      const encode = spawnLivePipeEncoder({ output, fps, encoder, downscale: dscf > 1 ? { width, height } : undefined });
      let stop = false;
      const targetMs = 1000 / fps;
      const shotLoop = (async () => {
        while (!stop) {
          const t0 = Date.now();
          try {
            const b: Buffer = await page.screenshot({ type: 'jpeg', quality: 80 });
            if (encode.proc.stdin.writable) { encode.proc.stdin.write(b); framesCaptured++; }
          } catch { /* navigation in-flight — skip this frame */ }
          const dt = Date.now() - t0;
          if (dt < targetMs) await page.waitForTimeout(targetMs - dt).catch(() => undefined);
        }
      })();
      startedAt = Date.now();
      try {
        for (const a of plan.actions) await runAction(page, a, pacing);
      } finally {
        stop = true;
        await shotLoop.catch(() => undefined);
        encode.proc.stdin.end();
      }
      wallSec = (Date.now() - startedAt) / 1000;
      const enc = await encode.whenDone();
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
      if (!enc.success || !fs.existsSync(output)) throw new Error(`encode failed (rc=${enc.returncode}): ${enc.stderr.slice(-600)}`);
    } else {
      // PRIMARY: page.screencast onFrame JPEG → ffmpeg stdin (GAP-62/63).
      const encode = spawnLivePipeEncoder({ output, fps, encoder, minterpolate, downscale: dscf > 1 ? { width, height } : undefined });
      const screencast = page.screencast; // start() returns a disposable; stop() lives on this object
      if (typeof screencast?.start !== 'function') {
        encode.proc.stdin.end();
        await browser.close().catch(() => undefined);
        throw new Error('page.screencast is unavailable — Playwright >= 1.59 required (GAP-62/67). Bump the pinned playwright devDep.');
      }
      await screencast.start({
        size: { width: Math.round(width * dscf), height: Math.round(height * dscf) },
        quality: 90,
        onFrame: (frame: { data: Buffer | string }) => {
          const raw = frame?.data;
          const buf = Buffer.isBuffer(raw) ? raw : typeof raw === 'string' ? Buffer.from(raw, 'base64') : null;
          if (buf && encode.proc.stdin.writable) { encode.proc.stdin.write(buf); framesCaptured++; }
        },
      });
      startedAt = Date.now();
      try {
        for (const a of plan.actions) await runAction(page, a, pacing);
      } finally {
        await screencast.stop().catch(() => undefined);
        encode.proc.stdin.end();
      }
      wallSec = (Date.now() - startedAt) / 1000;
      const enc = await encode.whenDone();
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
      if (!enc.success || !fs.existsSync(output)) throw new Error(`encode failed (rc=${enc.returncode}): ${enc.stderr.slice(-600)}`);
    }

    // probe the finished clip (handed to ingest/probe for durationInFrames downstream)
    const { ffprobe } = resolveFfmpeg();
    const probe = run(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets,r_frame_rate,width,height', '-show_entries', 'format=duration', '-of', 'json', output]);
    const meta = JSON.parse(probe.stdout || '{}');
    const v = meta.streams?.[0] ?? {};
    const durationSec = parseFloat(meta.format?.duration ?? '0');
    const scriptSha256 = crypto.createHash('sha256').update(fs.readFileSync(planPath)).digest('hex');
    const urls = planNavTargets(plan);

    return {
      outputs: [output],
      metrics: {
        capture: captureLabel, encoder, fps,
        width: parseInt(v.width ?? String(width), 10), height: parseInt(v.height ?? String(height), 10),
        deviceScaleFactor: dscf, framesCaptured, frameCount: parseInt(v.nb_read_packets ?? '0', 10),
        durationSec: +durationSec.toFixed(3), wallSec: +wallSec.toFixed(1), rFrameRate: v.r_frame_rate ?? null,
        ship: isShipPath(output), scriptSha256, targetUrls: urls, auth: redactAuthRef(storageState),
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
