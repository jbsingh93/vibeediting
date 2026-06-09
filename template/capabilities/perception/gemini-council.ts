#!/usr/bin/env tsx
/**
 * capabilities/perception/gemini-council.ts — the Gemini "council of specialists", JUDGE side (P1E.1, GAP-45).
 *
 * The #1 blindspot is over-trusting a lenient generalist Gemini "looks great". The fix is prompt +
 * agentic engineering: NEVER ask one generalist — run a PANEL of narrowly-scoped, world-class specialist
 * reviewers (many cheap calls), each FORCED to enumerate specific, timestamped, frame-region-cited
 * observations and to GRADE the numbered editing-protocol rules in its lane. A "looks great" with no
 * cited evidence is REJECTED.
 *
 * The roster + every prompt now live in the shared SSOT registry `specialists.ts` (consumed by BOTH
 * this JUDGE council and the PERCEIVE council). Each specialist carries its own thinking_level,
 * media_resolution, and prompt-repetition wrapper. Rule IDs (A1–B5) resolve against
 * `.claude/skills/video-editor/references/editing-protocol.md`.
 *
 * Model = gemini-3.1-flash-lite (models.json; never Gemini 2.5). Uploads the video ONCE and fans the
 * roster out against it. Aggregation: global `ship` ⟺ every specialist's blocker count == 0; any blocker
 * → fix(stage) with that specialist's cited evidence. Objective meters still win where they exist
 * (verify.ts, P2) — the council raises visual trust, never overrides a measurement.
 *
 * CLI:
 *   tsx capabilities/perception/gemini-council.ts --in VIDEO [--context "9:16 Meta Reel, 30s"] [--out PREFIX]
 *       [--plan PLAN.md] [--transcript CAPS.json] [--fps N] [--resolution low|default|high]
 *       [--only sound,cut] [--lang en|da] [--project NAME] [--screencast] [--reel-segments]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { runCapability } from '../_env/contract';
import { askJson, deleteFile, geminiApiKey, uploadAndWait, visualCortexModel } from './gemini-client';
import {
  REEL_SEGMENT_SPECIALIST, SCREENCAST_SPECIALIST, type BuildCtx, type Specialist,
  rosterFor, specialistPromptFor, wantsReelSegmentLens, wantsScreencastLens,
} from './specialists';

// Back-compat re-exports (older imports referenced these from this module).
export { SPECIALISTS } from './specialists';
export type { Specialist } from './specialists';
/** @deprecated use specialistPromptFor(s, 'judge', ctx) from specialists.ts */
export function specialistPrompt(s: Specialist, context: string | undefined, lang: 'da' | 'en' = 'en'): string {
  return specialistPromptFor(s, 'judge', { context, lang });
}

interface SpecialistResult {
  specialist: string;
  title: string;
  verdict: string;
  score?: number;
  blockers: number;
  majors: number;
  findings: { time?: string; region?: string; severity?: string; problem?: string; observation?: string; fix?: string }[];
  error?: string;
}

