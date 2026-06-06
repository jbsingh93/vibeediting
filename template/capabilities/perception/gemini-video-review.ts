#!/usr/bin/env tsx
/**
 * Gemini video review — gives the editing agent EYES, not just ears.
 *
 * Whisper (capabilities/ingest/transcribe.ts) only "hears" the audio. This script "watches"
 * the video with Google Gemini 3.1 Flash-Lite and produces a timestamped account
 * of what is *visually* happening (b-roll, on-screen text, faces, products,
 * motion graphics, transitions) alongside the spoken audio — including the
 * non-spoken stretches Whisper is blind to.
 *
 * Two modes:
 *   --mode describe  (default)  Timestamped visual + audio timeline of a SOURCE clip.
 *                               Feed this to the storyboard/cut planning step.
 *   --mode qa                   QA pass on a RENDERED edit. Flags weird cuts,
 *                               jarring transitions, animation glitches, text
 *                               overflow / safe-zone violations, audio desync,
 *                               pacing and branding issues — with timestamps,
 *                               severity, and a concrete fix per issue.
 *
 * Usage:
 *   tsx capabilities/perception/gemini-video-review.ts <video-file> [options]
 *
 * Options:
 *   --mode <describe|qa>      Default: describe
 *   --out <prefix>            Output prefix. Default: <video-without-ext>.review
 *                             Writes <prefix>.json + <prefix>.md
 *   --fps <n>                 Frame sampling rate. Default: 1 (describe) / 2 (qa).
 *                             Gemini can only localize within frames it samples,
 *                             so raise this for surgical timestamps. Auto-raised
 *                             by --granularity.
 *   --granularity <scene|second|N>
 *                             describe mode cadence + schema. scene = compact, one
 *                             row per shot/scene change (default). second/N = the
 *                             RICH per-second schema (scene/shot IDs, people, camera,
 *                             transition, editor_metadata, narrative-clarity gate,
 *                             editing_intelligence). Fine values auto-raise --fps.
 *   --transcript <file>       (rich describe only) captions.json / .srt / .txt to
 *                             anchor the timeline temporally (Whisper grounding). The
 *                             words are NOT transcribed back — only used for timing.
 *   --resolution <low|default|high>
 *                             Tokens per frame. low = cheaper, good for long
 *                             videos (>20 min). Default: default.
 *   --model <id>              Default: gemini-3.1-flash-lite
 *   --lang <en|da>            Language of the written report. Default: en
 *   --start <seconds>         Clip start offset (analyze only part of the video).
 *   --end <seconds>           Clip end offset.
 *   --thinking <minimal|low|medium|high>
 *                             Reasoning effort. Default: low (describe) / medium (qa).
 *   --context "<text>"        Brief / intent so QA knows the target (aspect,
 *                             platform, language, intended style, what to check).
 *   --keep                    Keep the uploaded file on Google's servers
 *                             (otherwise it is deleted after analysis).
 *
 * Examples:
 *   # Eyes on a raw take before planning the cut
 *   tsx capabilities/perception/gemini-video-review.ts out/01-ingest/proxy/take-720p.mp4 \
 *       --mode describe --out out/02-analyze/take.visual --fps 2
 *
 *   # QA a finished 9:16 ad before delivery
 *   tsx capabilities/perception/gemini-video-review.ts out/AdV1-loudnorm.mp4 \
 *       --mode qa --context "9:16 Meta Reel, English, educator style, 30s" \
 *       --resolution low
 *
 * Requires:
 *   - npm i @google/genai
 *   - GEMINI_API_KEY (or GOOGLE_API_KEY) in env or .env  → https://aistudio.google.com/apikey
 *
 * Companion to capabilities/ingest/transcribe.ts. Use BOTH on source footage: Whisper for
 * word-level caption timestamps, Gemini for the visual track.
 */

import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, FileState, MediaResolution, ThinkingLevel } from '@google/genai';

// ───────────────────────────── .env loader (dependency-free) ─────────────────
// tsx does not auto-load .env. Read it from the project root so the project's keys in
// .env "just work" without exporting them first.
function loadDotEnv(): void {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
  }
}

// ───────────────────────────── arg parsing ───────────────────────────────────
type Mode = 'describe' | 'qa';

