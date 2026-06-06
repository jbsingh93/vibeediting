#!/usr/bin/env tsx
/**
 * capabilities/screen-record/verify-screencast.ts — the screencast TECHNICAL assertions (plan P1G.7, GAP-66).
 *
 * Amends the split verifier's objective gate (orchestrate/verify.ts) with screencast-specific meters. These
 * are AUTHORITATIVE (a meter always beats a lenient "looks smooth"). All PURE → unit-tested offline against
 * a synthetic probe; verify.ts feeds the real ffprobe output in.
 *
 * Asserts (GAP-66):
 *   - CFR: avg_frame_rate == r_frame_rate == target/1 (no VFR — the #1 amateur-tell of the rejected WebM path)
 *   - frame count: nb_read_packets == round(durationSec × fps) ± 1 (GAP-22 style)
 *   - resolution == the target (1920×1080 or chosen aspect)
 *   - pixel format == yuv420p
 *   - non-frozen: more than 1 distinct frame (a failed CDP ACK loop yields a single repeated frame)
 */
import type { ObjectiveCheck, Severity } from '../orchestrate/verify';

/** The shape verify.ts extracts from ffprobe + a cheap motion probe and hands us. */
export interface ScreencastProbe {
  width: number;
  height: number;
  avgFrameRate: string; // e.g. "30/1"
  rFrameRate: string; // e.g. "30/1"
  nbReadPackets: number;
  durationSec: number;
  pixFmt: string; // e.g. "yuv420p"
  distinctFrameSignals?: number; // optional: # of distinct luma signatures sampled (non-frozen proxy)
}

export interface ScreencastTarget {
  fps: number; // default 30
  width: number; // default 1920
  height: number; // default 1080
}

export const DEFAULT_SCREENCAST_TARGET: ScreencastTarget = { fps: 30, width: 1920, height: 1080 };

function rateToNumber(r: string): number {
  const [n, d] = (r ?? '0/1').split('/').map(Number);
  return d ? n / d : n;
}

const STAGE = 'screen-record' as const;
const mk = (id: string, ok: boolean, severity: Severity, message: string, value?: number | string, expected?: number | string): ObjectiveCheck =>
  ({ id, ok, severity, stage: STAGE, message, value, expected });

/** Build the screencast objective checks (PURE). */
export function buildScreencastChecks(probe: ScreencastProbe, target: ScreencastTarget = DEFAULT_SCREENCAST_TARGET): ObjectiveCheck[] {
  const checks: ObjectiveCheck[] = [];

  // 1) CFR — avg == r == target, no VFR
  const avg = rateToNumber(probe.avgFrameRate);
  const r = rateToNumber(probe.rFrameRate);
  const cfrOk = Math.abs(avg - r) < 0.01 && Math.abs(avg - target.fps) < 0.01;
  checks.push(mk('screencast-cfr', cfrOk, 'blocker',
    cfrOk ? `constant ${target.fps} fps (avg==r==${probe.avgFrameRate})` : `not CFR ${target.fps}: avg=${probe.avgFrameRate} r=${probe.rFrameRate} — VFR/wrong-rate render`,
    `${probe.avgFrameRate}/${probe.rFrameRate}`, `${target.fps}/1`));

  // 2) frame count ≈ round(duration × fps) ± 1
  const expected = Math.round(probe.durationSec * target.fps);
  const fcOk = probe.nbReadPackets > 0 && Math.abs(probe.nbReadPackets - expected) <= 1;
  checks.push(mk('screencast-frame-count', fcOk, 'blocker',
    fcOk ? `frame count ${probe.nbReadPackets} ≈ round(${probe.durationSec.toFixed(2)}×${target.fps})=${expected}` : `frame count ${probe.nbReadPackets} ≠ expected ${expected} (dropped frames / truncated)`,
    probe.nbReadPackets, expected));

  // 3) resolution == target
  const resOk = probe.width === target.width && probe.height === target.height;
  checks.push(mk('screencast-resolution', resOk, 'major',
    resOk ? `resolution ${probe.width}×${probe.height} matches target` : `resolution ${probe.width}×${probe.height} ≠ target ${target.width}×${target.height}`,
    `${probe.width}×${probe.height}`, `${target.width}×${target.height}`));

  // 4) pixel format yuv420p (broad-compat delivery)
  const pfOk = probe.pixFmt === 'yuv420p';
  checks.push(mk('screencast-pixfmt', pfOk, 'major',
    pfOk ? 'pixel format yuv420p' : `pixel format ${probe.pixFmt} ≠ yuv420p`, probe.pixFmt, 'yuv420p'));

  // 5) non-frozen (a failed ACK loop yields one repeated frame). Only assert when we sampled.
  if (probe.distinctFrameSignals != null) {
    const liveOk = probe.distinctFrameSignals > 1;
    checks.push(mk('screencast-not-frozen', liveOk, 'blocker',
      liveOk ? `${probe.distinctFrameSignals} distinct frame signatures — real motion` : 'single repeated frame — capture froze (ACK loop / start failure)',
      probe.distinctFrameSignals, '> 1'));
  }

  return checks;
}