function countSeverity(findings: SpecialistResult['findings'], sev: string): number {
  return findings.filter((f) => f.severity === sev).length;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Load a transcript file into compact text for the anchor (caption JSON → "[MM:SS] words", else raw). */
function loadTranscript(file: string | undefined): string | undefined {
  if (!file || !fs.existsSync(file)) return undefined;
  const raw = fs.readFileSync(file, 'utf8');
  if (file.toLowerCase().endsWith('.json')) {
    try {
      const data = JSON.parse(raw);
      const caps: { startMs?: number; start?: number; text?: string; word?: string }[] = Array.isArray(data) ? data : (data.words ?? []);
      const bySec = new Map<number, string[]>();
      for (const c of caps) {
        const ms = Number(c.startMs ?? (c.start != null ? c.start * 1000 : 0));
        const t = String(c.text ?? c.word ?? '').trim();
        if (!t) continue;
        const sec = Math.floor(ms / 1000);
        const a = bySec.get(sec) ?? [];
        a.push(t);
        bySec.set(sec, a);
      }
      if (bySec.size) {
        return [...bySec.entries()].sort((a, b) => a[0] - b[0])
          .map(([s, ws]) => `[${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}] ${ws.join(' ')}`)
          .join('\n');
      }
    } catch {
      /* fall through to raw */
    }
  }
  return raw.trim();
}

async function main(): Promise<void> {
  await runCapability('perception/gemini-council', async () => {
    const videoPath = arg('in');
    if (!videoPath || !fs.existsSync(videoPath)) throw new Error(`--in video not found: ${videoPath}`);
    const context = arg('context');
    const lang = (arg('lang') ?? 'en') as 'da' | 'en';
    const project = arg('project') ?? '_scratch';
    const only = arg('only')?.split(',').map((s) => s.trim());
    const plan = arg('plan') && fs.existsSync(arg('plan') as string) ? fs.readFileSync(arg('plan') as string, 'utf8').slice(0, 4000) : undefined;
    const transcript = loadTranscript(arg('transcript'));

    // CLI fps/resolution OVERRIDE the per-specialist defaults only when explicitly passed.
    const fpsOverride = arg('fps') !== undefined ? parseFloat(arg('fps') as string) : undefined;
    const resOverride = arg('resolution') as 'low' | 'default' | 'high' | undefined;

    const roster: Specialist[] = [...rosterFor('judge')];
    if (wantsScreencastLens(process.argv.includes('--screencast'), context)) roster.push(SCREENCAST_SPECIALIST);
    if (wantsReelSegmentLens(process.argv.includes('--reel-segments'), context)) roster.push(REEL_SEGMENT_SPECIALIST);
    const active = only ? roster.filter((s) => only.includes(s.id)) : roster;
    const outPrefix = arg('out') ?? videoPath.replace(/\.[^.]+$/, '') + '.council';

    const ctx: BuildCtx = { context, lang, plan, transcript };
    const ai = new GoogleGenAI({ apiKey: geminiApiKey() });
    const model = visualCortexModel();
    const file = await uploadAndWait(ai, videoPath);

    const results: SpecialistResult[] = [];
    try {
      await Promise.all(
        active.map(async (s) => {
          const samp = s.sampling.judge;
          try {
            const data = (await askJson(ai, model, file, specialistPromptFor(s, 'judge', ctx), {
              fps: fpsOverride ?? samp?.fps ?? 3,
              resolution: resOverride ?? samp?.resolution ?? 'default',
              thinking: samp?.thinking ?? 'medium',
            })) as { verdict?: string; score?: number; findings?: SpecialistResult['findings'] };
            const findings = Array.isArray(data.findings) ? data.findings : [];
            results.push({
              specialist: s.id, title: s.title, verdict: data.verdict ?? '?', score: data.score,
              blockers: countSeverity(findings, 'blocker'), majors: countSeverity(findings, 'major'), findings,
            });
          } catch (e) {
            results.push({ specialist: s.id, title: s.title, verdict: 'error', blockers: 0, majors: 0, findings: [], error: e instanceof Error ? e.message : String(e) });
          }
        }),
      );
    } finally {
      await deleteFile(ai, file.name);
    }

    const totalBlockers = results.reduce((n, r) => n + r.blockers, 0);
    const totalMajors = results.reduce((n, r) => n + r.majors, 0);
    const errored = results.filter((r) => r.error).length;
    const aggregateVerdict = errored ? 'incomplete' : totalBlockers === 0 ? 'ship' : 'fix';

    const report = { video: path.resolve(videoPath), model, context: context ?? null, aggregateVerdict, totalBlockers, totalMajors, specialists: results };
    fs.writeFileSync(`${outPrefix}.json`, JSON.stringify(report, null, 2));

    return {
      outputs: [path.resolve(`${outPrefix}.json`)],
      metrics: {
        aggregateVerdict, totalBlockers, totalMajors,
        specialists: results.map((r) => ({ id: r.specialist, verdict: r.verdict, score: r.score, blockers: r.blockers, majors: r.majors })),
      },
      project,
      args: process.argv.slice(2),
    };
  });
}

// Symlink-safe main-guard: macOS tmp/cwd paths can reach the same file via /var → /private/var,
// so a plain path.resolve comparison misses (live-found on Apple-silicon CI at GATE V3).
const realpathSafe = (p: string): string => { try { return fs.realpathSync(path.resolve(p)); } catch { return path.resolve(p); } };
if (process.argv[1] && realpathSafe(process.argv[1]) === realpathSafe(__filename)) void main();