interface Args {
  videoPath: string;
  mode: Mode;
  outPrefix: string;
  fps: number;
  granularity: 'scene' | number; // describe row cadence: scene-change vs every N seconds
  resolution: 'low' | 'default' | 'high';
  model: string;
  lang: 'da' | 'en';
  start?: number;
  end?: number;
  thinking?: 'minimal' | 'low' | 'medium' | 'high';
  context?: string;
  transcript?: string; // captions.json / .srt / .txt to anchor the rich timeline temporally
  keep: boolean;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positional.push(a);
    }
  }

  const videoPath = positional[0];
  if (!videoPath) usageAndExit();

  const mode = (flags.mode as Mode) ?? 'describe';
  if (mode !== 'describe' && mode !== 'qa') {
    console.error(`Unknown --mode "${flags.mode}". Use "describe" or "qa".`);
    process.exit(1);
  }

  const defaultPrefix = videoPath.replace(/\.[^.]+$/, '') + '.review';

  // Granularity controls describe-mode row cadence: 'scene' (per shot/scene
  // change, default) or N = roughly one row every N seconds for surgical edits.
  const granRaw = flags.granularity as string | undefined;
  let granularity: 'scene' | number = 'scene';
  if (granRaw === 'second') granularity = 1;
  else if (granRaw !== undefined && granRaw !== 'scene' && !Number.isNaN(Number(granRaw))) {
    granularity = Math.max(1, Number(granRaw));
  }

  // Frame sampling. Gemini can only localize within frames it actually sees, so
  // fine-grained describe and any QA cut-audit need more frames. Auto-raise fps
  // when the user didn't pin it explicitly.
  const fpsExplicit = flags.fps !== undefined;
  let fps = fpsExplicit ? Number(flags.fps) : 1;
  if (!fpsExplicit) {
    if (typeof granularity === 'number' && granularity <= 1) fps = 4;
    else if (typeof granularity === 'number' && granularity <= 2) fps = 2;
    else if (mode === 'qa') fps = 2; // better cut detection
  }

  return {
    videoPath,
    mode,
    outPrefix: (flags.out as string) ?? defaultPrefix,
    fps,
    granularity,
    resolution: (flags.resolution as Args['resolution']) ?? 'default',
    model: (flags.model as string) ?? process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite',
    lang: (flags.lang as Args['lang']) ?? 'en',
    start: flags.start ? Number(flags.start) : undefined,
    end: flags.end ? Number(flags.end) : undefined,
    thinking: flags.thinking as Args['thinking'] | undefined,
    context: flags.context as string | undefined,
    transcript: flags.transcript as string | undefined,
    keep: flags.keep === true,
  };
}

function usageAndExit(): never {
  console.error('Usage: tsx capabilities/perception/gemini-video-review.ts <video-file> [--mode describe|qa] [options]');
  console.error('See header of this file for the full option list.');
  process.exit(1);
}

// ───────────────────────────── helpers ───────────────────────────────────────
const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpg',
  '.flv': 'video/x-flv',
  '.wmv': 'video/wmv',
  '.3gp': 'video/3gpp',
};

function mimeFor(file: string): string {
  return MIME_BY_EXT[path.extname(file).toLowerCase()] ?? 'video/mp4';
}

function resolutionEnum(r: Args['resolution']): MediaResolution | undefined {
  switch (r) {
    case 'low':
      return MediaResolution.MEDIA_RESOLUTION_LOW;
    case 'high':
      return MediaResolution.MEDIA_RESOLUTION_HIGH;
    default:
      return undefined; // let the model use its default
  }
}

