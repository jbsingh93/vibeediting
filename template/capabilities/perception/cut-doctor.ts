#!/usr/bin/env tsx
/**
 * cut-doctor — world-class, frame-accurate cut analysis by FUSING three signals.
 *
 * Gemini alone judges continuity from its own (imperfect) audio read, so it rationalizes
 * mid-sentence cuts as "clean." cut-doctor fixes that by grounding the analysis in truth:
 *
 *   1. WHISPER (your preferred engine) → exact words + millisecond timestamps + sentence
 *      boundaries. The ground-truth ears.
 *   2. ffmpeg scene detection → frame-accurate cut points (not Gemini's ±0.5s guess).
 *   3. DETERMINISTIC classification → for each cut, is it mid-word / mid-sentence /
 *      dangling-clause / clean? Computed from Whisper timing, no AI guessing.
 *   4. GEMINI, grounded with the real transcript → visual before/after at each cut, and
 *      whether an objectively-mid-sentence cut is genuinely jarring or an intentional
 *      J-cut / B-roll-over-VO. Plus a surgical fix (where the cut SHOULD land).
 *
 * Output: <prefix>.cuts.json + <prefix>.cuts.md
 *
 * Usage:
 *   tsx capabilities/perception/cut-doctor.ts <video> [options]
 *
 * Options:
 *   --transcript <captions.json>  Reuse an existing Whisper Caption[] instead of
 *                                 re-transcribing (e.g. out/02-analyze/take.captions.json).
 *   --out <prefix>                Default: <video-without-ext>
 *   --scene-threshold <0..1>      ffmpeg scene-cut sensitivity. Default: 0.4 (lower = more cuts).
 *   --project-fps <n>             Timeline fps for the frame number in fixes. Default: 30.
 *   --gap-ms <n>                  Silence (ms) around a cut that counts as a clean break. Default: 350.
 *   --lang <en|da|...>            Whisper language hint + report language. Default: en.
 *   --model <id>                  Gemini model. Default: gemini-3.1-flash-lite.
 *   --gemini-fps <n>              Gemini frame sampling. Default: 2.
 *   --no-gemini                   Deterministic only (Whisper+ffmpeg), skip the Gemini layer.
 *   --keep                        Keep the uploaded file on Google's servers.
 *
 * Example:
 *   tsx capabilities/perception/cut-doctor.ts "test-video/myproject/raw-16x9.mp4" --out out/cuts/myproject
 *
 * Requires: OPENAI_API_KEY (Whisper) + GEMINI_API_KEY. ffmpeg comes from the shared
 * resolver (VIBE_FFMPEG → .vibe/bin → PATH); without a full build it falls back to
 * Remotion's bundled binary (audio extraction only — that build is stripped/filter-less,
 * so cut DISCOVERY is then done by Gemini (±0.5s) while the verdict + exact fix point
 * stay deterministic from the Whisper transcript). With a full ffmpeg you get
 * frame-accurate ffmpeg scene cuts.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import OpenAI from 'openai';
import { GoogleGenAI, FileState } from '@google/genai';
import { resolveFfmpeg as resolveSharedFfmpeg } from '../_env/ffmpeg';

// ───────────────────────────── .env loader ───────────────────────────────────
function loadDotEnv(): void {
  for (const file of [path.join(process.cwd(), '.env'), path.join(process.cwd(), '..', '.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
  }
}

// ───────────────────────────── args ──────────────────────────────────────────
interface Args {
  videoPath: string;
  transcript?: string;
  outPrefix: string;
  sceneThreshold: number;
  projectFps: number;
  gapMs: number;
  lang: 'da' | 'en';
  model: string;
  geminiFps: number;
  noGemini: boolean;
  keep: boolean;
}

function parseArgs(argv: string[]): Args {
  const pos: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else {
        flags[key] = next;
        i++;
      }
    } else pos.push(a);
  }
  const videoPath = pos[0];
  if (!videoPath) {
    console.error('Usage: tsx capabilities/perception/cut-doctor.ts <video> [--transcript captions.json] [options]');
    process.exit(1);
  }
  return {
    videoPath,
    transcript: flags.transcript as string | undefined,
    outPrefix: (flags.out as string) ?? videoPath.replace(/\.[^.]+$/, ''),
    sceneThreshold: flags['scene-threshold'] ? Number(flags['scene-threshold']) : 0.4,
    projectFps: flags['project-fps'] ? Number(flags['project-fps']) : 30,
    gapMs: flags['gap-ms'] ? Number(flags['gap-ms']) : 350,
    lang: (flags.lang as Args['lang']) ?? 'en',
    model: (flags.model as string) ?? process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite',
    geminiFps: flags['gemini-fps'] ? Number(flags['gemini-fps']) : 2,
    noGemini: flags['no-gemini'] === true,
    keep: flags.keep === true,
  };
}

// ───────────────────────────── types ─────────────────────────────────────────
interface Word {
  text: string; // includes any attached punctuation, e.g. "det,"
  startMs: number;
  endMs: number;
}
interface Sentence {
  text: string;
  startMs: number;
  endMs: number;
}
type CutClass = 'mid-word' | 'mid-sentence' | 'dangling-clause' | 'boundary' | 'clean';
interface Cut {
  timeMs: number;
  classification: CutClass;
  flagged: boolean;
  before: string; // words just before the cut
  after: string; // words just after
  gapMs: number; // silence around the cut
  reason: string;
  // recommendation (deterministic)
  suggestMs?: number;
  suggestFrame?: number;
  suggestNote?: string;
  // Gemini layer (optional)
  visualBefore?: string;
  visualAfter?: string;
  verdict?: string; // jarring | intentional | acceptable
  editorFix?: string;
}

/** Resolve an ffmpeg binary: the shared resolver (VIBE_FFMPEG → .vibe/bin → PATH) →
 *  Remotion's bundled compositor binary (audio-extraction-only fallback) → bare PATH. */
