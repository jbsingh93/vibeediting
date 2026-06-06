#!/usr/bin/env tsx
/**
 * capabilities/perception/gemini-council.ts — the Gemini "council of specialists" (plan P1E.1, GAP-45).
 *
 * The #1 blindspot is over-trusting a lenient generalist Gemini "looks great". The fix is prompt +
 * agentic engineering: NEVER ask one generalist — run a PANEL of narrowly-scoped, world-class specialist
 * reviewers (many cheap calls), each FORCED to enumerate specific, timestamped,
 * frame-region-cited observations. A "looks great" with no cited evidence is REJECTED.
 *
 * Decomposing one vague question into many precise expert questions is how a generic model is made
 * nuanced. This is the EYES side of the split verifier (P2.4): it hardens the technical gate and narrows
 * the taste gate. Objective meters still win where they exist (verify.ts, P2) — the council raises visual
 * trust, never overrides a measurement.
 *
 * Model = gemini-3.1-flash-lite (GAP-38, from models.json — many cheap calls, NOT a model swap).
 * Uploads the video ONCE (gemini-client) and fans the roster out against it.
 * Specialist prompt SEEDS are derived from master-gpt-prompter's filmmaking-domain doc (GAP-47);
 * regenerate them there to evolve the council. The `brand` specialist reads brand/brand.json
 * so its lens reflects YOUR brand (colors, tone, sell style), not a hardcoded one (D12).
 *
 * Aggregation: global `ship` ⟺ every specialist's blocker count == 0. Any blocker → fix(stage) with
 * that specialist's cited evidence.
 *
 * CLI:
 *   tsx capabilities/perception/gemini-council.ts --in VIDEO [--context "9:16 Meta Reel, 30s"] [--out PREFIX]
 *       [--fps 3] [--resolution high] [--only detail,transition] [--lang en|da] [--project NAME]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { REPO_ROOT, runCapability } from '../_env/contract';
import { askJson, deleteFile, geminiApiKey, uploadAndWait, visualCortexModel } from './gemini-client';

export interface Specialist {
  id: string;
  title: string;
  lens: string; // what this specialist is uniquely responsible for catching
}

/** Brand config (brand/brand.json) — the config boundary the brand specialist reads (D12). */
export interface BrandConfig {
  name?: string;
  colors?: Record<string, string>;
  tone?: { register?: string; sellStyle?: string; language?: string };
  brandWords?: string[];
  logoPath?: string;
}

export function readBrandConfig(): BrandConfig | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'brand', 'brand.json'), 'utf8')) as BrandConfig;
  } catch {
    return null;
  }
}

/** Build the brand specialist's lens from brand.json (generic fallback when absent). */
export function brandLens(brand: BrandConfig | null): string {
  const safeZone =
    'captions/CTA kept OUT of the bottom 480px on 9:16, logo usage, CTA presence/timing.';
  if (!brand) {
    return `brand consistency (no brand/brand.json configured — judge general professional polish and tonal consistency), ${safeZone}`;
  }
  const bits: string[] = [];
  if (brand.name) bits.push(`the brand is "${brand.name}"`);
  if (brand.colors && Object.keys(brand.colors).length) {
    bits.push(`brand colors: ${Object.entries(brand.colors).map(([k, v]) => `${k}=${v}`).join(', ')} (flag off-palette graphics)`);
  }
  if (brand.tone?.register) bits.push(`copy register: ${brand.tone.register}`);
  if (brand.tone?.sellStyle) bits.push(`sell style: ${brand.tone.sellStyle} (flag copy that sells harder than this)`);
  if (brand.logoPath) bits.push('logo usage matches the brand asset');
  return `${bits.join('; ')}${bits.length ? '; ' : ''}${safeZone}`;
}

