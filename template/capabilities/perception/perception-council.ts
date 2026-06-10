#!/usr/bin/env tsx
/**
 * capabilities/perception/perception-council.ts — the Gemini PERCEIVE council = the CONCEPTUALIZE phase.
 *
 * Replaces the single monolithic `describe` call with a fan-out PANEL of world-class single-domain
 * specialists (the shared SSOT registry `specialists.ts`, perceive mode) run on SOURCE footage. Each
 * specialist goes EXTREME-deep on ONE aspect at its own thinking_level/media_resolution, so the
 * conceptualization is far richer than a generalist pass — and the PLAN the user approves is built on
 * it. The `broll-concept` specialist carries the concept-visualization doctrine (the teach-test +
 * shape-of-idea classification) so the plan reaches for EXPLANATORY visuals, not text cards.
 *
 * It uploads the proxy ONCE and fans the perceive roster out, then FUSES the per-specialist maps into:
 *   - <prefix>.perception.json   — every specialist's raw structured output (the machine map)
 *   - <prefix>.conceptualization.md — a synthesized, plan-ready conceptualization (spine · hooks ·
 *     concept-visual beats · b-roll opportunities · cut/cover map · audio emphasis · coverage gaps ·
 *     problems) the editor turns into the storyboard/broll_plan.
 *
 * Conflicts between specialists are KEPT (never averaged) — the planner/human resolves them.
 * Model = gemini-3.1-flash-lite (models.json; never Gemini 2.5). Proxy discipline: feed the 720p/480p
 * proxy, never 4K (Gemini only needs to SEE it).
 *
 * CLI:
 *   tsx capabilities/perception/perception-council.ts --in VIDEO [--transcript CAPS.json]
 *       [--context "9:16 reel, educator, 30s"] [--only broll-concept,story] [--lang en|da]
 *       [--project NAME] [--out PREFIX]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { runCapability } from '../_env/contract';
import { askJson, deleteFile, geminiApiKey, uploadAndWait, visualCortexModel } from './gemini-client';
import { type BuildCtx, type Specialist, rosterFor, specialistPromptFor } from './specialists';

interface PerceiveResult {
  specialist: string;
  title: string;
  data?: Record<string, unknown>;
  error?: string;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

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
      /* fall through */
    }
  }
  return raw.trim();
}

