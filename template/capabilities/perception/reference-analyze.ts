#!/usr/bin/env tsx
/**
 * capabilities/perception/reference-analyze.ts — microscopic reference deconstruction (plan P1E.4, GAP-48).
 *
 * "Make it like THIS video." Deconstructs a reference (downloaded via acquire/) into a machine-readable
 * STYLE FINGERPRINT — `style-spec.json` — that a style/skill consumes to mimic the reference's craft while
 * staying on-brand.
 *
 * It is the Gemini council (GAP-45) pointed at a REFERENCE with a dedicated reference-deconstruction
 * roster, every "vibe" claim GROUNDED in objective signals we measure ourselves:
 *   - ASL (average shot length)  ← ffmpeg scene-detect (cut count / duration)
 *   - dominant palette (hex)      ← ffmpeg per-sample 1×1 average colors
 *   - loudness profile (LUFS)     ← audio/loudness.py --measure-only
 * Flash-lite over-reads — these meters keep it honest.
 *
 * Model = gemini-3.1-flash-lite (GAP-38). Specialist prompts are seeded from master-gpt-prompter (GAP-47).
 *
 * CLI:
 *   tsx reference-analyze.ts --in REF.mp4 [--out PREFIX] [--fps 3] [--transcript CAPS.json]
 *       [--signals-only] [--project NAME]
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { REPO_ROOT, requireInputFile, run, runCapability, VENV_PY } from '../_env/contract';
import { resolveFfmpeg } from '../_env/ffmpeg';
import { askJson, deleteFile, geminiApiKey, uploadAndWait, visualCortexModel } from './gemini-client';

export interface RefSpecialist { id: string; title: string; lens: string }

/** The reference-deconstruction roster (P1E.4). */
export const REF_SPECIALISTS: RefSpecialist[] = [
  { id: 'tempo', title: 'Tempo / ASL & rhythm analyst', lens: 'pacing, average shot length, rhythm, energy curve, beat-matched cutting, where the tempo accelerates/decelerates.' },
  { id: 'cuts', title: 'Cut-taxonomy & transitions analyst', lens: 'cut types (hard/jump/match/J/L), transition styles (whip/dissolve/fade/zoom), their timing and frequency.' },
  { id: 'color', title: 'Color / grade & exposure analyst', lens: 'grade look (teal-orange/warm/film/flat), contrast, saturation, exposure, skin tones, LUT-style guesses.' },
  { id: 'type', title: 'Typography / fonts & text treatment analyst', lens: 'font families (guess), weights, kinetic-caption style, sizes, positions, animation of text, color/stroke/shadow.' },
  { id: 'overlays', title: 'Overlays / lower-thirds / graphics analyst', lens: 'graphic elements, lower-thirds, progress bars, emojis, stickers, callouts, their style and motion.' },
  { id: 'motion', title: 'Motion / effects & camera analyst', lens: 'camera moves, zoom punches, shake, speed-ramps, glitch/RGB-split, parallax, particle/light FX.' },
  { id: 'sound', title: 'Sound / music / SFX & mix analyst', lens: 'music genre/energy, SFX density (whooshes/impacts), ducking, VO style, silence usage, sound-design hooks.' },
  { id: 'hook', title: 'Hook / retention & story-structure analyst', lens: 'first-3-seconds hook pattern, story arc, retention devices, pattern interrupts, CTA placement.' },
  { id: 'composition', title: 'Composition / framing analyst', lens: 'framing, headroom, rule-of-thirds, aspect, subject placement, negative space, safe-zone usage.' },
];

export function refSpecialistPrompt(s: RefSpecialist, signals: ObjectiveSignals): string {
  return `You are a WORLD-CLASS ${s.title}. You are deconstructing a REFERENCE video so an editing AI can MIMIC its craft. Stay strictly in your lane:

YOUR LANE: ${s.lens}

Objective signals we already measured (treat as GROUND TRUTH — do not contradict the numbers, explain them):
- duration: ${signals.durationSec}s · scene-cuts: ${signals.cutCount} · ASL: ${signals.aslSec}s
- dominant palette (hex): ${signals.palette.join(', ')}
- integrated loudness: ${signals.lufs ?? 'n/a'} LUFS

RULES:
1. Cite MM:SS.s timestamps + frame regions for every observation. No vague "it's dynamic" without evidence.
2. Be specific and reproducible — another editor must be able to RECREATE what you describe.
3. Only report things in YOUR LANE.

Return ONLY this JSON (no markdown):
{
  "specialist": "${s.id}",
  "summary": "2-3 sentences a downstream editor can act on",
  "observations": [ { "time": "MM:SS.s", "what": "specific, reproducible detail", "howToRecreate": "the Remotion technique to match it" } ],
  "parameters": { }  // numeric/string knobs another style can set (e.g. {"asl_target_s":1.8,"transition":"whip_pan","font_weight":800})
}`;
}

export interface ObjectiveSignals {
  durationSec: number;
  cutCount: number;
  aslSec: number;
  palette: string[];
  lufs: number | null;
}