/** The roster (GAP-45). Extensible: add one per recurring failure mode found in the BIT loop. */
export const SPECIALISTS: Specialist[] = [
  { id: 'detail', title: 'Detail / artifact spotter', lens: 'AI warping, extra fingers, melted/duplicated edges, text/logo errors, matte fringing/halos, flicker, banding, compression artifacts, on-screen typos. SCAN FRAME TILES (quadrants), not just the center.' },
  { id: 'transition', title: 'Transition analyst', lens: 'cut rhythm/ASL, jump-cut quality, J/L cuts, continuity, the 180° rule, whoosh/SFX alignment to cuts, jarring-vs-intentional transitions.' },
  { id: 'story', title: 'Story → B-roll → consistency expert', lens: 'does each B-roll/overlay match the VO meaning at that exact moment; narrative coherence; does the visual SUPPORT or FIGHT the script; setups that pay off only after a cut.' },
  { id: 'brand', title: 'Brand & safe-zone compliance', lens: brandLens(readBrandConfig()) },
  { id: 'composition', title: 'Composition & visual hierarchy', lens: 'framing in the target aspect, focal clarity, text legibility/contrast, crop safety, balance.' },
  { id: 'avsync', title: 'A/V sync & pacing', lens: 'word/lip sync vs the spoken track, music ducked under VO, dead air, the energy/retention curve, weak first-3-seconds hook.' },
  { id: 'color', title: 'Color & exposure consistency', lens: 'grade continuity across cuts, skin tones, exposure/WB match between shots and any composited/generated element.' },
];

/**
 * The screencast sub-lens (GAP-66) — added to the roster ONLY for screen-recording deliverables (the
 * `--screencast` flag, or a context mentioning screencast/demo/tutorial/skærmoptagelse). A meter
 * (CFR / frame-count from verify.ts) ALWAYS overrides a lenient "looks smooth" here (the governing rule).
 */
export const SCREENCAST_SPECIALIST: Specialist = {
  id: 'screencast',
  title: 'Screencast capture-quality reviewer',
  lens: 'is the CURSOR visible and GLIDING (never teleporting/missing)?; is motion SMOOTH (no dropped-frame stutter or choppy frame-dup)?; is on-screen TEXT legible at the target resolution (no blur/smear — the VP8-WebM tell)?; is there NO off-brand chrome (wrong-account avatar, browser bookmarks bar, dev console, notification toast) or LEAKED SECRET (token, password, email) in frame?; does the recorded flow MATCH the intended narrative beat at each timestamp?',
};

/** Should the screencast sub-lens be included? (pure → testable) */
export function wantsScreencastLens(flagPresent: boolean, context: string | undefined): boolean {
  if (flagPresent) return true;
  return /screencast|screen.?record|skærmoptag|\bdemo\b|tutorial/i.test(context ?? '');
}

/**
 * The reel-segment-selection sub-lens (GAP-69) — added ONLY for a "find the best sequences → export to
 * Premiere" brief (the `--reel-segments` flag, or a context mentioning reels/best clips/bedste sekvenser).
 * It nominates reel-worthy windows on the OpusClip-style rubric (hook · flow · value · trend), starting on
 * a hook line and ending on a payoff. Like every specialist it must cite MM:SS evidence; an objective
 * meter (RMS / scene-cut density) ALWAYS overrides a lenient "this will go viral" (the governing rule).
 * Full recipe: the video-editor skill's best-segments-selection reference.
 */
export const REEL_SEGMENT_SPECIALIST: Specialist = {
  id: 'reel-segment',
  title: 'Reel-segment selection scout',
  lens: 'nominate the strongest self-contained windows for a short-form reel against the stated audience + platform. Each candidate MUST start on a HOOK (question / bold claim / pattern-interrupt in the first ≤3s) and end on a PAYOFF (a landed takeaway, not mid-thought); snap boundaries to spoken-word edges, never mid-word. Score each on hook / flow (setup→payoff completeness) / value / trend-relevance-to-the-audience, and respect the platform length window. Do NOT mistake loudness or fast talking for virality — cite the actual hook line and payoff line.',
};

/** Should the reel-segment sub-lens be included? (pure → testable) */
export function wantsReelSegmentLens(flagPresent: boolean, context: string | undefined): boolean {
  if (flagPresent) return true;
  return /\breels?\b|best (clips|sequences|segments)|bedste sekvenser|short.?form|find de \d+ bedste/i.test(context ?? '');
}

