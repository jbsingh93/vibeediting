#!/usr/bin/env tsx
/**
 * capabilities/orchestrate/verify.ts — the SPLIT verifier / delivery gate (plan P2.4; GAP-22/36).
 *
 * The deepest finding (GAP-36): a single "down-weight lenient Gemini unless a measurement backs it"
 * verifier CANNOT help on taste (pacing/emotion have no objective proxy). So the gate is split:
 *
 *   1. TECHNICAL GATE — objective signals are AUTHORITATIVE. Gemini is advisory here.
 *        • frame-count == round(duration × fps) ± 1   (GAP-22: the AAC-priming A/V start_time delta
 *          is dropped — it produces benign false blockers; real sync is cut-doctor's job)
 *        • integrated LUFS within target ± 1 and true-peak ≤ target_tp + 0.5  (loudness.py, GAP-14)
 *        • not a black/blank render (signalstats YAVG)   • caption gaps/overlaps (if captions given)
 *   2. TASTE GATE — the gemini-council (GAP-45) is the only signal; resolution is HUMAN APPROVAL,
 *      NOT auto-discount. Taste-lens blockers (transition/story) → escalate-to-human.
 *
 * Codifies the binding rule "ground lenient AI verdicts in objective signals": a council `ship` NEVER
 * overrides a failed meter (objective wins); the council can only ADD findings, never excuse a number.
 *
 * Returns `{ verdict: ship|fix|rework|escalate, stage_to_retry, reasons[] }`.
 *
 * CLI:
 *   tsx verify.ts --in VIDEO [--fps 60] [--target-lufs -14] [--target-tp -1]
 *       [--captions CAPS.json] [--context "9:16 Meta Reel, Danish, 30s"]
 *       [--eyes | --no-eyes] [--project NAME]
 * Eyes default: ON when GEMINI_API_KEY is present and --no-eyes is absent (pass --no-eyes for offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { hasEnv, REPO_ROOT, requireInputFile, run, runCapability, VENV_PY } from '../_env/contract';
import { resolveFfmpeg } from '../_env/ffmpeg';
import type { StageName } from './manifest.schema';
import { buildScreencastChecks, type ScreencastProbe, type ScreencastTarget } from '../screen-record/verify-screencast';

// ── types ─────────────────────────────────────────────────────────────────────

export type Verdict = 'ship' | 'fix' | 'rework' | 'escalate';
export type Severity = 'blocker' | 'major' | 'minor';

export interface ObjectiveCheck {
  id: string;
  ok: boolean;
  severity: Severity;
  stage: StageName;
  message: string;
  value?: number | string;
  expected?: number | string;
}

export interface CouncilSummary {
  aggregateVerdict: string;
  totalBlockers: number;
  totalMajors: number;
  specialists: { id: string; verdict: string; blockers: number; majors: number }[];
}

export interface VerifyResult {
  verdict: Verdict;
  stage_to_retry: StageName | null;
  reasons: string[];
  technical: ObjectiveCheck[];
  eyes: CouncilSummary | null;
}

/** Which capability stage a council specialist's blockers route back to, and whether the lens is pure taste. */
const SPECIALIST_STAGE: Record<string, { stage: StageName; taste: boolean }> = {
  detail: { stage: 'motion', taste: false },
  transition: { stage: 'assemble', taste: true },
  story: { stage: 'motion', taste: true },
  brand: { stage: 'motion', taste: false },
  composition: { stage: 'motion', taste: false },
  avsync: { stage: 'audio', taste: false },
  color: { stage: 'color', taste: false },
  screencast: { stage: 'screen-record', taste: false },
};

// ── the decision table (pure → unit-testable offline, GAP-36) ───────────────────

/**
 * Fuse the technical gate (authoritative) with the council EYES (advisory + taste). Objective
 * blockers always win; a lenient council `ship` can never excuse a failed meter.
 */