function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}

/** Dominant palette: sample 1 fps, scale each frame to 1×1, read raw rgb24 → per-second average colors. */
function extractPalette(ffmpeg: string, video: string, max = 8): string[] {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', video, '-vf', 'fps=1,scale=1:1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 16 * 1024 * 1024 });
  const buf = r.stdout as Buffer;
  const colors: string[] = [];
  for (let i = 0; i + 2 < buf.length && colors.length < max; i += 3) {
    colors.push(`#${toHex(buf[i])}${toHex(buf[i + 1])}${toHex(buf[i + 2])}`);
  }
  return [...new Set(colors)];
}

export function objectiveSignals(video: string): ObjectiveSignals {
  const { ffmpeg, ffprobe } = resolveFfmpeg();
  const dur = parseFloat(run(ffprobe, ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'default=nokey=1:noprint_wrappers=1', video]).stdout.trim());
  const sc = run(ffmpeg, ['-hide_banner', '-i', video, '-vf', "select='gt(scene,0.3)',showinfo", '-f', 'null', '-']);
  const cutCount = [...(sc.stderr + sc.stdout).matchAll(/pts_time:([0-9.]+)/g)].length;
  const palette = extractPalette(ffmpeg, video);
  // loudness (measure-only) via the python capability
  let lufs: number | null = null;
  const l = run(VENV_PY, [path.join(REPO_ROOT, 'capabilities', 'audio', 'loudness.py'), '--in', video, '--measure-only']);
  try {
    const lines = l.stdout.trim().split('\n').filter(Boolean);
    const env = JSON.parse(lines[lines.length - 1] ?? '{}');
    lufs = env?.metrics?.lufs_before ?? null;
  } catch {
    /* leave null */
  }
  const aslSec = cutCount > 0 ? +(dur / (cutCount + 1)).toFixed(2) : +dur.toFixed(2);
  return { durationSec: +dur.toFixed(2), cutCount, aslSec, palette, lufs };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  await runCapability<Record<string, unknown>>('perception/reference-analyze', async () => {
    const video = requireInputFile(arg('in'), 'reference video');
    const project = arg('project') ?? '_scratch';
    const outPrefix = arg('out') ?? video.replace(/\.[^.]+$/, '') + '.style-spec';
    const fps = parseFloat(arg('fps') ?? '3');

    const signals = objectiveSignals(video);

    // --signals-only: skip the Gemini council (used by the offline test)
    if (process.argv.includes('--signals-only')) {
      const spec = { reference: video, signals, specialists: [], note: 'signals-only (council skipped)' };
      fs.writeFileSync(`${outPrefix}.json`, JSON.stringify(spec, null, 2));
      return { outputs: [path.resolve(`${outPrefix}.json`)], metrics: { signals }, project, args: process.argv.slice(2) };
    }

    const ai = new GoogleGenAI({ apiKey: geminiApiKey() });
    const model = visualCortexModel();
    const file = await uploadAndWait(ai, video);
    const specialists: Record<string, unknown>[] = [];
    try {
      await Promise.all(
        REF_SPECIALISTS.map(async (s) => {
          try {
            const data = await askJson(ai, model, file, refSpecialistPrompt(s, signals), { fps, resolution: 'high' });
            specialists.push(data as Record<string, unknown>);
          } catch (e) {
            specialists.push({ specialist: s.id, error: e instanceof Error ? e.message : String(e) });
          }
        }),
      );
    } finally {
      await deleteFile(ai, file.name);
    }

    const styleSpec = { reference: video, model, signals, specialists, generatedAt: new Date().toISOString() };
    fs.writeFileSync(`${outPrefix}.json`, JSON.stringify(styleSpec, null, 2));

    // human-readable report
    const md = [`# Reference style-spec — ${path.basename(video)}`, '',
      `> Gemini \`${model}\` · ${REF_SPECIALISTS.length} specialists · ${new Date().toISOString()}`, '',
      '## Objective signals', '',
      `- Duration **${signals.durationSec}s** · cuts **${signals.cutCount}** · ASL **${signals.aslSec}s** · loudness **${signals.lufs ?? 'n/a'} LUFS**`,
      `- Palette: ${signals.palette.join(' ')}`, ''].join('\n');
    fs.writeFileSync(`${outPrefix}.md`, md);

    return { outputs: [path.resolve(`${outPrefix}.json`), path.resolve(`${outPrefix}.md`)], metrics: { signals, specialistCount: specialists.length }, project, args: process.argv.slice(2) };
  });
}

// Symlink-safe main-guard: macOS tmp/cwd paths can reach the same file via /var → /private/var,
// so a plain path.resolve comparison misses (live-found on Apple-silicon CI at GATE V3).
const realpathSafe = (p: string): string => { try { return fs.realpathSync(path.resolve(p)); } catch { return path.resolve(p); } };
if (process.argv[1] && realpathSafe(process.argv[1]) === realpathSafe(__filename)) void main();