/** Build one specialist's forced-evidence prompt (pure → unit-testable offline). */
export function specialistPrompt(s: Specialist, context: string | undefined, lang: 'da' | 'en' = 'en'): string {
  const langName = lang === 'da' ? 'Danish' : 'English';
  const ctx = context
    ? `Production brief / intent (judge against this):\n"""${context}"""`
    : 'No brief supplied — assume a polished social/marketing video and judge against professional standards.';
  return `You are a WORLD-CLASS ${s.title} doing a narrow, expert review pass on a rendered video. You are ONE specialist on a panel; stay strictly in your lane:

YOUR LANE: ${s.lens}

${ctx}

RULES (non-negotiable):
1. You MUST enumerate specific, timestamped, frame-region-cited observations. A bare "looks great" / "no issues" with NO cited evidence is an INVALID answer.
2. Scan the WHOLE frame — explicitly check the four quadrants (top-left, top-right, bottom-left, bottom-right) and center, not just the obvious subject.
3. Be honest and specific. Cite MM:SS.s timestamps (one-decimal precision) and the frame region for every observation.
4. Classify each finding's severity: blocker (must fix before ship) | major | minor | nit.
5. Only flag things inside YOUR LANE — another specialist covers the rest.

Write prose in ${langName}. Return ONLY this JSON (no markdown):
{
  "specialist": "${s.id}",
  "verdict": "ship | fix-first | rework",
  "checkedQuadrants": true,
  "findings": [
    { "time": "MM:SS.s", "region": "top-left|top-right|bottom-left|bottom-right|center|full", "severity": "blocker|major|minor|nit", "problem": "what is wrong, specifically", "evidence": "what you literally see that proves it", "fix": "concrete, actionable" }
  ],
  "positives": ["specific things genuinely done well, with timestamps"]
}`;
}

interface SpecialistResult {
  specialist: string;
  title: string;
  verdict: string;
  blockers: number;
  majors: number;
  findings: { time?: string; region?: string; severity?: string; problem?: string; fix?: string }[];
  error?: string;
}

function countSeverity(findings: SpecialistResult['findings'], sev: string): number {
  return findings.filter((f) => f.severity === sev).length;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  await runCapability('perception/gemini-council', async () => {
    const videoPath = arg('in');
    if (!videoPath || !fs.existsSync(videoPath)) throw new Error(`--in video not found: ${videoPath}`);
    const context = arg('context');
    const fps = parseFloat(arg('fps') ?? '3');
    const resolution = (arg('resolution') ?? 'default') as 'low' | 'default' | 'high';
    const lang = (arg('lang') ?? 'en') as 'da' | 'en';
    const project = arg('project') ?? '_scratch';
    const only = arg('only')?.split(',').map((s) => s.trim());
    const fullRoster = [...SPECIALISTS];
    if (wantsScreencastLens(process.argv.includes('--screencast'), context)) fullRoster.push(SCREENCAST_SPECIALIST);
    if (wantsReelSegmentLens(process.argv.includes('--reel-segments'), context)) fullRoster.push(REEL_SEGMENT_SPECIALIST);
    const roster = only ? fullRoster.filter((s) => only.includes(s.id)) : fullRoster;
    const outPrefix = arg('out') ?? videoPath.replace(/\.[^.]+$/, '') + '.council';

    const ai = new GoogleGenAI({ apiKey: geminiApiKey() });
    const model = visualCortexModel();
    const file = await uploadAndWait(ai, videoPath);

    const results: SpecialistResult[] = [];
    try {
      await Promise.all(
        roster.map(async (s) => {
          try {
            const data = (await askJson(ai, model, file, specialistPrompt(s, context, lang), { fps, resolution })) as {
              verdict?: string;
              findings?: SpecialistResult['findings'];
            };
            const findings = Array.isArray(data.findings) ? data.findings : [];
            results.push({
              specialist: s.id, title: s.title, verdict: data.verdict ?? '?',
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
      metrics: { aggregateVerdict, totalBlockers, totalMajors, specialists: results.map((r) => ({ id: r.specialist, verdict: r.verdict, blockers: r.blockers, majors: r.majors })) },
      project,
      args: process.argv.slice(2),
    };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) void main();