function thinkingEnum(t: Args['thinking']): ThinkingLevel | undefined {
  switch (t) {
    case 'minimal':
      return ThinkingLevel.MINIMAL;
    case 'low':
      return ThinkingLevel.LOW;
    case 'medium':
      return ThinkingLevel.MEDIUM;
    case 'high':
      return ThinkingLevel.HIGH;
    default:
      return undefined;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Best-effort JSON parse — strips ``` fences and trailing prose if present. */
function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to brace extraction
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* keep trying */
    }
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1));
  }
  throw new Error('Model did not return parseable JSON.');
}

// ───────────────────────────── prompts ───────────────────────────────────────
function describePrompt(a: Args): string {
  const langName = a.lang === 'da' ? 'Danish' : 'English';
  const cadence =
    a.granularity === 'scene'
      ? 'Segment the video every time the shot, scene, framing, or on-screen graphic meaningfully changes (typically every 2–8 seconds).'
      : `Produce a fine-grained timeline: roughly one row every ${
          a.granularity === 1 ? 'second' : `${a.granularity} seconds`
        }, precise enough for surgical, second-by-second editing. ALWAYS add an extra row exactly at any cut or transition, even if it falls between intervals.`;
  return `You are a senior video editor's assistant. You are the EYES on this footage — a separate process already has the word-level audio transcript, so your job is to describe what is happening VISUALLY and to anchor everything to precise timestamps, including the stretches where nobody is speaking.

Watch the entire video and produce a dense, timestamped account. ${cadence} Do NOT skip silent or B-roll stretches — those are exactly the moments the audio transcript misses.

For EACH segment report:
- visual: what is literally on screen (subjects, action, setting, camera movement, framing).
- onScreenText: any visible text, captions, lower-thirds, UI text, logos — transcribe it verbatim. "" if none.
- audio: spoken words (paraphrase is fine, the precise transcript exists elsewhere), plus non-speech audio cues you can infer (music mood, SFX, silence).
- shotType: one of talking-head | b-roll | screen-recording | motion-graphic | product-shot | text-card | transition | other.
- cut: if a cut or transition happens inside this segment, give its exact timestamp and state whether it interrupts speech mid-sentence/mid-word or cuts away before a thought finishes. "" if none.
- people: who/what is visible (e.g. "one man, mid-shot, facing camera"). "" if none.
- notable: brand elements, products, faces, transitions, anything an editor should know.

Also report the dominant spoken language, an overall summary, and a short list of the strongest visual moments (good for hooks, thumbnails, or B-roll cutaways).

Timestamps use MM:SS.s format with one-decimal precision (e.g. "00:17.4"). Be as precise as the frame sampling allows; do not round everything to whole seconds.

Write the prose fields (summary, visual, notable, cut) in ${langName}.

Return ONLY a JSON object, no markdown, in exactly this shape:
{
  "summary": "2–4 sentence overview of the video, in ${langName}",
  "spokenLanguage": "da | en | mixed | none",
  "segments": [
    {
      "start": "MM:SS.s",
      "end": "MM:SS.s",
      "shotType": "talking-head",
      "visual": "...",
      "onScreenText": "...",
      "audio": "...",
      "cut": "...",
      "people": "...",
      "notable": "..."
    }
  ],
  "keyVisualMoments": [
    { "time": "MM:SS.s", "what": "why this moment stands out" }
  ]
}`;
}

/** Rich second-by-second timeline (granularity = second / N). Structured for an
 *  automated editing agent. Used when --granularity is not "scene". Optionally
 *  grounded by a Whisper transcript (temporal anchor only — not transcribed back). */
function richDescribePrompt(a: Args, transcriptText?: string): string {
  const langName = a.lang === 'da' ? 'Danish' : 'English';
  const every = a.granularity === 1 ? 'every single second' : `every ${a.granularity} seconds`;
  const cadenceRule =
    a.granularity === 1
      ? 'Produce EXACTLY ONE entry per whole second, perfectly contiguous: 00:00, 00:01, 00:02, … with NO gaps and NO skipped or duplicated seconds. First entry is 00:00; last is the final whole second (round a partial final second up). Silent/static seconds are NOT exempt — they get a full entry too.'
      : `Produce one entry ${every}, PLUS an extra entry exactly at any cut/transition. Keep timestamps contiguous on that cadence.`;
  const anchor = transcriptText
    ? `\nTEMPORAL ANCHOR — a word-level transcript is provided between the markers. Use it ONLY to align your visual observations to the correct second. DO NOT copy, paraphrase, or transcribe it into your output (the speech layer is handled elsewhere).\n[TRANSCRIPT_START]\n${transcriptText}\n[TRANSCRIPT_END]\n`
    : '';
  return `You are a precision Video Visual Intelligence Analyst — the dedicated "eyes" in a multi-stage video-editing AI pipeline. You convert footage into a SECOND-BY-SECOND, machine-readable visual map a downstream editing agent can act on. A separate speech-to-text agent handles spoken words, so you do NOT transcribe dialogue — you report every visual, environmental, and non-speech auditory signal: silent moments, B-roll, gestures, on-screen text, shot-level cinematography.

You are also an analytical Video Director: actively evaluate NARRATIVE COHERENCE. If a speaker introduces an abstract claim ("I have built this" / "I vibe-coded it") and the edit transitions to a visual (e.g. a screen recording), judge whether the audio-claim → visual-proof connection is logically supported. If it is ambiguous, or a verbal setup pays off only after the cut, flag a NARRATIVE CONTINUITY ERROR (set narrative_clarity.is_context_supported=false with a reason, and list it in editing_intelligence.narrative_coherence_analysis.problematic_transitions). This nuance is what separates good editing from world-class.

${cadenceRule}

Populate EVERY field for each entry (empty string / empty array if nothing — never null). Be specific: "man in black zip-top leans in, right-hand gesture, direct eye contact" — NOT "man talks". Do not invent what you cannot see; write "unreadable" / "obscured" when applicable. Controlled vocabularies:
- camera.shot_type: XCU | CU | MS | WS | ELS | OTS | POV | establishing
- camera.movement: static | pan-L | pan-R | tilt-up | tilt-down | push-in | pull-out | handheld | gimbal | whip
- transition_at_this_second: none | hard_cut | fade | dissolve | whip_pan | match_cut | jump_cut | freeze | speed_change
- editor_metadata.segment_purpose: hook | exposition | b_roll | talking_head | demonstration | transition | reaction | payoff | filler | dead_air
- editor_metadata.visual_audio_sync: speaking_to_camera | speaking_off_camera | silent_action | voiceover_compatible | music_driven | dialogue_between_subjects
- people[].mouth_movement: speaking | silent | reacting | not_visible
- scene_id increments only when the location/setting changes; shot_id increments on EVERY hard cut, dissolve, or major camera change.
${anchor}
Write prose fields in ${langName}. Timestamps MM:SS (H:MM:SS past an hour). Return ONLY one valid JSON object — no markdown, no prose around it — in this shape:
{
  "video_summary": { "total_duration_seconds": 0, "total_timeline_entries": 0, "dominant_format": "talking_head|tutorial|vlog|interview|promotional|event|narrative|documentary|mixed", "overall_visual_style": "", "primary_setting": "", "primary_subjects_count": 0, "estimated_shot_count": 0, "pacing": "slow|moderate|fast|variable" },
  "timeline": [
    { "timestamp": "MM:SS", "scene_id": 1, "shot_id": 1, "visual_description": "", "people_visible_count": 0,
      "people": [ { "position_in_frame": "", "expression": "", "action": "", "gesture": "", "mouth_movement": "speaking|silent|reacting|not_visible" } ],
      "key_objects": [], "setting": "", "camera": { "shot_type": "", "movement": "" }, "on_screen_text": "", "lighting_mood": "",
      "audio_cues": { "music_present": true, "notable_sfx": "" },
      "transition_at_this_second": "none",
      "editor_metadata": { "segment_purpose": "", "b_roll_candidate": false, "cut_candidate": false, "emphasis": false, "visual_audio_sync": "" },
      "narrative_clarity": { "is_context_supported": true, "missing_context_reason": "" },
      "notable": "" }
  ],
  "scenes": [ { "scene_id": 1, "timestamp_start": "MM:SS", "timestamp_end": "MM:SS", "scene_summary": "" } ],
  "editing_intelligence": {
    "strongest_hook_moments": [ { "timestamp": "MM:SS", "reason": "" } ],
    "recommended_cut_segments": [ { "timestamp_start": "MM:SS", "timestamp_end": "MM:SS", "reason": "" } ],
    "b_roll_overlay_opportunities": [ { "timestamp_start": "MM:SS", "timestamp_end": "MM:SS", "reason": "" } ],
    "potential_short_form_clips": [ { "timestamp_start": "MM:SS", "timestamp_end": "MM:SS", "hook_reason": "" } ],
    "continuity_or_quality_issues": [ { "timestamp": "MM:SS", "issue": "", "severity": "low|medium|high", "fix_recommendation": "" } ],
    "narrative_coherence_analysis": { "is_flow_intuitive": true, "problematic_transitions": [ "MM:SS-MM:SS — reason" ] }
  }
}`;
}

function qaPrompt(a: Args): string {
  const langName = a.lang === 'da' ? 'Danish' : 'English';
  const ctx = a.context
    ? `\nProduction brief / intent for this edit (judge it against this):\n"""${a.context}"""\n`
    : '\nNo brief was supplied. Assume a polished social/marketing video and judge against general professional standards.\n';
  return `You are a meticulous senior video editor doing a final QA pass on a RENDERED, edited video before it ships. Watch the whole thing and hunt for things a client or viewer would notice. Be specific and honest — it is more useful to flag a real problem than to be polite.
${ctx}
═══ MOST IMPORTANT: CUT & CONTINUITY AUDIT ═══
Walk the video cut by cut. Record EVERY cut/transition in "cutAudit" — quote the exact words right before and after each cut, and classify how any setup pays off. This is for a human editor to review, so SURFACE borderline cuts; do not silently pass a cut just because the visual "makes sense."

Set clean=false (and surface it) if ANY of these is true:
- a sentence or word is cut off mid-way;
- the speaker makes a verbal setup ("I built / I made / I vibe-coded / let me show you X", "the thing is…") and the cut happens BEFORE that setup is verbally completed — EVEN IF it is then shown visually (payoff = "visual-after-cut"). The editor will often want to hold the A-roll until the sentence finishes; surface it and let them decide. Do NOT mark it clean just because the viewer can infer the answer from the footage;
- essential information is removed/skipped, or a thought is left dangling;
- the topic jumps with no bridge, or the incoming clip starts mid-action/mid-word.

For each non-clean cut, say exactly where the cut SHOULD land (e.g. "hold the A-roll ~2s longer until he names the app, then cut"). Bias toward surfacing: when a viewer's understanding depends on inferring from visuals what the speaker didn't finish saying, mark clean=false.

═══ OTHER CATEGORIES TO TIMESTAMP (as "issues") ═══
- cut: abrupt/awkward cuts, jump cuts on motion, cuts mid-word, missing frames, hard cut where a transition was intended.
- continuity: setup with no payoff, dropped essential info, dangling thought, unmotivated topic jump (the serious ones from the audit above — also list them here as issues).
- transition: jarring, too-long/-fast, mismatched, or inconsistent; flash frames; black frames.
- animation: stutter, pop-in, snapping instead of easing, mistimed reveals, motion fighting the audio, janky springs.
- graphics: text overflow/clipping at frame edges, low contrast / unreadable, misalignment, overlap, wrong fonts, pixelation, aspect-ratio stretch.
- safe-zone: for 9:16, captions/key info in the bottom ~480px or top notch area where platform UI overlaps.
- text-error: spelling/grammar in on-screen text (in whatever language appears on screen).
- audio: clipping/distortion, sudden volume jumps, music not ducking under voice, dead air, A/V desync, abrupt music cut-offs.
- sync: captions/graphics not matching the spoken word; lip-sync drift.
- pacing: a scene that drags or is too short to read; weak hook in the first 3 seconds; saggy middle.
- branding: off-brand colors, missing/incorrect logo, inconsistent style vs the stated intent.

For EACH issue give: time (MM:SS.s), severity (blocker | major | minor | nit), category (from the list above), problem (what's wrong), and fix (concrete + actionable, ideally with the exact timestamp to cut/trim to).

Then give an overall verdict, a one-paragraph summary, and a short list of what genuinely works well (strengths).

Timestamps use MM:SS.s format with one-decimal precision (e.g. "00:17.4"); do not round everything to whole seconds. Write prose fields in ${langName}.

Return ONLY a JSON object, no markdown, in exactly this shape:
{
  "verdict": "ship | fix-first | rework",
  "overallNotes": "one honest paragraph, in ${langName}",
  "cutAudit": [
    {
      "at": "MM:SS.s",
      "speechBefore": "the exact words spoken right before the cut",
      "speechAfter": "the exact words after, or [no speech] / a note on the incoming visual",
      "setup": "any promise/tease that needs a payoff (e.g. 'I vibe-coded this'); empty string if none",
      "payoff": "verbal-before-cut | visual-after-cut | delayed | missing | n/a",
      "clean": true,
      "note": "editorial observation about this cut",
      "fix": "where the cut should land / what to hold (empty string if clean)"
    }
  ],
  "issues": [
    {
      "time": "MM:SS.s",
      "severity": "major",
      "category": "continuity",
      "problem": "...",
      "fix": "..."
    }
  ],
  "strengths": ["...", "..."]
}`;
}

// ───────────────────────────── markdown rendering ────────────────────────────
function renderDescribeMd(a: Args, data: any): string {
  const lines: string[] = [];
  lines.push(`# Visual + audio review — ${path.basename(a.videoPath)}`);
  lines.push('');
  lines.push(`> Generated by Gemini \`${a.model}\` · mode: describe · ${a.fps} fps · ${new Date().toISOString()}`);
  lines.push('');
  if (data.summary) {
    lines.push('## Summary');
    lines.push('');
    lines.push(String(data.summary));
    lines.push('');
  }
  if (data.spokenLanguage) lines.push(`**Spoken language:** ${data.spokenLanguage}\n`);

  const segs = Array.isArray(data.segments) ? data.segments : [];
  lines.push('## Timeline');
  lines.push('');
  lines.push('| Time | Shot | Visual | On-screen text | Audio | Cut / continuity | Notable |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const s of segs) {
    const cell = (v: unknown) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(
      `| ${cell(s.start)}–${cell(s.end)} | ${cell(s.shotType)} | ${cell(s.visual)} | ${cell(s.onScreenText)} | ${cell(s.audio)} | ${cell(s.cut)} | ${cell(s.notable)} |`,
    );
  }
  lines.push('');

  const moments = Array.isArray(data.keyVisualMoments) ? data.keyVisualMoments : [];
  if (moments.length) {
    lines.push('## Key visual moments');
    lines.push('');
    for (const m of moments) lines.push(`- **${m.time}** — ${m.what}`);
    lines.push('');
  }
  return lines.join('\n');
}

const secToMMSS = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

/** Load a transcript (Caption[] json / {words} / .srt / .txt) into compact
 *  per-second "[MM:SS] words…" lines to use as the rich-timeline temporal anchor. */
function loadTranscriptText(file: string): string {
  const raw = fs.readFileSync(file, 'utf8');
  if (file.toLowerCase().endsWith('.json')) {
    const data = JSON.parse(raw);
    const caps: any[] = Array.isArray(data) ? data : (data.words ?? []);
    const bySec = new Map<number, string[]>();
    for (const c of caps) {
      const startMs = Number(c.startMs ?? (c.start != null ? c.start * 1000 : 0));
      const t = String(c.text ?? c.word ?? '').trim();
      if (!t) continue;
      const sec = Math.floor(startMs / 1000);
      const arr = bySec.get(sec) ?? [];
      arr.push(t);
      bySec.set(sec, arr);
    }
    return [...bySec.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([s, ws]) => `[${secToMMSS(s)}] ${ws.join(' ')}`)
      .join('\n');
  }
  return raw.trim(); // .srt / .txt already timestamped or plain
}

function renderRichDescribeMd(a: Args, data: any): string {
  const cell = (v: unknown) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const L: string[] = [];
  L.push(`# Second-by-second timeline — ${path.basename(a.videoPath)}`);
  L.push('');
  L.push(`> Gemini \`${a.model}\` · describe (granularity: ${a.granularity}) · ${a.fps} fps${a.transcript ? ' · transcript-anchored' : ''} · ${new Date().toISOString()}`);
  L.push('');
  const vs = data.video_summary ?? {};
  if (Object.keys(vs).length) {
    L.push('## Summary');
    L.push('');
    L.push(`- **Format:** ${cell(vs.dominant_format)} · **Pacing:** ${cell(vs.pacing)} · **Shots:** ${cell(vs.estimated_shot_count)} · **Duration:** ${cell(vs.total_duration_seconds)}s`);
    if (vs.overall_visual_style) L.push(`- **Style:** ${cell(vs.overall_visual_style)}`);
    if (vs.primary_setting) L.push(`- **Setting:** ${cell(vs.primary_setting)}`);
    L.push('');
  }

  const tl = Array.isArray(data.timeline) ? data.timeline : [];
  L.push(`## Timeline (${tl.length} entries)`);
  L.push('');
  L.push('| Time | Sc/Sh | Shot | Visual | On-screen text | Transition | Purpose | Flags | Context |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const e of tl) {
    const em = e.editor_metadata ?? {};
    const flags = [em.cut_candidate ? 'cut' : '', em.b_roll_candidate ? 'b-roll' : '', em.emphasis ? '★' : ''].filter(Boolean).join(' ');
    const trans = e.transition_at_this_second && e.transition_at_this_second !== 'none' ? `**${cell(e.transition_at_this_second)}**` : '';
    const ctx = e.narrative_clarity?.is_context_supported === false ? `⚠️ ${cell(e.narrative_clarity?.missing_context_reason)}` : '✅';
    L.push(
      `| ${cell(e.timestamp)} | ${cell(e.scene_id)}/${cell(e.shot_id)} | ${cell(e.camera?.shot_type)} | ${cell(e.visual_description)} | ${cell(e.on_screen_text)} | ${trans} | ${cell(em.segment_purpose)} | ${cell(flags)} | ${ctx} |`,
    );
  }
  L.push('');

  const scenes = Array.isArray(data.scenes) ? data.scenes : [];
  if (scenes.length) {
    L.push('## Scenes');
    L.push('');
    for (const s of scenes) L.push(`- **${cell(s.timestamp_start)}–${cell(s.timestamp_end)}** (scene ${cell(s.scene_id)}): ${cell(s.scene_summary)}`);
    L.push('');
  }

  const ei = data.editing_intelligence ?? {};
  const section = (title: string, rows: string[]) => {
    if (!rows.length) return;
    L.push(`## ${title}`);
    L.push('');
    L.push(...rows);
    L.push('');
  };
  section('Hook moments', (ei.strongest_hook_moments ?? []).map((h: any) => `- **${cell(h.timestamp)}** — ${cell(h.reason)}`));
  section('Recommended cut segments', (ei.recommended_cut_segments ?? []).map((c: any) => `- **${cell(c.timestamp_start)}–${cell(c.timestamp_end)}** — ${cell(c.reason)}`));
  section('B-roll / overlay opportunities', (ei.b_roll_overlay_opportunities ?? []).map((b: any) => `- **${cell(b.timestamp_start)}–${cell(b.timestamp_end)}** — ${cell(b.reason)}`));
  section('Short-form clip candidates', (ei.potential_short_form_clips ?? []).map((c: any) => `- **${cell(c.timestamp_start)}–${cell(c.timestamp_end)}** — ${cell(c.hook_reason)}`));

  const issues = ei.continuity_or_quality_issues ?? [];
  if (issues.length) {
    L.push('## Continuity / quality issues');
    L.push('');
    L.push('| Time | Sev | Issue | Fix |');
    L.push('|---|---|---|---|');
    for (const i of issues) L.push(`| ${cell(i.timestamp)} | ${cell(i.severity)} | ${cell(i.issue)} | ${cell(i.fix_recommendation)} |`);
    L.push('');
  }
  const nca = ei.narrative_coherence_analysis;
  if (nca) {
    L.push('## Narrative coherence');
    L.push('');
    L.push(`- **Flow intuitive:** ${nca.is_flow_intuitive === false ? '⚠️ no' : '✅ yes'}`);
    for (const p of nca.problematic_transitions ?? []) L.push(`- ⚠️ ${cell(p)}`);
    L.push('');
  }
  return L.join('\n');
}

function renderQaMd(a: Args, data: any): string {
  const lines: string[] = [];
  const sevOrder: Record<string, number> = { blocker: 0, major: 1, minor: 2, nit: 3 };
  const sevEmoji: Record<string, string> = { blocker: '🛑', major: '🔴', minor: '🟡', nit: '⚪' };

  lines.push(`# Edit QA review — ${path.basename(a.videoPath)}`);
  lines.push('');
  lines.push(`> Generated by Gemini \`${a.model}\` · mode: qa · ${new Date().toISOString()}`);
  lines.push('');
  if (data.verdict) lines.push(`**Verdict:** \`${data.verdict}\`\n`);
  if (data.overallNotes) {
    lines.push(String(data.overallNotes));
    lines.push('');
  }

  const cuts = Array.isArray(data.cutAudit) ? data.cutAudit : [];
  if (cuts.length) {
    const flagged = cuts.filter((c: any) => c.clean === false);
    lines.push(`## Cut audit (${cuts.length} cuts · ${flagged.length} to review)`);
    lines.push('');
    lines.push('| | At | Speech before → after | Setup | Payoff | Note / where to cut |');
    lines.push('|---|---|---|---|---|---|');
    for (const c of cuts) {
      const cell = (v: unknown) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      const mark = c.clean === false ? '⚠️' : '✅';
      const noteFix = [c.note, c.fix].map((v) => String(v ?? '').trim()).filter(Boolean).join(' — ');
      lines.push(
        `| ${mark} | ${cell(c.at)} | ${cell(c.speechBefore)} → ${cell(c.speechAfter)} | ${cell(c.setup)} | ${cell(c.payoff)} | ${cell(noteFix)} |`,
      );
    }
    lines.push('');
  }

  const issues = (Array.isArray(data.issues) ? data.issues : [])
    .slice()
    .sort((x: any, y: any) => (sevOrder[x.severity] ?? 9) - (sevOrder[y.severity] ?? 9));

  lines.push(`## Issues (${issues.length})`);
  lines.push('');
  if (!issues.length) {
    lines.push('_No issues flagged._');
  } else {
    lines.push('| Sev | Time | Category | Problem | Suggested fix |');
    lines.push('|---|---|---|---|---|');
    for (const it of issues) {
      const cell = (v: unknown) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      const sev = `${sevEmoji[it.severity] ?? ''} ${cell(it.severity)}`.trim();
      lines.push(`| ${sev} | ${cell(it.time)} | ${cell(it.category)} | ${cell(it.problem)} | ${cell(it.fix)} |`);
    }
  }
  lines.push('');

  const strengths = Array.isArray(data.strengths) ? data.strengths : [];
  if (strengths.length) {
    lines.push('## Works well');
    lines.push('');
    for (const s of strengths) lines.push(`- ${s}`);
    lines.push('');
  }
  return lines.join('\n');
}

// ───────────────────────────── main ──────────────────────────────────────────
(async () => {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));

  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY (or GOOGLE_API_KEY) is required.');
    console.error('Add it to .env or export it. Get a key at https://aistudio.google.com/apikey');
    process.exit(1);
  }
  if (!fs.existsSync(args.videoPath)) {
    console.error(`File not found: ${args.videoPath}`);
    process.exit(1);
  }

  const sizeMB = fs.statSync(args.videoPath).size / (1024 * 1024);
  if (sizeMB > 2048) {
    console.error(`File is ${sizeMB.toFixed(0)} MB — exceeds the 2 GB per-file Files API limit.`);
    console.error('Make a proxy first (capabilities/deliver/make-proxy.ts) and analyze that instead.');
    process.exit(1);
  }
  if (sizeMB > 400) {
    console.warn(`⚠ ${sizeMB.toFixed(0)} MB is large. Analyze a 720p proxy for speed/cost — Gemini only needs to *see* it, not render from it.`);
  }

  const ai = new GoogleGenAI({ apiKey });
  const mimeType = mimeFor(args.videoPath);

  // 1) Upload via the Files API
  console.log(`↑ Uploading ${path.basename(args.videoPath)} (${sizeMB.toFixed(1)} MB, ${mimeType})…`);
  let file = await ai.files.upload({ file: args.videoPath, config: { mimeType } });

  // 2) Poll until the video finishes server-side processing
  const deadline = Date.now() + 10 * 60 * 1000; // 10 min
  while (file.state === FileState.PROCESSING) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for Gemini to process the upload.');
    process.stdout.write('  …processing\r');
    await sleep(3000);
    file = await ai.files.get({ name: file.name as string });
  }
  if (file.state === FileState.FAILED) {
    throw new Error(`Gemini failed to process the file: ${JSON.stringify(file.error ?? {})}`);
  }
  console.log(`✓ File ACTIVE: ${file.name}`);

  // 3) Build the request
  const isRich = args.mode === 'describe' && args.granularity !== 'scene';
  let transcriptText: string | undefined;
  if (isRich && args.transcript) {
    if (!fs.existsSync(args.transcript)) {
      console.warn(`⚠ Transcript not found: ${args.transcript} — proceeding without the temporal anchor.`);
    } else {
      transcriptText = loadTranscriptText(args.transcript);
      console.log(`⚓ Anchoring timeline to transcript: ${args.transcript}`);
    }
  }
  const prompt =
    args.mode === 'qa' ? qaPrompt(args) : isRich ? richDescribePrompt(args, transcriptText) : describePrompt(args);

  const videoMetadata: Record<string, unknown> = { fps: args.fps };
  if (args.start !== undefined) videoMetadata.startOffset = `${args.start}s`;
  if (args.end !== undefined) videoMetadata.endOffset = `${args.end}s`;

  const config: Record<string, unknown> = { responseMimeType: 'application/json' };
  const mr = resolutionEnum(args.resolution);
  if (mr) config.mediaResolution = mr;
  const tl = thinkingEnum(args.thinking ?? (args.mode === 'qa' ? 'medium' : 'low'));
  if (tl) config.thinkingConfig = { thinkingLevel: tl };

  console.log(`🔎 Analyzing with ${args.model} (mode: ${args.mode}, resolution: ${args.resolution})…`);

  let responseText: string;
  try {
    const response = await ai.models.generateContent({
      model: args.model,
      contents: [
        {
          role: 'user',
          parts: [
            { fileData: { fileUri: file.uri as string, mimeType: file.mimeType as string }, videoMetadata },
            { text: prompt },
          ],
        },
      ],
      config,
    });
    responseText = response.text ?? '';
  } finally {
    if (!args.keep && file.name) {
      await ai.files.delete({ name: file.name }).catch(() => {});
    }
  }

  if (!responseText.trim()) throw new Error('Gemini returned an empty response.');

  // 4) Parse + write outputs
  let data: any;
  try {
    data = parseJsonLoose(responseText);
  } catch (e) {
    const rawPath = `${args.outPrefix}.raw.txt`;
    fs.writeFileSync(rawPath, responseText);
    console.error(`Could not parse JSON. Raw response saved to ${rawPath}`);
    throw e;
  }

  const jsonPath = `${args.outPrefix}.json`;
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));

  const md = args.mode === 'qa' ? renderQaMd(args, data) : isRich ? renderRichDescribeMd(args, data) : renderDescribeMd(args, data);
  const mdPath = `${args.outPrefix}.md`;
  fs.writeFileSync(mdPath, md);

  // 5) Console summary so a calling agent gets immediate signal
  console.log(`\n✓ Wrote ${jsonPath}`);
  console.log(`✓ Wrote ${mdPath}`);
  if (isRich) {
    const tl = Array.isArray(data.timeline) ? data.timeline : [];
    const flagged = tl.filter((e: any) => e.narrative_clarity?.is_context_supported === false);
    const ei = data.editing_intelligence ?? {};
    console.log(`\nTimeline: ${tl.length} per-second entries · ${(ei.strongest_hook_moments ?? []).length} hooks · ${(ei.continuity_or_quality_issues ?? []).length} quality issues`);
    console.log(`Narrative-continuity flags: ${flagged.length}`);
    for (const e of flagged.slice(0, 5)) console.log(`  ⚠️ ${e.timestamp}: ${e.narrative_clarity?.missing_context_reason}`);
  } else if (args.mode === 'describe') {
    const n = Array.isArray(data.segments) ? data.segments.length : 0;
    console.log(`\nTimeline: ${n} segments · spoken language: ${data.spokenLanguage ?? '?'}`);
    if (data.summary) console.log(`Summary: ${data.summary}`);
  } else {
    const issues = Array.isArray(data.issues) ? data.issues : [];
    const blockers = issues.filter((i: any) => i.severity === 'blocker' || i.severity === 'major').length;
    const flagged = (Array.isArray(data.cutAudit) ? data.cutAudit : []).filter((c: any) => c.clean === false);
    console.log(
      `\nVerdict: ${data.verdict ?? '?'} · ${issues.length} issues (${blockers} blocker/major) · ${flagged.length} cuts to review`,
    );
    for (const c of flagged.slice(0, 5)) console.log(`  [cut ${c.at}] ${c.note ?? c.setup ?? ''} (payoff: ${c.payoff ?? '?'})`);
    for (const it of issues.slice(0, 5)) {
      console.log(`  [${it.severity}] ${it.time} ${it.category}: ${it.problem}`);
    }
  }
})().catch((err) => {
  console.error('\n✗ gemini-video-review failed:', err?.message ?? err);
  process.exit(1);
});