export function decide(checks: ObjectiveCheck[], eyes: CouncilSummary | null): VerifyResult {
  const objBlockers = checks.filter((c) => !c.ok && c.severity === 'blocker');
  const objMajors = checks.filter((c) => !c.ok && c.severity === 'major');
  const eyesBlocking = (eyes?.specialists ?? []).filter((s) => s.blockers > 0);
  const reasons: string[] = [];

  for (const c of objBlockers) reasons.push(`BLOCKER [${c.stage}] ${c.message}`);
  for (const c of objMajors) reasons.push(`major [${c.stage}] ${c.message}`);
  for (const s of eyesBlocking) reasons.push(`council:${s.id} flagged ${s.blockers} blocker(s) — ${SPECIALIST_STAGE[s.id]?.taste ? 'taste' : 'technical'} lens`);

  // both axes broken → the whole thing needs reworking
  if (objBlockers.length && eyesBlocking.length) {
    return { verdict: 'rework', stage_to_retry: objBlockers[0].stage, reasons, technical: checks, eyes };
  }
  // objective authoritative: any failed meter → fix that stage (even if the council said "ship")
  if (objBlockers.length) {
    return { verdict: 'fix', stage_to_retry: objBlockers[0].stage, reasons, technical: checks, eyes };
  }
  // objective clean → consult the eyes
  if (eyesBlocking.length) {
    const technical = eyesBlocking.filter((s) => SPECIALIST_STAGE[s.id] && !SPECIALIST_STAGE[s.id].taste);
    if (technical.length) {
      return { verdict: 'fix', stage_to_retry: SPECIALIST_STAGE[technical[0].id].stage, reasons, technical: checks, eyes };
    }
    // only taste lenses raised blockers → human-in-the-loop, not an auto-discount
    reasons.push('taste-axis concern only — escalate to human approval (no objective proxy exists for pacing/emotion)');
    return { verdict: 'escalate', stage_to_retry: null, reasons, technical: checks, eyes };
  }
  // everything passed
  if (!eyes) reasons.push('eyes skipped — objective gate passed; taste UNVERIFIED (run with --eyes for the council)');
  else reasons.push('objective gate passed and the council found no blockers');
  return { verdict: 'ship', stage_to_retry: null, reasons, technical: checks, eyes };
}

// ── objective measurement ───────────────────────────────────────────────────────



interface ProbeV {
  streams: { codec_type: string; nb_read_packets?: string; r_frame_rate?: string }[];
  format: { duration?: string };
}