function resolveFfmpegBin(): string {
  try {
    const r = resolveSharedFfmpeg();
    if (r.ffmpeg !== 'ffmpeg' && fs.existsSync(r.ffmpeg)) return r.ffmpeg;
  } catch {
    /* no full build — fall through to the stripped Remotion binary */
  }
  const remotionDir = path.join(process.cwd(), 'node_modules', '@remotion');
  try {
    for (const d of fs.readdirSync(remotionDir)) {
      if (!d.startsWith('compositor-')) continue;
      for (const bin of ['ffmpeg.exe', 'ffmpeg']) {
        const p = path.join(remotionDir, d, bin);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch {
    /* fall through */
  }
  return 'ffmpeg'; // hope it's on PATH
}
const FFMPEG = resolveFfmpegBin();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmt = (ms: number) => {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const rem = (s - m * 60).toFixed(1).padStart(4, '0');
  return `${String(m).padStart(2, '0')}:${rem}`;
};
/** Parse "MM:SS.s" / "SS.s" / a number into ms. */
function parseTimeToMs(s: unknown): number | null {
  const str = String(s).trim();
  const colon = str.match(/(\d+):(\d+(?:\.\d+)?)/);
  if (colon) return Math.round((parseInt(colon[1], 10) * 60 + parseFloat(colon[2])) * 1000);
  const f = parseFloat(str);
  return Number.isNaN(f) ? null : Math.round(f * 1000);
}

// Function/clause words whose presence right before a cut signals an unfinished thought.
const FUNCTION_WORDS = new Set([
  // Danish
  'og', 'eller', 'men', 'at', 'som', 'der', 'hvor', 'fordi', 'hvis', 'når', 'mens', 'så',
  'for', 'til', 'af', 'med', 'om', 'ved', 'fra', 'under', 'over', 'i', 'på', 'en', 'et',
  // English
  'and', 'or', 'but', 'that', 'which', 'who', 'where', 'because', 'if', 'when', 'while',
  'so', 'to', 'of', 'with', 'the', 'a', 'an', 'on', 'at', 'for',
]);
const bareWord = (t: string) => t.trim().toLowerCase().replace(/[.,!?;:"'»«—-]+$/g, '').replace(/^[.,!?;:"'»«—-]+/g, '');

// ───────────────────────────── 1. Whisper ground truth ───────────────────────
async function getTranscript(args: Args): Promise<{ words: Word[]; sentences: Sentence[]; fullText: string }> {
  if (args.transcript) {
    if (!fs.existsSync(args.transcript)) throw new Error(`Transcript not found: ${args.transcript}`);
    const raw = JSON.parse(fs.readFileSync(args.transcript, 'utf8'));
    // Accept Remotion Caption[] (text/startMs/endMs) or our own {words:[...]}
    const caps: any[] = Array.isArray(raw) ? raw : raw.words ?? [];
    const words: Word[] = caps.map((c) => ({
      text: String(c.text ?? c.word ?? '').trim(),
      startMs: Number(c.startMs ?? c.start * 1000),
      endMs: Number(c.endMs ?? c.end * 1000),
    }));
    return { words, ...buildSentences(words) };
  }

  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required to transcribe (or pass --transcript).');
  // Extract 16k mono wav for Whisper
  const wav = path.join(os.tmpdir(), `cutdoctor-${Date.now()}.wav`);
  console.log('🎙  Extracting audio for Whisper…');
  const ff = spawnSync(FFMPEG, ['-y', '-i', args.videoPath, '-vn', '-ar', '16000', '-ac', '1', '-sample_fmt', 's16', wav], {
    encoding: 'utf8',
  });
  if (ff.status !== 0) throw new Error(`ffmpeg audio extraction failed:\n${ff.stderr ?? ''}`);

  console.log('🎙  Transcribing with OpenAI Whisper (word + segment timestamps)…');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const tr: any = await openai.audio.transcriptions.create({
    file: fs.createReadStream(wav),
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['word', 'segment'],
    ...(args.lang ? { language: args.lang } : {}),
  });
  fs.rmSync(wav, { force: true });

  const words: Word[] = (tr.words ?? []).map((w: any) => ({
    text: String(w.word).trim(),
    startMs: Math.round(w.start * 1000),
    endMs: Math.round(w.end * 1000),
  }));
  // Prefer Whisper's own segments for sentence boundaries; fall back to punctuation.
  let sentences: Sentence[];
  if (Array.isArray(tr.segments) && tr.segments.length) {
    sentences = tr.segments.map((s: any) => ({
      text: String(s.text).trim(),
      startMs: Math.round(s.start * 1000),
      endMs: Math.round(s.end * 1000),
    }));
  } else {
    sentences = buildSentences(words).sentences;
  }
  return { words, sentences, fullText: String(tr.text ?? '').trim() };
}

/** Derive sentences from word tokens by sentence-ending punctuation. */
function buildSentences(words: Word[]): { sentences: Sentence[]; fullText: string } {
  const sentences: Sentence[] = [];
  let cur: Word[] = [];
  for (const w of words) {
    cur.push(w);
    if (/[.!?]["'»]?$/.test(w.text)) {
      sentences.push({ text: cur.map((x) => x.text).join(' '), startMs: cur[0].startMs, endMs: w.endMs });
      cur = [];
    }
  }
  if (cur.length) sentences.push({ text: cur.map((x) => x.text).join(' '), startMs: cur[0].startMs, endMs: cur[cur.length - 1].endMs });
  return { sentences, fullText: words.map((w) => w.text).join(' ') };
}

// ───────────────────────────── 2. cut detection ──────────────────────────────
/** Does the resolved ffmpeg have analysis filters? Remotion's bundled build is
 *  stripped (no filtergraph), so we fall back to Gemini for cut discovery. */
function ffmpegSupportsFilters(): boolean {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-filters'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return /(^|\s)showinfo(\s|$)/.test(`${r.stdout ?? ''}${r.stderr ?? ''}`);
}

/** Frame-accurate scene cuts — only when a full (filter-capable) ffmpeg is present. */
function detectCutsFfmpeg(args: Args): number[] {
  console.log(`✂  Detecting cuts with ffmpeg (scene threshold ${args.sceneThreshold})…`);
  const res = spawnSync(
    FFMPEG,
    ['-i', args.videoPath, '-filter:v', `select='gt(scene,${args.sceneThreshold})',showinfo`, '-an', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const out = `${res.stderr ?? ''}`;
  const times = new Set<number>();
  const re = /pts_time:([0-9]+\.?[0-9]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(out)) !== null) {
    const t = Math.round(parseFloat(m[1]) * 1000);
    if (t > 250) times.add(t); // ignore frame 0 / very start
  }
  return [...times].sort((a, b) => a - b);
}

// ───────────────────────────── 3. classify cuts ──────────────────────────────
function classifyCut(timeMs: number, words: Word[], sentences: Sentence[], args: Args): Cut {
  const pad = 150; // ms tolerance around a boundary to count as "on the boundary"
  const ctx = (arr: Word[]) => arr.map((w) => w.text).join(' ');
  const beforeWords = words.filter((w) => w.endMs <= timeMs + pad).slice(-6);
  const afterWords = words.filter((w) => w.startMs >= timeMs - pad).slice(0, 6);
  const prev = words.filter((w) => w.endMs <= timeMs).at(-1);
  const next = words.find((w) => w.startMs >= timeMs);
  const gapMs = prev && next ? next.startMs - prev.endMs : prev ? 99999 : 0;

  const midWord = words.find((w) => w.startMs + 1 < timeMs && timeMs < w.endMs - 1);
  const sentence = sentences.find((s) => s.startMs + pad < timeMs && timeMs < s.endMs - pad);
  const prevBare = prev ? bareWord(prev.text) : '';
  const danglesOnComma = prev ? /[,;:]$/.test(prev.text.trim()) : false;
  const danglesOnFunction = FUNCTION_WORDS.has(prevBare);

  let classification: CutClass = 'clean';
  let reason = '';
  if (midWord) {
    classification = 'mid-word';
    reason = `Cut slices through the word "${midWord.text}".`;
  } else if (sentence && gapMs < args.gapMs) {
    classification = danglesOnComma || danglesOnFunction ? 'dangling-clause' : 'mid-sentence';
    reason =
      classification === 'dangling-clause'
        ? `Speech is cut on "${prev?.text}" — an unfinished clause; the sentence continues after the cut.`
        : `Cut lands inside a sentence (${(timeMs - sentence.startMs) / 1000}s in), not at a boundary.`;
  } else if (gapMs >= args.gapMs) {
    classification = 'clean';
    reason = `Cut sits in a ${Math.round(gapMs)}ms speech gap — a natural break.`;
  } else {
    classification = 'boundary';
    reason = 'Cut is at/near a sentence boundary.';
  }

  const flagged = classification === 'mid-word' || classification === 'mid-sentence' || classification === 'dangling-clause';

  const cut: Cut = {
    timeMs,
    classification,
    flagged,
    before: ctx(beforeWords),
    after: ctx(afterWords),
    gapMs: Math.max(0, gapMs === 99999 ? 0 : gapMs),
    reason,
  };

  if (flagged && sentence) {
    // Recommend holding the outgoing clip until the current sentence finishes.
    cut.suggestMs = sentence.endMs;
    cut.suggestFrame = Math.round((sentence.endMs / 1000) * args.projectFps);
    cut.suggestNote = `Hold the outgoing clip to ${fmt(sentence.endMs)} (end of "${sentence.text.slice(0, 60)}${sentence.text.length > 60 ? '…' : ''}") before cutting.`;
  }
  return cut;
}

// ───────────────────────────── 4. Gemini grounded layer ──────────────────────
interface GeminiCut {
  timeMs: number;
  visualBefore?: string;
  visualAfter?: string;
  verdict?: string;
  editorFix?: string;
}

/** Gemini discovers cuts (or annotates ffmpeg-found ones) and adds the visual layer,
 *  grounded by the authoritative Whisper transcript so it never re-guesses the words. */
async function geminiCuts(args: Args, knownCutTimes: number[] | null, transcript: string): Promise<GeminiCut[]> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn('⚠ No GEMINI_API_KEY — skipping the visual layer.');
    return [];
  }
  const ai = new GoogleGenAI({ apiKey });
  const mimeType = args.videoPath.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4';

  console.log('↑ Uploading to Gemini…');
  let file = await ai.files.upload({ file: args.videoPath, config: { mimeType } });
  const deadline = Date.now() + 10 * 60 * 1000;
  while (file.state === FileState.PROCESSING) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for Gemini upload processing.');
    await sleep(3000);
    file = await ai.files.get({ name: file.name as string });
  }
  if (file.state === FileState.FAILED) throw new Error('Gemini failed to process the upload.');

  const langName = args.lang === 'da' ? 'Danish' : 'English';
  const task =
    knownCutTimes && knownCutTimes.length
      ? `These cut timestamps were already detected (seconds): ${knownCutTimes.map((t) => (t / 1000).toFixed(2)).join(', ')}. Annotate EACH of them.`
      : `Identify EVERY hard cut, transition, or scene change (e.g. talking-head ↔ screen-recording / B-roll, jump cuts, graphic-to-footage).`;

  const prompt = `You are a world-class video editor reviewing the CUTS in this edit. Do NOT transcribe the audio yourself — an authoritative transcript is provided below; treat it as ground truth for what is said.

${task}

For each cut report:
- time: MM:SS.s
- visualBefore / visualAfter: what is on screen ~1s before and after the cut.
- verdict: one of "jarring" | "acceptable" | "intentional". A cut where the spoken sentence is unfinished is often jarring — BUT it can be fine if the audio continues over the incoming visual (J-cut / B-roll over VO) or it's an intentional stylistic hard cut. Decide based on what you SEE.
- editorFix: if jarring, the surgical fix (what to hold / where to land the cut). "" otherwise.

AUTHORITATIVE TRANSCRIPT:
"""${transcript}"""

Write prose in ${langName}. Return ONLY JSON: { "cuts": [ { "time": "MM:SS.s", "visualBefore": "...", "visualAfter": "...", "verdict": "jarring", "editorFix": "..." } ] }`;

  console.log(`🔎 Gemini visual layer (${args.model})…`);
  let text: string;
  try {
    const resp = await ai.models.generateContent({
      model: args.model,
      contents: [
        {
          role: 'user',
          parts: [
            { fileData: { fileUri: file.uri as string, mimeType: file.mimeType as string }, videoMetadata: { fps: args.geminiFps } },
            { text: prompt },
          ],
        },
      ],
      config: { responseMimeType: 'application/json' },
    });
    text = resp.text ?? '';
  } finally {
    if (!args.keep && file.name) await ai.files.delete({ name: file.name }).catch(() => {});
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim());
  } catch {
    const a = text.indexOf('{');
    const b = text.lastIndexOf('}');
    parsed = a !== -1 && b > a ? JSON.parse(text.slice(a, b + 1)) : { cuts: [] };
  }
  const out: GeminiCut[] = [];
  for (const g of parsed.cuts ?? []) {
    const timeMs = parseTimeToMs(g.time);
    if (timeMs === null) continue;
    out.push({ timeMs, visualBefore: g.visualBefore, visualAfter: g.visualAfter, verdict: g.verdict, editorFix: g.editorFix });
  }
  return out;
}

// ───────────────────────────── report ────────────────────────────────────────
function renderMd(args: Args, cuts: Cut[], src: string, cutSource: string): string {
  const flagged = cuts.filter((c) => c.flagged);
  const L: string[] = [];
  L.push(`# Cut doctor — ${path.basename(args.videoPath)}`);
  L.push('');
  L.push(`> Whisper (ground-truth ears) + cuts via ${cutSource} + ${args.noGemini ? 'no Gemini' : `Gemini \`${args.model}\``} · transcript: ${src} · ${new Date().toISOString()}`);
  L.push('');
  L.push(`**${cuts.length} cuts detected · ${flagged.length} need a look** (project fps ${args.projectFps}).`);
  L.push('');
  L.push('| | Time | Class | Spoken: …before \\| after… | Gap | Visual (before → after) | Verdict | Recommended fix |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const c of cuts) {
    const cell = (v: unknown) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const mark = c.flagged ? (c.verdict === 'jarring' ? '🛑' : '⚠️') : '✅';
    const spoken = `…${cell(c.before)} \\| ${cell(c.after)}…`;
    const visual = c.visualBefore || c.visualAfter ? `${cell(c.visualBefore)} → ${cell(c.visualAfter)}` : '';
    const fix = c.editorFix ? cell(c.editorFix) : c.suggestNote ? cell(c.suggestNote) : '';
    const fixCol = fix + (c.suggestFrame !== undefined ? ` _(≈ frame ${c.suggestFrame} @ ${args.projectFps}fps)_` : '');
    L.push(`| ${mark} | ${fmt(c.timeMs)} | ${c.classification} | ${spoken} | ${Math.round(c.gapMs)}ms | ${visual} | ${cell(c.verdict)} | ${fixCol} |`);
  }
  L.push('');
  if (flagged.length) {
    L.push('## Cuts to fix');
    L.push('');
    for (const c of flagged) {
      L.push(`### ${fmt(c.timeMs)} — ${c.classification}${c.verdict ? ` · Gemini: ${c.verdict}` : ''}`);
      L.push(`- **Why:** ${c.reason}`);
      L.push(`- **Spoken:** …${c.before} **⟨cut⟩** ${c.after}…`);
      if (c.visualBefore) L.push(`- **Visual:** ${c.visualBefore} → ${c.visualAfter}`);
      if (c.editorFix) L.push(`- **Editor fix:** ${c.editorFix}`);
      if (c.suggestNote) L.push(`- **Suggested cut point:** ${c.suggestNote} (≈ frame ${c.suggestFrame} @ ${args.projectFps}fps)`);
      L.push('');
    }
  }
  return L.join('\n');
}

// ───────────────────────────── main ──────────────────────────────────────────
(async () => {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.videoPath)) {
    console.error(`File not found: ${args.videoPath}`);
    process.exit(1);
  }

  const { words, sentences, fullText } = await getTranscript(args);
  if (!words.length) throw new Error('No words from transcript — cannot analyze cuts.');
  console.log(`✓ Transcript: ${words.length} words, ${sentences.length} sentences.`);

  // Cut discovery: frame-accurate ffmpeg when available, else Gemini (±0.5s — fine,
  // since the verdict keys off Whisper sentence spans, not the exact cut frame).
  let detTimes: number[] | null = null;
  if (ffmpegSupportsFilters()) {
    detTimes = detectCutsFfmpeg(args);
    console.log(`✓ ${detTimes.length} cut(s) detected (ffmpeg, frame-accurate).`);
  } else {
    console.log('ℹ Bundled ffmpeg is filter-less — Gemini will discover cuts; verdict + fix point stay Whisper-deterministic.');
  }

  let anno: GeminiCut[] = [];
  if (!args.noGemini) {
    try {
      anno = await geminiCuts(args, detTimes, fullText);
    } catch (e: any) {
      console.warn(`⚠ Gemini layer failed (${e?.message ?? e}); continuing with what we have.`);
    }
  }

  // Decide the authoritative cut-time list.
  let times: number[];
  if (detTimes && detTimes.length) times = detTimes;
  else if (anno.length) times = anno.map((a) => a.timeMs).sort((a, b) => a - b);
  else {
    times = [];
    console.warn(
      '⚠ No cuts found. Enable Gemini (drop --no-gemini) or provision a full ffmpeg (vibe setup --ffmpeg, or set VIBE_FFMPEG) for cut discovery.',
    );
  }

  const cuts = times.map((t) => classifyCut(t, words, sentences, args));

  // Merge Gemini's visual/verdict onto the nearest cut (within 1.5s).
  for (const g of anno) {
    let best = -1;
    let bestD = 1501;
    cuts.forEach((c, i) => {
      const d = Math.abs(c.timeMs - g.timeMs);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) {
      const c = cuts[best];
      c.visualBefore = g.visualBefore;
      c.visualAfter = g.visualAfter;
      c.verdict = g.verdict;
      c.editorFix = g.editorFix;
    }
  }

  const cutSource = detTimes && detTimes.length ? `ffmpeg scene-detect (frame-accurate)` : anno.length ? `Gemini (${args.model})` : 'none';
  const jsonPath = `${args.outPrefix}.cuts.json`;
  const mdPath = `${args.outPrefix}.cuts.md`;
  fs.writeFileSync(jsonPath, JSON.stringify({ video: args.videoPath, cutSource, cuts }, null, 2));
  fs.writeFileSync(mdPath, renderMd(args, cuts, args.transcript ?? 'Whisper (fresh)', cutSource));

  console.log(`\n✓ Wrote ${jsonPath}`);
  console.log(`✓ Wrote ${mdPath}`);
  const flagged = cuts.filter((c) => c.flagged);
  console.log(`\n${cuts.length} cuts · ${flagged.length} need a look:`);
  for (const c of flagged) {
    console.log(`  ${c.verdict === 'jarring' ? '🛑' : '⚠️'} ${fmt(c.timeMs)} [${c.classification}] …${c.before} ⟨cut⟩ ${c.after}…`);
    if (c.suggestNote) console.log(`     → ${c.suggestNote}`);
  }
})().catch((err) => {
  console.error('\n✗ cut-doctor failed:', err?.message ?? err);
  process.exit(1);
});