const cell = (v: unknown): string => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
function byId(results: PerceiveResult[], id: string): Record<string, unknown> | undefined {
  return results.find((r) => r.specialist === id && !r.error)?.data;
}
function arr(o: Record<string, unknown> | undefined, key: string): Record<string, unknown>[] {
  const v = o?.[key];
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

/** Fuse the per-specialist maps into a plan-ready conceptualization markdown. */
function renderConceptualization(results: PerceiveResult[], videoPath: string, model: string): { md: string; counts: { conceptBeats: number; hookCandidates: number; opportunities: number; problems: number } } {
  const L: string[] = [];
  L.push(`# Conceptualization — ${path.basename(videoPath)}`);
  L.push('');
  L.push(`> Gemini \`${model}\` PERCEIVE council (${results.filter((r) => !r.error).length} specialists). The plan-ready synthesis of the source. Build the storyboard / broll_plan from this.`);
  L.push('');

  const story = byId(results, 'story');
  if (story) {
    L.push('## Spine & narrative');
    L.push('');
    if (story.summary) L.push(`**Spine:** ${cell(story.summary)}`);
    const beats = arr(story, 'timeline');
    if (beats.length) {
      L.push('');
      L.push('| Time | Beat | Line / note |');
      L.push('|---|---|---|');
      for (const b of beats) L.push(`| ${cell(b.start)}–${cell(b.end)} | ${cell(b.beatType)} | ${cell(b.line || b.note)} |`);
    }
    L.push('');
  }

  // Concept-visual beats (the concept_visualization doctrine) — the heart of a better plan.
  const broll = byId(results, 'broll-concept');
  const conceptRows = arr(broll, 'timeline').filter((r) => r.explanationBeat === true || (r.ideaShape && r.ideaShape !== 'none'));
  if (conceptRows.length) {
    L.push('## Concept-visual beats (teach, don\'t restate)');
    L.push('');
    L.push('| Time | Line | Idea shape | Suggested visual | What it teaches | Concrete subject |');
    L.push('|---|---|---|---|---|---|');
    for (const r of conceptRows) L.push(`| ${cell(r.start)}–${cell(r.end)} | ${cell(r.vo)} | ${cell(r.ideaShape)} | ${cell(r.suggestedPrimitive)} | ${cell(r.teachTest)} | ${cell(r.concreteSubject)} |`);
    L.push('');
  }

  // Hook candidates (the first-3-seconds forensic lens) — the scroll-stop moments the plan opens with.
  const hook = byId(results, 'hook');
  const hookRows = arr(hook, 'hookCandidates');
  if (hook && (hookRows.length || hook.firstFrameRead)) {
    L.push('## Hook candidates (scroll-stop moments — open with one of these)');
    L.push('');
    if (hook.firstFrameRead) L.push(`**The actual open today:** frame 1 = ${cell(hook.firstFrameRead)}${hook.firstWords ? ` · first words: “${cell(hook.firstWords)}”` : ''}${hook.firstMotionAt ? ` · first motion at ${cell(hook.firstMotionAt)}` : ''}`);
    if (hookRows.length) {
      L.push('');
      L.push('| Time | Device | Line | Visual | Muted carry (text) | Strength | Why |');
      L.push('|---|---|---|---|---|---|---|');
      for (const r of [...hookRows].sort((a, b) => Number(b.strength ?? 0) - Number(a.strength ?? 0))) {
        L.push(`| ${cell(r.start)}–${cell(r.end)} | ${cell(r.device)} | ${cell(r.line)} | ${cell(r.visual)} | ${cell(r.mutedCarry)} | ${cell(r.strength)}/10 | ${cell(r.why)} |`);
      }
    }
    L.push('');
  }

  // Intercut-safety map (the continuity lens) — which windows can cut together cleanly.
  const continuity = byId(results, 'continuity');
  const stateRows = arr(continuity, 'timeline').filter((r) => r.hazard || r.intercutSafeWith);
  if (stateRows.length) {
    L.push('## Intercut map (continuity — what cuts together cleanly)');
    L.push('');
    for (const r of stateRows) L.push(`- **${cell(r.start)}–${cell(r.end)}** ${r.intercutSafeWith ? `intercuts with ${cell(r.intercutSafeWith)}` : ''}${r.hazard ? ` ⚠ ${cell(r.hazard)}` : ''}`);
    L.push('');
  }

  // Cross-specialist opportunities, time-sorted.
  const opps: { time: string; from: string; what: string; value: string }[] = [];
  for (const r of results) {
    for (const o of arr(r.data, 'opportunities')) {
      opps.push({ time: String(o.time ?? o.start ?? ''), from: r.specialist, what: String(o.what ?? ''), value: String(o.value ?? '') });
    }
  }
  opps.sort((a, b) => a.time.localeCompare(b.time));
  if (opps.length) {
    L.push('## Opportunities (cross-lane, time-sorted)');
    L.push('');
    for (const o of opps) L.push(`- **${cell(o.time)}** _(${cell(o.from)}${o.value ? `, ${cell(o.value)}` : ''})_ — ${cell(o.what)}`);
    L.push('');
  }

  // Cut/cover map.
  const cut = byId(results, 'cut');
  const coverRows = arr(cut, 'timeline').filter((r) => r.coverNeeded === true || r.midSpeechRisk === true);
  if (coverRows.length) {
    L.push('## Cut / cover map (where the plan must cover or hold)');
    L.push('');
    for (const r of coverRows) L.push(`- **${cell(r.start)}** — ${r.coverNeeded ? 'cover this cut' : ''}${r.midSpeechRisk ? ' ⚠ mid-speech risk' : ''} ${cell(r.continuityNote)}`);
    L.push('');
  }

  // Audio emphasis words (gift to captions + zoom).
  const sound = byId(results, 'sound');
  const emphasis = new Set<string>();
  for (const r of arr(sound, 'timeline')) for (const w of Array.isArray(r.emphasisWords) ? (r.emphasisWords as string[]) : []) emphasis.add(String(w));
  if (emphasis.size) {
    L.push(`## Emphasis words (captions + zoom-punch candidates)`);
    L.push('');
    L.push([...emphasis].map((w) => `\`${cell(w)}\``).join(' · '));
    L.push('');
  }

  // Problems across all lanes (raw-footage limitations).
  const problems: { time: string; from: string; sev: string; problem: string; fix: string }[] = [];
  for (const r of results) {
    for (const p of arr(r.data, 'problems')) {
      problems.push({ time: String(p.time ?? ''), from: r.specialist, sev: String(p.severity ?? ''), problem: String(p.problem ?? ''), fix: String(p.fix ?? '') });
    }
  }
  if (problems.length) {
    L.push('## Raw-footage problems (avoid / fix these windows)');
    L.push('');
    L.push('| Time | Lane | Sev | Problem | Fix |');
    L.push('|---|---|---|---|---|');
    for (const p of problems) L.push(`| ${cell(p.time)} | ${cell(p.from)} | ${cell(p.sev)} | ${cell(p.problem)} | ${cell(p.fix)} |`);
    L.push('');
  }

  return { md: L.join('\n'), counts: { conceptBeats: conceptRows.length, hookCandidates: hookRows.length, opportunities: opps.length, problems: problems.length } };
}

async function main(): Promise<void> {
  await runCapability('perception/perception-council', async () => {
    const videoPath = arg('in');
    if (!videoPath || !fs.existsSync(videoPath)) throw new Error(`--in video not found: ${videoPath}`);
    const context = arg('context');
    const lang = (arg('lang') ?? 'en') as 'da' | 'en';
    const project = arg('project') ?? '_scratch';
    const only = arg('only')?.split(',').map((s) => s.trim());
    const transcript = loadTranscript(arg('transcript'));
    const outPrefix = arg('out') ?? videoPath.replace(/\.[^.]+$/, '') + '.perceive';

    const roster: Specialist[] = rosterFor('perceive');
    const active = only ? roster.filter((s) => only.includes(s.id)) : roster;
    const ctx: BuildCtx = { context, lang, transcript };

    const ai = new GoogleGenAI({ apiKey: geminiApiKey() });
    const model = visualCortexModel();
    const file = await uploadAndWait(ai, videoPath);

    const results: PerceiveResult[] = [];
    try {
      await Promise.all(
        active.map(async (s) => {
          const samp = s.sampling.perceive;
          try {
            const data = (await askJson(ai, model, file, specialistPromptFor(s, 'perceive', ctx), {
              fps: samp?.fps ?? 2,
              resolution: samp?.resolution ?? 'default',
              thinking: samp?.thinking ?? 'medium',
            })) as Record<string, unknown>;
            results.push({ specialist: s.id, title: s.title, data });
          } catch (e) {
            results.push({ specialist: s.id, title: s.title, error: e instanceof Error ? e.message : String(e) });
          }
        }),
      );
    } finally {
      await deleteFile(ai, file.name);
    }

    const jsonPath = `${outPrefix}.perception.json`;
    fs.writeFileSync(jsonPath, JSON.stringify({ video: path.resolve(videoPath), model, specialists: results }, null, 2));

    const { md, counts } = renderConceptualization(results, videoPath, model);
    const mdPath = `${outPrefix}.conceptualization.md`;
    fs.writeFileSync(mdPath, md);

    const errored = results.filter((r) => r.error).map((r) => `${r.specialist}: ${r.error}`);
    return {
      outputs: [path.resolve(jsonPath), path.resolve(mdPath)],
      metrics: { specialists: results.map((r) => ({ id: r.specialist, ok: !r.error })), ...counts },
      warnings: errored.length ? errored : undefined,
      project,
      args: process.argv.slice(2),
    };
  });
}

const realpathSafe = (p: string): string => { try { return fs.realpathSync(path.resolve(p)); } catch { return path.resolve(p); } };
if (process.argv[1] && realpathSafe(process.argv[1]) === realpathSafe(__filename)) void main();