function checkFrames(ffprobe: string, video: string): ObjectiveCheck {
  const r = run(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets,r_frame_rate', '-show_entries', 'format=duration', '-of', 'json', video]);
  const data = JSON.parse(r.stdout || '{}') as ProbeV;
  const v = data.streams?.[0];
  const [num, den] = (v?.r_frame_rate ?? '0/1').split('/').map(Number);
  const fps = den ? num / den : num;
  const duration = parseFloat(data.format?.duration ?? '0');
  const actual = parseInt(v?.nb_read_packets ?? '0', 10);
  const expected = Math.round(duration * fps);
  const ok = Math.abs(actual - expected) <= 1 && actual > 0;
  return {
    id: 'frame-count',
    ok,
    severity: 'blocker',
    stage: 'assemble',
    value: actual,
    expected,
    message: ok ? `frame count ${actual} ≈ round(${duration.toFixed(2)}s × ${fps.toFixed(2)}fps)=${expected}` : `frame count ${actual} ≠ expected ${expected} (truncated/corrupt render?)`,
  };
}

function hasAudio(ffprobe: string, video: string): boolean {
  const r = run(ffprobe, ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', video]);
  return r.stdout.trim().length > 0;
}

function checkLoudness(video: string, targetLufs: number, targetTp: number): ObjectiveCheck | null {
  const r = run(VENV_PY, [path.join(REPO_ROOT, 'capabilities', 'audio', 'loudness.py'), '--in', video, '--measure-only']);
  let lufs: number | null = null;
  let tp: number | null = null;
  try {
    const lines = r.stdout.trim().split('\n').filter(Boolean);
    const env = JSON.parse(lines[lines.length - 1] ?? '{}');
    lufs = env?.metrics?.lufs_before ?? null;
    tp = env?.metrics?.tp_before ?? null;
  } catch {
    return null; // measurement unavailable — don't fabricate a verdict
  }
  if (lufs === null) return null;
  const lufsOk = Math.abs(lufs - targetLufs) <= 1;
  const tpOk = tp === null ? true : tp <= targetTp + 0.5;
  const ok = lufsOk && tpOk;
  return {
    id: 'loudness',
    ok,
    severity: 'blocker',
    stage: 'audio',
    value: `${lufs.toFixed(1)} LUFS / ${tp === null ? '?' : tp.toFixed(1)} dBTP`,
    expected: `${targetLufs} LUFS / ≤ ${targetTp} dBTP`,
    message: ok ? `loudness ${lufs.toFixed(1)} LUFS, TP ${tp?.toFixed(1)} dBTP within spec` : `loudness ${lufs.toFixed(1)} LUFS (target ${targetLufs}±1) / TP ${tp?.toFixed(1)} dBTP (≤ ${targetTp})`,
  };
}

function checkNotBlack(ffmpeg: string, video: string): ObjectiveCheck | null {
  const r = run(ffmpeg, ['-hide_banner', '-i', video, '-vf', 'fps=2,signalstats,metadata=print', '-f', 'null', '-']);
  const vals = [...(r.stderr + r.stdout).matchAll(/lavfi\.signalstats\.YAVG=([0-9.]+)/g)].map((m) => parseFloat(m[1]));
  if (vals.length === 0) return null; // best-effort; no signal → no check
  const meanY = vals.reduce((a, b) => a + b, 0) / vals.length;
  const ok = meanY >= 6; // < 6 on a 0..255 luma scale ≈ a black/blank render (GAP-11 opaque-alpha footgun)
  return {
    id: 'not-black',
    ok,
    severity: 'blocker',
    stage: 'motion',
    value: +meanY.toFixed(1),
    expected: '≥ 6',
    message: ok ? `mean luma ${meanY.toFixed(1)} — real content present` : `mean luma ${meanY.toFixed(1)} — render is near-black/blank`,
  };
}

function checkCaptions(captionsPath: string): ObjectiveCheck[] {
  const caps = JSON.parse(fs.readFileSync(captionsPath, 'utf8')) as { startMs: number; endMs: number; text: string }[];
  const checks: ObjectiveCheck[] = [];
  let overlaps = 0;
  let bigGaps = 0;
  for (let i = 0; i < caps.length - 1; i++) {
    if (caps[i].endMs > caps[i + 1].startMs + 1) overlaps++;
    if (caps[i + 1].startMs - caps[i].endMs > 2000) bigGaps++;
  }
  checks.push({ id: 'caption-overlap', ok: overlaps === 0, severity: 'major', stage: 'motion', value: overlaps, expected: 0, message: overlaps === 0 ? 'no overlapping captions' : `${overlaps} overlapping caption pair(s)` });
  checks.push({ id: 'caption-gaps', ok: bigGaps === 0, severity: 'minor', stage: 'motion', value: bigGaps, expected: 0, message: bigGaps === 0 ? 'no large caption gaps' : `${bigGaps} gap(s) > 2s between captions` });
  return checks;
}

/** Probe a clip for the screencast meters (CFR / frame-count / resolution / pixfmt / non-frozen). */
function screencastProbe(ffmpeg: string, ffprobe: string, video: string): ScreencastProbe {
  const r = run(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries',
    'stream=nb_read_packets,r_frame_rate,avg_frame_rate,width,height,pix_fmt', '-show_entries', 'format=duration', '-of', 'json', video]);
  const data = JSON.parse(r.stdout || '{}');
  const v = data.streams?.[0] ?? {};
  // non-frozen proxy: count distinct YAVG luma signatures across sampled frames (a frozen capture → 1)
  const sig = run(ffmpeg, ['-hide_banner', '-i', video, '-vf', 'fps=2,signalstats,metadata=print', '-f', 'null', '-']);
  const yavgs = [...(sig.stderr + sig.stdout).matchAll(/lavfi\.signalstats\.YAVG=([0-9.]+)/g)].map((m) => m[1]);
  const distinct = new Set(yavgs.map((y) => Number(y).toFixed(1))).size;
  return {
    width: parseInt(v.width ?? '0', 10),
    height: parseInt(v.height ?? '0', 10),
    avgFrameRate: v.avg_frame_rate ?? '0/1',
    rFrameRate: v.r_frame_rate ?? '0/1',
    nbReadPackets: parseInt(v.nb_read_packets ?? '0', 10),
    durationSec: parseFloat(data.format?.duration ?? '0'),
    pixFmt: v.pix_fmt ?? '?',
    distinctFrameSignals: yavgs.length ? distinct : undefined,
  };
}

/** Run the whole objective technical gate. Pure-ish (touches ffmpeg/python); returns the checks. */
export function technicalGate(
  video: string,
  opts: { targetLufs: number; targetTp: number; captionsPath?: string; screencast?: ScreencastTarget | null },
): { checks: ObjectiveCheck[]; warnings: string[] } {
  // importing resolveFfmpeg is side-effect-free; it only resolves paths when CALLED here (decide() stays ffmpeg-free)
  const { ffmpeg, ffprobe } = resolveFfmpeg();
  const checks: ObjectiveCheck[] = [];
  const warnings: string[] = [];

  checks.push(checkFrames(ffprobe, video));

  if (hasAudio(ffprobe, video)) {
    const l = checkLoudness(video, opts.targetLufs, opts.targetTp);
    if (l) checks.push(l);
    else warnings.push('loudness measurement unavailable (venv/loudness.py) — audio gate skipped');
  } else {
    warnings.push('no audio stream — loudness gate skipped');
  }

  const black = checkNotBlack(ffmpeg, video);
  if (black) checks.push(black);
  else warnings.push('luma probe produced no signalstats — black-frame gate skipped');

  if (opts.captionsPath) {
    if (fs.existsSync(opts.captionsPath)) checks.push(...checkCaptions(opts.captionsPath));
    else warnings.push(`captions file not found: ${opts.captionsPath}`);
  }

  // screencast meters (opt-in, GAP-66) — CFR / frame-count / resolution / pixfmt / non-frozen are AUTHORITATIVE
  if (opts.screencast) {
    try {
      const probe = screencastProbe(ffmpeg, ffprobe, video);
      checks.push(...buildScreencastChecks(probe, opts.screencast));
    } catch (e) {
      warnings.push(`screencast probe failed — meters skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { checks, warnings };
}

// ── the council EYES (subprocess; opt-in / opt-out) ─────────────────────────────

function runCouncil(video: string, context: string | undefined, project: string, screencast: boolean): { eyes: CouncilSummary | null; warning?: string } {
  const args = ['--import', 'tsx', path.join(REPO_ROOT, 'capabilities', 'perception', 'gemini-council.ts'), '--in', video, '--project', project];
  if (context) args.push('--context', context);
  if (screencast) args.push('--screencast');
  const r = run(process.execPath, args);
  try {
    const lines = r.stdout.trim().split('\n').filter(Boolean);
    const env = JSON.parse(lines[lines.length - 1] ?? '{}');
    if (!env.success) return { eyes: null, warning: `council failed: ${env.error ?? 'unknown'}` };
    const m = env.metrics;
    return { eyes: { aggregateVerdict: m.aggregateVerdict, totalBlockers: m.totalBlockers, totalMajors: m.totalMajors, specialists: m.specialists } };
  } catch {
    return { eyes: null, warning: 'council produced no parseable envelope (GEMINI key / network?)' };
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  await runCapability<Record<string, unknown>>('orchestrate/verify', async () => {
    const video = requireInputFile(arg('in'), 'video');
    const project = arg('project') ?? '_scratch';
    const targetLufs = parseFloat(arg('target-lufs') ?? '-14');
    const targetTp = parseFloat(arg('target-tp') ?? '-1');
    const captionsPath = arg('captions');
    const context = arg('context');

    // screencast meters: opt-in via --screencast (target defaults 30fps/1920×1080, override w/ --sc-fps/-w/-h)
    const wantScreencast = process.argv.includes('--screencast');
    const screencast: ScreencastTarget | null = wantScreencast
      ? { fps: parseInt(arg('sc-fps') ?? '30', 10), width: parseInt(arg('sc-width') ?? '1920', 10), height: parseInt(arg('sc-height') ?? '1080', 10) }
      : null;

    const { checks, warnings } = technicalGate(video, { targetLufs, targetTp, captionsPath, screencast });

    // eyes: ON by default when the key is present, OFF with --no-eyes (offline) or absent key
    const wantEyes = process.argv.includes('--eyes') || (!process.argv.includes('--no-eyes') && hasEnv('GEMINI_API_KEY'));
    let eyes: CouncilSummary | null = null;
    if (wantEyes) {
      const c = runCouncil(video, context, project, wantScreencast);
      eyes = c.eyes;
      if (c.warning) warnings.push(c.warning);
    } else {
      warnings.push('eyes disabled (no --eyes / no key) — objective gate only');
    }

    const result = decide(checks, eyes);

    const outPrefix = video.replace(/\.[^.]+$/, '') + '.verify';
    fs.writeFileSync(`${outPrefix}.json`, JSON.stringify(result, null, 2));
    console.error(`verdict: ${result.verdict}${result.stage_to_retry ? ` → retry stage "${result.stage_to_retry}"` : ''}\n  ${result.reasons.join('\n  ')}`);

    return {
      outputs: [path.resolve(`${outPrefix}.json`)],
      metrics: { verdict: result.verdict, stage_to_retry: result.stage_to_retry, objectiveChecks: checks.length, objectiveFailures: checks.filter((c) => !c.ok).length, eyes: eyes ? eyes.totalBlockers : null },
      warnings,
      project,
      args: process.argv.slice(2),
    };
  });
}

// Symlink-safe main-guard: macOS tmp/cwd paths can reach the same file via /var → /private/var,
// so a plain path.resolve comparison misses (live-found on Apple-silicon CI at GATE V3).
const realpathSafe = (p: string): string => { try { return fs.realpathSync(path.resolve(p)); } catch { return path.resolve(p); } };
if (process.argv[1] && realpathSafe(process.argv[1]) === realpathSafe(__filename)) void main();
