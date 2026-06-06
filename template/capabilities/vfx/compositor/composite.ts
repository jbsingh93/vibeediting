#!/usr/bin/env tsx
/**
 * capabilities/vfx/compositor/composite.ts — pure-ffmpeg fallback for the VFXComposite Remotion template
 * (plan P4V.10).
 *
 * Most compositing should go THROUGH Remotion (`VFXComposite` in src/components/motion/) — it's
 * deterministic, version-controlled, and frame-driven (GAP-46). This fallback exists for the cases
 * where the orchestrator needs a *quick* ffmpeg-only composite:
 *   - a one-off chromakey overlay on top of a base plate
 *   - alpha-overlay (RGBA input) over a base plate, no React render
 *   - a screen-blend (mood/textural on black) atop a base
 *
 * Uses the `assemble/ffmpeg-ops` typed ops — argv arrays, validated paths (X.2 security).
 *
 * CLI:
 *   tsx composite.ts --base BASE.mp4 --out OUT.mp4 \
 *        [--screen-blend BG_BLACK_VFX.mp4]
 *        [--alpha-overlay RGBA.mov]
 *        [--chromakey-overlay GREEN.mp4 --key 0x00FF00 --similarity 0.3 --blend 0.1]
 *        [--project NAME]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { requireInputFile, run, runCapability } from '../../_env/contract';
import { resolveFfmpeg } from '../../_env/ffmpeg';
import { chromakey, overlay } from '../../assemble/ffmpeg-ops';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Layer one alpha/RGBA overlay onto a base using ffmpeg overlay (single intermediate). */
export function overlayAlpha(base: string, alpha: string, out: string): { ok: boolean; out: string; stderr: string } {
  const r = overlay(base, alpha, out, { x: 0, y: 0 });
  return { ok: r.success, out: r.outputPath, stderr: r.stderr };
}

/** Screen-blend a black-bg VFX clip atop a base via ffmpeg blend=screen. */
export function screenBlend(base: string, vfx: string, out: string): { ok: boolean; out: string; stderr: string } {
  const { ffmpeg } = resolveFfmpeg();
  requireInputFile(base);
  requireInputFile(vfx);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const r = run(ffmpeg, [
    '-y',
    '-i', path.resolve(base),
    '-i', path.resolve(vfx),
    '-filter_complex',
    '[0:v][1:v]blend=all_mode=screen[v]',
    '-map', '[v]', '-map', '0:a?', '-c:a', 'copy', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p',
    path.resolve(out),
  ]);
  return { ok: r.status === 0, out: path.resolve(out), stderr: r.stderr.slice(-2000) };
}

async function main(): Promise<void> {
  await runCapability('vfx/compositor', async () => {
    const base = requireInputFile(arg('base'), 'base plate');
    const outArg = arg('out');
    if (!outArg) throw new Error('missing --out');
    const out = path.resolve(outArg);
    const project = arg('project') ?? '_scratch';
    fs.mkdirSync(path.dirname(out), { recursive: true });

    // Sequence: base → screen-blend → chromakey-keyed-overlay → alpha-overlay
    // (each step writes into a temp file, the next consumes it)
    const tmpA = path.join(path.dirname(out), `.composite-A-${path.basename(out, path.extname(out))}.mp4`);
    const tmpB = path.join(path.dirname(out), `.composite-B-${path.basename(out, path.extname(out))}.mp4`);
    const tmpC = path.join(path.dirname(out), `.composite-C-${path.basename(out, path.extname(out))}.mp4`);
    let current = base;
    const stages: string[] = [];

    if (arg('screen-blend')) {
      const vfx = requireInputFile(arg('screen-blend'), 'screen-blend VFX');
      const r = screenBlend(current, vfx, tmpA);
      if (!r.ok) throw new Error(`screen-blend failed:\n${r.stderr}`);
      current = r.out;
      stages.push('screenBlend');
    }
    if (arg('chromakey-overlay')) {
      const ov = requireInputFile(arg('chromakey-overlay'), 'chromakey overlay');
      // Key the overlay first into an RGBA temp, then overlay onto base
      const keyed = path.join(path.dirname(out), `.keyed-${path.basename(ov)}.mov`);
      const k = chromakey(ov, keyed, {
        color: arg('key') ?? '0x00FF00',
        similarity: parseFloat(arg('similarity') ?? '0.3'),
        blend: parseFloat(arg('blend') ?? '0.1'),
      });
      if (!k.success) throw new Error(`chromakey failed:\n${k.stderr}`);
      const r = overlayAlpha(current, keyed, tmpB);
      if (!r.ok) throw new Error(`chromakey-overlay overlay failed:\n${r.stderr}`);
      current = r.out;
      stages.push('chromakeyOverlay');
    }
    if (arg('alpha-overlay')) {
      const ao = requireInputFile(arg('alpha-overlay'), 'alpha overlay (RGBA)');
      const r = overlayAlpha(current, ao, tmpC);
      if (!r.ok) throw new Error(`alpha-overlay overlay failed:\n${r.stderr}`);
      current = r.out;
      stages.push('alphaOverlay');
    }

    // Move/rename the final intermediate to --out (if nothing changed, copy base)
    if (current !== out) {
      if (fs.existsSync(out)) fs.unlinkSync(out);
      fs.copyFileSync(current, out);
    }
    // Clean intermediates that we wrote
    for (const t of [tmpA, tmpB, tmpC]) {
      if (fs.existsSync(t) && path.resolve(t) !== out) {
        try { fs.unlinkSync(t); } catch { /* best-effort */ }
      }
    }

    return {
      outputs: [out],
      metrics: { stages, baseStreams: stages.length === 0 ? 'passthrough' : `${stages.length} layer(s)` },
      project,
      args: process.argv.slice(2),
    };
  });
}

if (require.main === module) void main();
