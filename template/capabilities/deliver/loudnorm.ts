#!/usr/bin/env tsx
/**
 * capabilities/deliver/loudnorm.ts — delivery loudness normalize (plan P1E.3). Ports loudnorm.sh.
 *
 * TWO-PASS `loudnorm=I=-14:TP=-1:LRA=11` on a finished MP4 (video stream copied), via the full-build
 * resolver (not bare `ffmpeg`). Pass 1 measures (print_format=json); pass 2 applies linear=true with the
 * measured values so we hit the target accurately even on sparse/quiet material (single-pass dynamic mode
 * undershoots badly when a clip is mostly silence — e.g. a caption-led ad with no music bed). Falls back to
 * single-pass if the measurement can't be parsed. `-shortest` matches the audio length to the (copied)
 * video so the container duration stays frame-accurate for the delivery verifier.
 *
 * CLI: tsx loudnorm.ts --in IN.mp4 [--out OUT.mp4] [--i -14] [--tp -1] [--lra 11] [--project NAME]
 */
import * as path from 'node:path';
import { requireInputFile, run, runCapability } from '../_env/contract';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Parse the trailing JSON object ffmpeg's loudnorm prints with print_format=json (it goes to stderr). */
function parseLoudnormJson(stderr: string): Record<string, string> | null {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(stderr.slice(start, end + 1)) as Record<string, string>;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  await runCapability('deliver/loudnorm', async () => {
    const { resolveFfmpeg } = await import('../_env/ffmpeg');
    const { ffmpeg } = resolveFfmpeg();
    const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    const input = requireInputFile(arg('in') ?? positional[0], 'input mp4');
    const i = arg('i') ?? '-14', tp = arg('tp') ?? '-1', lra = arg('lra') ?? '11';
    const out = arg('out') ?? input.replace(/\.[^.]+$/, '') + '-loudnorm.mp4';
    const base = `loudnorm=I=${i}:TP=${tp}:LRA=${lra}`;

    // ── Pass 1: measure ────────────────────────────────────────────────────────
    const measure = run(ffmpeg, ['-hide_banner', '-i', input, '-af', `${base}:print_format=json`, '-f', 'null', '-']);
    const m = parseLoudnormJson(measure.stderr);

    // ── Pass 2: apply ──────────────────────────────────────────────────────────
    // Two-pass ONLY when every measured value is a finite number in ffmpeg's accepted range —
    // a SILENT source measures input_i = "-inf", which parses as a string but makes pass 2 fail
    // with "Value -inf for parameter 'measured_I' out of range [-99 - 0]" (live-found at V5:
    // the DemoWelcome chain). Silence falls back to single-pass dynamic mode, which handles it.
    const num = (s: string | undefined): number | null => {
      const v = Number(s);
      return Number.isFinite(v) ? v : null;
    };
    let af: string | null = base;
    let twoPass = false;
    let bypassed = false;
    if (m) {
      const mi = num(m.input_i), mtp = num(m.input_tp), mlra = num(m.input_lra);
      const mth = num(m.input_thresh), moff = num(m.target_offset);
      if (mi !== null && mtp !== null && mlra !== null && mth !== null && moff !== null && mi >= -99 && mi <= 0) {
        af =
          `${base}:measured_I=${mi}:measured_TP=${mtp}:measured_LRA=${mlra}` +
          `:measured_thresh=${mth}:offset=${moff}:linear=true`;
        twoPass = true;
      } else if (mi === null) {
        // DIGITALLY-silent source: input_i measures "-inf". There is nothing to normalize, and
        // dynamic-mode loudnorm on exact-zero samples emits NaN/±Inf that kills the aac encoder
        // ("Input contains (near) NaN/+-Inf" — live-found by P1K.2; one level deeper than the V5
        // F10 -inf two-pass guard, which only rerouted to dynamic mode). Bypass the filter and
        // deliver the audio as-is so the chain still ships.
        af = null;
        bypassed = true;
      }
    }
    const r = run(ffmpeg, ['-y', '-i', input, ...(af ? ['-af', af] : []),
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out]);
    if (r.status !== 0) throw new Error(`loudnorm failed (exit ${r.status}):\n${r.stderr.slice(-1200)}`);

    return {
      outputs: [path.resolve(out)],
      metrics: { target: { i: +i, tp: +tp, lra: +lra }, twoPass, bypassed },
      warnings: bypassed ? ['source audio is digital silence — loudnorm bypassed (nothing to normalize)'] : undefined,
      project: arg('project') ?? '_scratch',
      args: process.argv.slice(2),
    };
  });
}

void main();
