#!/usr/bin/env tsx
/**
 * capabilities/perception/specialists.ts — the SPECIALIST PANEL REGISTRY (SSOT).
 *
 * ONE registry, consumed by BOTH councils:
 *   • perception-council.ts → runs the PERCEIVE-mode specialists on SOURCE footage (fan-out describe).
 *   • gemini-council.ts     → runs the JUDGE-mode specialists on a RENDERED edit (the EYES gate).
 *
 * Each specialist is a single-domain, world-class expert. Its prompt is ASSEMBLED from reusable
 * parts (forcing preamble + deep checklist + mode task + calibration + JSON schema) — the prompt
 * design follows DRAFT `drafts/specialist-panel-registry*.md` and the reasoning-model + repetition
 * research baked into `master-gpt-prompter`:
 *   - one-line craft-law persona (anchors latent space; no flowery prose)
 *   - single-format XML, instructions LAST, anchored "Based on the video above"
 *   - leniency-busters KEPT (evidence-or-invalid · quadrant/duration scan · `unsure`-routes-to-meter
 *     · don't-assert-unmeasurable · observed-absent-not-fabricated)
 *   - per-specialist thinking_level + media_resolution (API config, not prompt-hacking)
 *   - prompt repetition on low-effort / position-sensitive lanes (free accuracy; Google Research Dec-2025)
 *
 * The rule IDs (A1–A5, C1–C5, …) resolve against the numbered standard in
 * `.claude/skills/video-editor/references/editing-protocol.md`. Keep the two in lockstep.
 * Model is ALWAYS gemini-3.1-flash-lite (models.json; never Gemini 2.5). Temperature stays the
 * Gemini-3 default (1.0) — askJson does not set it.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from '../_env/contract';

export type Lane = 'A' | 'C' | 'V' | 'N' | 'F' | 'K' | 'D' | 'P' | 'T' | 'B';
export type Mode = 'perceive' | 'judge';
export type Thinking = 'minimal' | 'low' | 'medium' | 'high';
export type Resolution = 'low' | 'default' | 'high';
export type RepetitionMode = 'none' | 'double' | 'task-triple';

export interface SamplingProfile {
  fps: number;
  resolution: Resolution;
  thinking: Thinking;
}

export interface SpecialistRule {
  id: string;
  tag: string; // [GEMINI] | [METER] | [WHISPER] | [CUT-DOCTOR] | [VAD] | [PLAN] | [HUMAN]
  text: string;
}

export interface Specialist {
  id: string;
  lane: Lane;
  title: string;
  persona: string; // identity + the one craft law that sharpens findings
  laneFocus: string; // the "stay strictly in your lane" string
  runsIn: Mode[];
  audioLane?: boolean; // true → audio scan/region variant instead of visual quadrants
  rules: SpecialistRule[]; // protocol rules this lane owns
  inspect: string; // the deep checklist (terse coverage list)
  calibration: { blocker: string; nit: string };
  shipScore: number; // judge ship-threshold
  sampling: Partial<Record<Mode, SamplingProfile>>;
  repetition: Partial<Record<Mode, RepetitionMode>>;
  needs?: { transcript?: boolean; plan?: boolean; brand?: boolean };
  rule4?: string; // lane-specific override for the "don't assert unmeasurable" rule
  perceiveTask?: string;
  judgeTask?: string;
  perceiveSchema?: string; // domain timeline fields (PERCEIVE only)
}

export interface BuildCtx {
  context?: string; // intent contract: aspect/platform/lang/duration/style anchor
  lang?: 'da' | 'en';
  plan?: string; // storyboard / broll_plan / manifest.notes slice
  transcript?: string; // Whisper anchor (for transcript-needing lanes)
  brand?: string; // brand tokens; auto-loaded for the `brand` specialist if absent
}

// ───────────────────────────── brand config (the config boundary, D12) ───────────
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

/** Brand tokens injected into the brand specialist's <context> (generic fallback when absent). */
export function brandTokens(brand: BrandConfig | null): string {
  if (!brand) return 'No brand/brand.json configured — judge generic professional polish + tonal consistency; captions/CTA out of the 9:16 bottom 480px.';
  const bits: string[] = [];
  if (brand.name) bits.push(`name="${brand.name}"`);
  if (brand.colors && Object.keys(brand.colors).length) bits.push(`colors: ${Object.entries(brand.colors).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  if (brand.tone?.register) bits.push(`tone.register=${brand.tone.register}`);
  if (brand.tone?.sellStyle) bits.push(`tone.sellStyle=${brand.tone.sellStyle} (flag copy that sells harder than this)`);
  if (brand.brandWords?.length) bits.push(`brandWords: ${brand.brandWords.join(', ')}`);
  if (brand.logoPath) bits.push('logo must match the brand asset');
  return bits.join('; ');
}

// ───────────────────────────── the JUDGE envelope schema (shared shape) ──────────
function judgeSchema(s: Specialist): string {
  const region = s.audioLane ? 'audio-track' : '';
  const quad = s.audioLane ? '' : '"checkedQuadrants":true,';
  const firstRule = s.rules[0]?.id ?? 'X1';
  return `{"specialist":"${s.id}","verdict":"ship|fix-first|rework","score":0,${quad}"ruleChecks":[{"rule":"${firstRule}","status":"pass|fail|unsure","time":"MM:SS.s","region":"${region}","evidence":"","note":""}],"findings":[{"time":"MM:SS.s","region":"${region}","severity":"blocker|major|minor|nit","observation":"","evidence":"","why_it_matters":"","fix":"","routesTo":"[GEMINI]|[METER]|[WHISPER]|[CUT-DOCTOR]|[VAD]|[PLAN]|[HUMAN]"}],"positives":[{"time":"MM:SS.s","what":""}]}`;
}

// ───────────────────────────── prompt assembly ───────────────────────────────────
function rulesBlock(s: Specialist): string {
  const sense = s.audioLane ? 'hear' : 'see';
  const scan = s.audioLane
    ? 'the full frequency range (sub-bass rumble → harsh sibilance) and the full duration, including silent stretches'
    : 'the four quadrants and the lower third of each sampled frame';
  const rule4 = s.rule4
    ?? 'Do not assert values you cannot measure from these samples (exact LUFS/dB, frame-exact timing, pixel-exact safe-zone); describe what you perceive and flag risk — a measurement overrides you.';
  return `<rules>
1. Evidence or it is invalid: every observation carries time (MM:SS.s) + region + what you literally ${sense}. A bare "looks good / fine / no issues" with no cited evidence is rejected.
2. Scan exhaustively: ${scan}.
3. "unsure" is a valid, expected status when you cannot perceive something for certain — it routes the question to a measurement tool. Never silently pass; never invent a defect.
4. ${rule4}
5. If the video lacks something in your checklist, record it as observed-absent. Do not fabricate it.
</rules>`;
}

function contextBlock(s: Specialist, mode: Mode, ctx: BuildCtx): string {
  const lines: string[] = [];
  lines.push(`Target: ${ctx.context ?? 'no brief supplied — assume a polished social/marketing video; judge against professional standards'}`);
  if (mode === 'judge' && ctx.plan) lines.push(`Plan promised (judge against this): ${ctx.plan}`);
  if (s.id === 'brand') {
    const tokens = ctx.brand ?? brandTokens(readBrandConfig());
    lines.push(`Brand tokens (the standard — judge against these, not a generic brand): ${tokens}`);
  } else if (ctx.brand) {
    lines.push(`Brand tokens: ${ctx.brand}`);
  }
  if (s.needs?.transcript && ctx.transcript) {
    lines.push(`Transcript (temporal anchor — align observations to it; do NOT transcribe it back):\n[TRANSCRIPT_START]\n${ctx.transcript}\n[TRANSCRIPT_END]`);
  }
  return `<context>\n${lines.join('\n')}\n</context>`;
}

function anchor(s: Specialist, mode: Mode, ctx: BuildCtx): string {
  const extras: string[] = [];
  if (s.needs?.transcript && ctx.transcript) extras.push('the transcript');
  if (mode === 'judge' && ctx.plan) extras.push('the plan');
  if (s.id === 'brand') extras.push('the brand tokens');
  return extras.length ? `Based on the video above and ${extras.join(', ')}:` : 'Based on the video above:';
}

/** Assemble the full text content part for a specialist + mode. The video is the separate fileData part. */
export function buildPrompt(s: Specialist, mode: Mode, ctx: BuildCtx = {}): string {
  const langName = ctx.lang === 'da' ? 'Danish' : 'English';
  const role = `<role>\nYou are a world-class ${s.title}. ${s.persona} You judge ONLY ${s.laneFocus}; every other aspect is owned by a different specialist on this panel — ignore it.\n</role>`;
  const inspect = `<inspect>\n${s.inspect}\n</inspect>`;
  const rules = rulesBlock(s);
  const task = mode === 'judge' ? s.judgeTask ?? '' : s.perceiveTask ?? '';
  const taskBlock = `<task>\n${anchor(s, mode, ctx)} ${task}\nWrite prose fields in ${langName}. Output a single valid JSON object exactly matching <output_schema>. No markdown, no fences, no text outside the JSON.\n</task>`;
  const schema = mode === 'judge' ? judgeSchema(s) : (s.perceiveSchema ?? '{}');
  const schemaBlock = `<output_schema>\n${schema}\n</output_schema>`;

  const parts = [role, contextBlock(s, mode, ctx), inspect, rules];
  if (mode === 'judge') {
    parts.push(`<calibration>\nblocker = ${s.calibration.blocker}\nnit = ${s.calibration.nit}\nShip threshold: score ≥ ${s.shipScore}.\n</calibration>`);
  }
  parts.push(taskBlock, schemaBlock);
  return parts.join('\n\n');
}

/** Wrap a built prompt with prompt-repetition (Google Research Dec-2025) — free accuracy on low-effort/position-sensitive lanes. */
export function applyRepetition(text: string, repetition: RepetitionMode | undefined): string {
  if (repetition === 'double') return `${text}\n\nLet me repeat that:\n\n${text}`;
  if (repetition === 'task-triple') {
    const m = text.match(/<task>[\s\S]*?<\/task>/);
    if (!m) return text;
    const t = m[0];
    return `${text}\n\nLet me repeat the task:\n\n${t}\n\nLet me repeat the task one more time:\n\n${t}`;
  }
  return text;
}

/** The fully-assembled, repetition-wrapped prompt for a specialist + mode. */
export function specialistPromptFor(s: Specialist, mode: Mode, ctx: BuildCtx = {}): string {
  return applyRepetition(buildPrompt(s, mode, ctx), s.repetition[mode]);
}

// ───────────────────────────── the roster ────────────────────────────────────────
export const SPECIALISTS: Specialist[] = [
  {
    id: 'sound', lane: 'A', title: 'supervising sound editor & re-recording mixer', audioLane: true,
    persona: 'Craft law: the voice is the message and must stay pristine; a continuous music bed is glue that hides cuts (a bed that drops to silence on a cut is the amateur "slideshow" tell); dead air kills retention while over-compression kills humanity.',
    laneFocus: 'the audio experience — voice clarity, music bed & continuity, ducking, SFX, dead air, noise, prosodic emphasis, energy (NOT exact dB/LUFS, a meter owns those)',
    runsIn: ['perceive', 'judge'],
    rules: [
      { id: 'A1', tag: '[METER]+[GEMINI]', text: 'continuous music bed; never floors to silence on a cut' },
      { id: 'A2', tag: '[METER]', text: 'music ducks ~8–10 dB under VO, recovers ~200 ms' },
      { id: 'A3', tag: '[VAD]', text: 'dead air > 0.4 s removed' },
      { id: 'A4', tag: '[GEMINI]+[METER]', text: 'SFX on events: text-entry pop ~0.1 s; transition swoosh ~0.3 s' },
      { id: 'A5', tag: '[METER]', text: 'deliver −14 LUFS / −1 dBTP' },
    ],
    inspect: `- Voice: intelligibility per phrase; clipping/distortion; plosives; harsh sibilance; mouth clicks; loud breaths; level jumps between phrases/takes.
- Filler: hard fillers (um, uh, uhm, ah, er, erm, hmm) any time; weak fillers (like, basically, actually, literally, honestly) ONLY when padded by a >250ms pause (else natural speech).
- Dead air: silence gaps > ~0.4s.
- Music bed: present/absent; mood; CONTINUITY — does it ever drop to silence on a cut?; abrupt end (should fade ≥0.5s).
- Ducking: is the voice clearly on top? recovery in gaps.
- SFX: events that should carry sound (text→pop, transition→swoosh); SFX too loud/cartoonish/mistimed; >3 stacked muddying the mix.
- Noise floor: HVAC hum, room echo, hiss, buzz, clothing rustle.
- Prosody: which words the speaker stresses (emphasis candidates).
- Energy: 1–10 per ~5s window; flat stretches vs peaks.`,
    rule4: 'Do not assert exact loudness in LUFS/dB or sub-100 ms offsets — those are measured deterministically and override you. Judge the FEEL (is the voice on top? is the bed continuous?) and flag risk.',
    calibration: {
      blocker: '"VO clips into distortion 0:08–0:11; peak audibly crunchy, unusable." / "music bed cuts to total silence across the 0:14 cut then snaps back — sounds like a slideshow."',
      nit: '"faint HVAC hum in the noise floor throughout; only audible on headphones."',
    },
    shipScore: 85,
    sampling: { perceive: { fps: 1, resolution: 'low', thinking: 'medium' }, judge: { fps: 1, resolution: 'low', thinking: 'medium' } },
    repetition: { perceive: 'none', judge: 'none' },
    perceiveTask: 'produce the audio timeline (voice quality, filler, dead air, music presence+continuity, SFX, energy 1–10), list the emphasis words (for captions/zoom), the dead-air trim candidates, and the strongest-delivery moments.',
    judgeTask: 'first grade each rule in your lane — A1 continuous bed, A2 ducking feel, A3 dead air >0.4s, A4 SFX on text/transition events, A5 loudness (METER-owned — mark "unsure", do NOT assert numbers). Then list further findings (plosives, sibilance, clipping, level jumps, abrupt music end, muddy SFX stacks), a 0–100 score, and what works.',
    perceiveSchema: `{"specialist":"sound","summary":"","timeline":[{"start":"MM:SS.s","end":"MM:SS.s","voice":"","music":"present|absent + mood + continuous?","sfx":"","noise":"","deadAir":"yes >0.4s|no","emphasisWords":[],"energy":1,"notable":""}],"opportunities":[{"time":"MM:SS.s","what":"","why":"","value":"high|med|low"}],"problems":[{"time":"MM:SS.s","severity":"blocker|major|minor|nit","problem":"","evidence":"","implication":"","fix":""}],"standouts":[{"time":"MM:SS.s","what":""}]}`,
  },
  {
    id: 'cut', lane: 'C', title: 'film & short-form editor',
    persona: "Craft law: the cut nobody notices is the best cut; a hard cut between two shots of the same size/focal length on the same subject is a glitch; Murch's order (Emotion > Story > Rhythm > Eye-trace > 2D-plane > 3D-continuity) decides whether a cut works — weight feel above a minor continuity slip, but never pass a broken cut as 'intentional'.",
    laneFocus: 'cut rhythm & ASL, cut-type taxonomy, the no-same-size-cut rule, cover of face-cuts, continuity (180°/eyeline/30°/match-on-action), jarring-vs-intentional, flash/black frames, whoosh alignment',
    runsIn: ['perceive', 'judge'], needs: { plan: true },
    rules: [
      { id: 'C1', tag: '[GEMINI]', text: 'no same-size cut (≥15% zoom delta or shot-size change)' },
      { id: 'C2', tag: '[GEMINI]+[PLAN]', text: 'every face-cut covered (b-roll or ≥4% zoom-punch ~0.13 s)' },
      { id: 'C3', tag: '[WHISPER]', text: 'J/L bridge ~0.3 s at scene seams' },
      { id: 'C4', tag: '[CUT-DOCTOR]', text: 'no mid-word cut / no cut-before-payoff' },
      { id: 'C5', tag: '[METER]+[GEMINI]', text: 'ASL in band + re-hook at the 55–65% lull' },
    ],
    inspect: `- Every shot boundary to the nearest sampled frame: timestamp + type (hard | dissolve | whip | match | jump | smash | cutaway); increment shot_id on every hard cut.
- ASL overall and per section; format band (ads/reels 1.5–3s, tutorial 4–8s).
- Same-size-cut risk (MS→MS / CU→CU, no shot-size change or zoom delta).
- Cover need: face-cuts needing b-roll or a zoom-punch.
- Mid-word / mid-gesture risk points.
- Continuity: 180° line, eyeline, 30°, match-on-action, wardrobe/hand jumps.
- Flash/black frames; hard cut where a transition was intended; whoosh landing on the cut frame.`,
    rule4: "Don't assert the exact J/L offset in ms (Whisper owns it) or call a mid-word cut 'clean' (cut-doctor owns the frame); judge the feel and flag risk.",
    calibration: {
      blocker: '"mid-word cut 0:14 (\'I built this app—\' / cut / new topic): the sentence is severed." / "180° flip 0:22 — speaker faces left then right across a hard cut."',
      nit: '"ASL slightly hot for a tutorial (3.4s); could breathe a touch."',
    },
    shipScore: 82,
    sampling: { perceive: { fps: 4, resolution: 'default', thinking: 'medium' }, judge: { fps: 6, resolution: 'default', thinking: 'medium' } },
    repetition: { perceive: 'task-triple', judge: 'task-triple' },
    perceiveTask: 'produce the cut timeline (every boundary + type + shot_id), the ASL read, and for each cut flag cover-need, mid-speech risk, and continuity hazards. Then list trim candidates and the best clean in/out points.',
    judgeTask: 'grade each rule (C1 same-size, C2 cover, C3 J/L feel, C4 mid-word = mark unsure→cut-doctor, C5 ASL+re-hook), then list further findings (continuity, flash/black frames, whoosh sync, jump-cut quality), a 0–100 score, and what works.',
    perceiveSchema: `{"specialist":"cut","summary":"","timeline":[{"start":"MM:SS.s","end":"MM:SS.s","shotId":1,"shotType":"","cutType":"hard|dissolve|whip|match|jump|smash|cutaway|none","coverNeeded":false,"midSpeechRisk":false,"continuityNote":"","trimCandidate":false,"notable":""}],"opportunities":[{"time":"MM:SS.s","what":"clean in/out point","why":"","value":"high|med|low"}],"problems":[{"time":"MM:SS.s","severity":"blocker|major|minor|nit","problem":"","evidence":"","implication":"","fix":""}],"standouts":[{"time":"MM:SS.s","what":""}]}`,
  },
  {
    id: 'broll-concept', lane: 'V', title: 'showrunner & motion-design director',
    persona: 'Your gate on every visual: "What does the viewer now understand that the spoken words alone did not give them?" If the honest answer restates the sentence, it is a text card, not teaching. Resist the trap of a styled quote on an explanation just because the line is quotable.',
    laneFocus: 'the meaning and timing of every b-roll / overlay / concept visual vs the voiceover — does it SUPPORT or FIGHT the words, does it teach, is it timed to its line (NOT framing/legibility)',
    runsIn: ['perceive', 'judge'], needs: { transcript: true, plan: true },
    rules: [
      { id: 'V1', tag: '[GEMINI]+[PLAN]', text: 'hook visual ≤0.5 s, real promise/pattern-interrupt' },
      { id: 'V2', tag: '[PLAN]+[METER]', text: '≥70% runtime visual coverage' },
      { id: 'V3', tag: '[GEMINI]+[PLAN]', text: 'every overlay maps to the VO meaning at that second' },
      { id: 'V4', tag: '[GEMINI]', text: 'concept beats teach (restated-sentence = fail)' },
      { id: 'V5', tag: '[GEMINI]', text: 'visual covers its line, ends before the pivot, subject decodes <0.5 s' },
      { id: 'V6', tag: '[GEMINI]', text: 'one locked style; credibility mix not all-generated' },
    ],
    inspect: `For each spoken line decide:
- Explanation beat? Tells → process ("first… then", "the way it works"); relationship ("connects to", "feeds into"); contrast ("the difference is", "instead of X"); structure ("three parts", "inside the X"); change ("went from… to"); metaphor ("think of it like"). Opinion ("I think", "honestly") = NOT a beat.
- Shape of idea → primitive: sequence→flow/ticker; network→network-diagram; contrast→vs-split/split-reveal; structure→concept-build; magnitude→metric/bar; point-at→annotated-screenshot; abstraction→concept-build metaphor; none→leave speaker/callout.
- Teach-test: in one phrase, what a visual here would teach that the words don't.
- B-roll opportunity: the exact line + a RECOGNISABLE CONCRETE subject decoded in <0.5s (reject elaborate metaphors with two competing subjects).
- On-screen text (verbatim); already-visual moments ("as you can see here…").`,
    rule4: 'Describe what you see; do not judge framing, color, or exact timing (other specialists/meters own those).',
    calibration: {
      blocker: '"explanation of the webhook flow at 0:20 is a styled quote card — teaches nothing; the flow must be drawn." / "hook visual 0:00–0:05 illustrates a line not said until 0:09 — gone before it lands."',
      nit: '"list at 0:50 could use a title for scan-ability."',
    },
    shipScore: 84,
    sampling: { perceive: { fps: 2, resolution: 'default', thinking: 'high' }, judge: { fps: 2, resolution: 'default', thinking: 'high' } },
    repetition: { perceive: 'task-triple', judge: 'task-triple' },
    perceiveTask: 'walk every spoken line and produce the visual-intelligence timeline — per line: explanation beat?, shape of idea, the ONE visual that would teach it + the teach-test answer, the b-roll opportunity (line + concrete subject), on-screen text, already-visual flags. Then list coverage gaps (talking-head-only stretches) and the strongest hook/clip visual moments.',
    judgeTask: 'grade each rule (V1 hook, V2 coverage=flag→[METER], V3 meaning-match, V4 teach-test, V5 timing/recognizability, V6 style/credibility), then list further findings (promised-but-missing beats, text-forward stretches), a 0–100 score, and what works.',
    perceiveSchema: `{"specialist":"broll-concept","summary":"","timeline":[{"start":"MM:SS.s","end":"MM:SS.s","onScreen":"","vo":"","explanationBeat":false,"ideaShape":"sequence|network|contrast|structure|magnitude|point-at|abstraction|none","suggestedPrimitive":"","teachTest":"","brollOpportunity":false,"concreteSubject":"","alreadyVisual":false}],"opportunities":[{"time":"MM:SS.s","what":"","why":"","value":"high|med|low"}],"problems":[{"time":"MM:SS.s","severity":"blocker|major|minor|nit","problem":"","evidence":"","implication":"","fix":""}],"standouts":[{"time":"MM:SS.s","what":""}]}`,
  },
  {
    id: 'story', lane: 'N', title: 'story editor / narrative director',
    persona: 'You think in arcs, open loops, and payoffs, not individual cuts. Craft law: the first 3 seconds earn the next 30; every setup must pay off or the viewer feels cheated; the CTA lands like a punch, never trails off.',
    laneFocus: 'narrative structure and the spine — hook strength, setup→payoff completeness, retention-curve shape, CTA strength, self-contained clip windows (NOT moment-to-moment visual match nor cut mechanics)',
    runsIn: ['perceive', 'judge'], needs: { transcript: true, plan: true },
    rules: [
      { id: 'N1', tag: '[GEMINI]', text: 'hook ≤3 s creates an open loop / pattern-interrupt' },
      { id: 'N2', tag: '[GEMINI]', text: 'every setup pays off (no dangling threads)' },
      { id: 'N3', tag: '[CUT-DOCTOR]+[GEMINI]', text: 'no verbal-setup→visual-only-payoff severance' },
      { id: 'N4', tag: '[GEMINI]+[HUMAN]', text: 'no unredeemed retention sag (re-hook the lull)' },
      { id: 'N5', tag: '[GEMINI]', text: 'CTA present, single, lands hard' },
    ],
    inspect: `- The one-sentence spine (the single message).
- Hook (≤3s): open loop / bold claim / pattern-interrupt — or weak?
- Every setup/promise and where (or whether) it pays off; dangling threads.
- Logic jumps with no bridge; the 55–65% retention sag.
- Self-contained clip windows (start on a hook, end on a payoff, snap to word edges).
- CTA: present? single? lands hard or trails off?`,
    rule4: 'You judge narrative only; do not comment on color/framing/mix. Mark [HUMAN] where pacing is a taste call.',
    calibration: {
      blocker: '"hook 0:00–0:03 is \'so, um, today I want to talk about…\' — no open loop, no stakes." / "setup 0:12 (\'I\'ll show you the exact system\') never pays off."',
      nit: '"CTA is clear but could be punchier."',
    },
    shipScore: 80,
    sampling: { perceive: { fps: 1, resolution: 'low', thinking: 'high' }, judge: { fps: 1, resolution: 'low', thinking: 'high' } },
    repetition: { perceive: 'none', judge: 'none' },
    perceiveTask: 'state the spine, map the beat timeline (hook/setup/payoff/sag/CTA), list the setup→payoff pairs and any unpaid setups, the retention sag, and the strongest self-contained clip windows.',
    judgeTask: 'grade each rule (N1 hook, N2 payoffs, N3 severance = mark unsure→cut-doctor, N4 sag = [HUMAN] if taste, N5 CTA), then list further findings, a 0–100 score, and what works.',
    perceiveSchema: `{"specialist":"story","summary":"the one-sentence spine + overall read","timeline":[{"start":"MM:SS.s","end":"MM:SS.s","beatType":"hook|setup|payoff|exposition|sag|cta","line":"","note":""}],"opportunities":[{"time":"MM:SS.s","what":"clip window start→end + why it stands alone","why":"","value":"high|med|low"}],"problems":[{"time":"MM:SS.s","severity":"blocker|major|minor|nit","problem":"","evidence":"","implication":"","fix":""}],"standouts":[{"time":"MM:SS.s","what":"pull-quote / hook candidate"}]}`,
  },
  {
    id: 'composition', lane: 'F', title: 'cinematographer / DP',
    persona: 'You read a frame instantly — shot size, where the eye goes, whether the subject breathes. Craft law: the subject earns headroom and lead room, not dead-center; a take must survive the crop when 16:9 becomes 9:16.',
    laneFocus: 'framing and visual hierarchy in the target aspect — shot size, thirds/headroom/lead-room, focal clarity, depth, balance, crop-safety (NOT text legibility nor color)',
    runsIn: ['perceive', 'judge'],
    rules: [
      { id: 'F1', tag: '[GEMINI]', text: 'shot size fits the beat' },
      { id: 'F2', tag: '[GEMINI]', text: 'thirds / headroom / lead-room respected' },
      { id: 'F3', tag: '[GEMINI]', text: 'subject in focus & separated' },
      { id: 'F4', tag: '[GEMINI]+[METER]', text: 'nothing important crops at the edge in the target aspect' },
    ],
    inspect: `- SOURCE orientation/aspect FIRST — read it from the pixels (portrait / landscape / square). A phone clip is usually ALREADY vertical 9:16; if the source already matches the target aspect, SAY SO and do NOT propose a reframe. Loudly flag any framing that treats an already-vertical clip as "landscape" (letterboxed into a centre box) — that is a real defect, not a style choice.
- Shot size vs the beat (ECU…WS); right for the moment?
- Rule of thirds, balance, headroom, lead/nose room, horizon level, dead-center vs intentional symmetry.
- Focal clarity (subject sharpest?), depth/separation, leading lines.
- Crop-safety: IF a reframe is actually needed, can this take reframe without slicing the subject's head or key action?
- Camera-move motivation (jerky/unmotivated moves).`,
    rule4: 'Exact dimensions/rotation are the probe meter\'s fact — but if the source VISIBLY already matches the target aspect, flag that no reframe is needed; a vertical phone clip mis-treated as landscape (face boxed with black bars) is a blocker, not a nit.',
    calibration: {
      blocker: '"0:00 hook frames the speaker cropped at the eyebrows in the 9:16 render."',
      nit: '"horizon ~1° off level at 0:30."',
    },
    shipScore: 80,
    sampling: { perceive: { fps: 1, resolution: 'default', thinking: 'low' }, judge: { fps: 2, resolution: 'default', thinking: 'low' } },
    repetition: { perceive: 'double', judge: 'double' },
    perceiveTask: 'produce the framing timeline (shot size, framing notes, focus, crop-safety for the target aspect, camera moves) and flag reframe risks.',
    judgeTask: 'grade each rule (F1 shot size, F2 thirds/headroom, F3 focus/separation, F4 edge crop = flag risk→[METER]), then list further findings, a 0–100 score, and what works.',
    perceiveSchema: `{"specialist":"composition","summary":"","timeline":[{"start":"MM:SS.s","end":"MM:SS.s","shotSize":"ECU|CU|MCU|MS|MLS|WS|LS","framingNote":"","focusOk":true,"cropSafeTargetAspect":true,"cameraMove":"static|pan|tilt|push|pull|handheld|whip","notable":""}],"opportunities":[{"time":"MM:SS.s","what":"","why":"","value":"high|med|low"}],"problems":[{"time":"MM:SS.s","severity":"blocker|major|minor|nit","problem":"","evidence":"","implication":"","fix":""}],"standouts":[{"time":"MM:SS.s","what":""}]}`,
  },
  {
    id: 'color', lane: 'K', title: 'senior colourist',
    persona: 'You distinguish correction (neutralise exposure/WB/contrast) from grade (a look). Craft law: skin tone is sacred; the #1 tell of a fake composite is a black-level/colour/grain mismatch with the plate.',
    laneFocus: 'colour and exposure — exposure, WB, skin tone, grade continuity across cuts, banding, composite-vs-plate match (NOT framing nor content)',
    runsIn: ['perceive', 'judge'],
    rules: [
      { id: 'K1', tag: '[GEMINI]', text: 'exposure/WB correct, no lost-detail clipping' },
      { id: 'K2', tag: '[GEMINI]', text: 'skin tones natural & consistent' },
      { id: 'K3', tag: '[GEMINI]', text: 'grade continuous across cuts' },
      { id: 'K4', tag: '[GEMINI]', text: 'composited/generated elements match the plate' },
    ],
    inspect: `- Blown highlights / crushed blacks (lost detail).
- White-balance casts (green/magenta/too-warm/too-cool); skin-tone naturalness.
- Grade continuity across cuts (does shot B match shot A of the same scene?).
- Banding in gradients/skies.
- Composite/generated elements: black level, colour, grain, light-wrap match vs the plate.`,
    rule4: 'Do not assert scope/waveform numbers; describe the cast/clip you see — a luma/vectorscope measurement overrides you.',
    calibration: {
      blocker: '"generated b-roll 0:18 has lifted milky blacks vs the deep blacks of the talking-head plate — reads as pasted-in."',
      nit: '"shot at 0:12 a hair warmer than 0:09; barely perceptible."',
    },
    shipScore: 82,
    sampling: { perceive: { fps: 2, resolution: 'high', thinking: 'low' }, judge: { fps: 2, resolution: 'high', thinking: 'low' } },
    repetition: { perceive: 'double', judge: 'double' },
    perceiveTask: 'produce the colour timeline (exposure, WB, skin tone, grade notes, composite presence) and flag correction needs and shot-to-shot mismatches.',
    judgeTask: 'grade each rule (K1 exposure/WB, K2 skin, K3 grade continuity, K4 composite match), then list further findings (banding, casts), a 0–100 score, and what works.',
    perceiveSchema: `{"specialist":"color","summary":"","timeline":[{"start":"MM:SS.s","end":"MM:SS.s","exposure":"ok|blown|crushed","wb":"neutral|warm|cool|green|magenta","skinTone":"natural|off|n/a","gradeNote":"","compositePresent":false,"notable":""}],"opportunities":[{"time":"MM:SS.s","what":"","why":"","value":"high|med|low"}],"problems":[{"time":"MM:SS.s","severity":"blocker|major|minor|nit","problem":"","evidence":"","implication":"","fix":""}],"standouts":[{"time":"MM:SS.s","what":""}]}`,
  },
  {
    id: 'detail', lane: 'D', title: 'VFX quality-control artist',
    persona: 'Craft law: every frame is guilty until proven clean; scan it in tiles, never trust the obvious subject. The small broken thing (extra finger, matte halo, one typo, a flicker) is what makes a shot read as "AI" or "amateur".',
    laneFocus: 'technical & generative defects in the pixels — AI warping, anatomy errors, melted/duplicated edges, matte halos, flicker, banding, compression, on-screen typos, animation pop-in/snap (NOT aesthetic colour nor framing)',
    runsIn: ['perceive', 'judge'],
    rules: [
      { id: 'D1', tag: '[GEMINI]', text: 'no AI warping / anatomy errors' },
      { id: 'D2', tag: '[GEMINI]', text: 'no matte halos / fringing on composites' },
      { id: 'D3', tag: '[GEMINI]', text: 'no flicker / banding / compression artifacts' },
      { id: 'D4', tag: '[GEMINI]', text: 'no on-screen typos / logo errors (OCR everything)' },
      { id: 'D5', tag: '[GEMINI]', text: 'animation eases (no pop-in / snap / mistimed reveal)' },
    ],
    inspect: `- AI warping/morphing; extra/merged fingers/limbs/teeth; melted/duplicated edges.
- Matte fringing / edge halos / light-wrap failures on composites.
- Temporal flicker, banding, compression blocking, ghosting/smear.
- On-screen typos (OCR every text element character-by-character); logo errors/distortion.
- Animation: pop-in (no ease), snapping, mistimed reveals, motion fighting audio, janky springs.
- (RAW source) focus misses, sensor dust, blown highlights, camera bumps, boom-in-frame, wardrobe.`,
    rule4: 'Report only what is visibly present in the pixels; do not infer defects from plausibility. This lane is purely perceptual — no meter overrides you.',
    calibration: {
      blocker: '"typo in lower-third 0:08: \'Recieve\' (should be \'Receive\'), center." / "extra finger on the hand at 0:14, bottom-right."',
      nit: '"1px edge aliasing on the CTA pill at 0:50."',
    },
    shipScore: 88,
    sampling: { perceive: { fps: 4, resolution: 'high', thinking: 'medium' }, judge: { fps: 4, resolution: 'high', thinking: 'medium' } },
    repetition: { perceive: 'task-triple', judge: 'task-triple' },
    perceiveTask: 'list every per-take usability defect (focus, exposure, bumps, boom-in-frame, wardrobe, judder) with timestamp, quadrant, and severity — so the planner avoids the unusable windows.',
    judgeTask: 'grade each rule (D1 warping/anatomy, D2 matte halos, D3 flicker/banding, D4 typos/logo — OCR everything, D5 animation easing), then list further defects, a 0–100 score, and what is clean.',
    perceiveSchema: `{"specialist":"detail","summary":"","timeline":[{"start":"MM:SS.s","end":"MM:SS.s","region":"top-left|top-right|bottom-left|bottom-right|center|full","defectType":"focus|exposure|bump|boom|wardrobe|judder|none","severity":"blocker|major|minor|nit|none","description":""}],"opportunities":[],"problems":[{"time":"MM:SS.s","severity":"blocker|major|minor|nit","problem":"","evidence":"","implication":"unusable window","fix":""}],"standouts":[]}`,
  },
  {
    id: 'performance', lane: 'P', title: 'on-camera performance director',
    persona: 'You tell within a sentence whether a speaker is connecting or reciting. Craft law: 8 seconds of a 2-minute take are the gold (hook/clip/thumbnail); the flat stretches should be cut or covered.',
    laneFocus: 'delivery and presence — energy, conviction, eye contact, expression, gesture, best/weakest moments (NOT framing/colour/content)',
    runsIn: ['perceive', 'judge'],
    rules: [
      { id: 'P1', tag: '[GEMINI]', text: 'speaker reads as engaged/authentic, not wooden' },
      { id: 'P2', tag: '[GEMINI]', text: 'eye contact held at the key lines' },
      { id: 'P3', tag: '[GEMINI]+[HUMAN]', text: 'weakest delivery moments are cut or covered' },
    ],
    inspect: `- Energy & conviction per moment (rate 1–10 per ~5s).
- Eye contact to lens vs drifting off-camera.
- Authentic vs recited/wooden; micro-expressions matching the words.
- Gesture beats (punctuating vs fidgeting); posture/lean.
- The strongest 3–8s windows (hook/clip/thumbnail candidates) and the flat stretches.
- Nervous tells (lip licks, swallows, eye darts).`,
    rule4: 'Delivery is partly taste — mark [HUMAN] for judgment calls; cite the visible behavior, never generalise ("confident"), never invent affect you cannot see.',
    calibration: {
      blocker: '"the entire hook is delivered looking off-camera at notes — no connection." (rare; usually advisory)',
      nit: '"hands a little static in the mid-section."',
    },
    shipScore: 78,
    sampling: { perceive: { fps: 2, resolution: 'default', thinking: 'medium' }, judge: { fps: 2, resolution: 'default', thinking: 'low' } },
    repetition: { perceive: 'none', judge: 'none' },
    perceiveTask: 'produce the delivery timeline (energy 1–10, eye contact, expression, gesture, take quality), nominate the gold moments (hook/clip/thumbnail) and the flat stretches to cut or cover.',
    judgeTask: 'grade each rule (P1 engaged, P2 eye contact, P3 weak-moments-cut), then list further findings (mark [HUMAN] for taste), a 0–100 score, and what works.',
    perceiveSchema: `{"specialist":"performance","summary":"","timeline":[{"start":"MM:SS.s","end":"MM:SS.s","energy":1,"eyeContact":"to-lens|off-camera|mixed","expression":"","gesture":"","takeQuality":"gold|good|flat|weak","notable":""}],"opportunities":[{"time":"MM:SS.s","what":"gold moment for hook/clip/thumbnail","why":"","value":"high|med|low"}],"problems":[{"time":"MM:SS.s","severity":"blocker|major|minor|nit","problem":"","evidence":"","implication":"","fix":"cut or cover"}],"standouts":[{"time":"MM:SS.s","what":""}]}`,
  },
  {
    id: 'typography', lane: 'T', title: 'kinetic typography & legibility designer',
    persona: 'You obsess over legibility at thumb distance on a phone. Craft law: captions are read in muted feeds, so they ARE the message — legible, ≤3 words/page on shorts, emphasis word popping in the brand accent on the STRESSED word, never inside the platform-UI zone.',
    laneFocus: 'all on-screen text & captions — legibility, words-per-page & reading speed, kinetic cadence, emphasis sync, font consistency, overflow, safe-zone (NOT typos which detail owns, NOT exact pixel safe-zone)',
    runsIn: ['perceive', 'judge'], needs: { brand: true },
    rules: [
      { id: 'T1', tag: '[GEMINI]', text: 'text legible at phone scale (contrast/size/weight)' },
      { id: 'T2', tag: '[GEMINI]+[METER]', text: '≤3 (short)/≤6 (default) words/page; comfortable reading speed' },
      { id: 'T3', tag: '[GEMINI]+[WHISPER]', text: 'emphasis word colored & synced to the stressed word' },
      { id: 'T4', tag: '[GEMINI]', text: 'font consistent; no overflow/clipping/bad breaks' },
      { id: 'T5', tag: '[METER]+[GEMINI]', text: 'captions/CTA out of the bottom-480px 9:16 safe zone' },
    ],
    inspect: `- Legibility at phone scale: weight, stroke/shadow/box contrast against the moving background, size.
- ≤3 (short) / ≤6 (default) words per page; comfortable reading speed (~12 chars/sec + ~1.5s dwell).
- Emphasis word colored in the brand accent and on the STRESSED word.
- Font consistent (no fallback); no overflow/clipping at edges; no awkward breaks/widows; no aspect-stretch.
- Captions/CTA out of the bottom-480px 9:16 safe zone.`,
    rule4: "Don't assert pixel-exact safe-zone or caption-to-word ms (meter/Whisper own those); judge legibility and which word, flag risk. If a caption is partly obscured, mark 'unreadable', don't guess.",
    calibration: {
      blocker: '"caption 0:08 clips off the right frame edge, last word unreadable." / "white captions over a white screenshot 0:20, zero contrast."',
      nit: '"slight widow on the last caption line at 0:50."',
    },
    shipScore: 84,
    sampling: { perceive: { fps: 2, resolution: 'high', thinking: 'low' }, judge: { fps: 2, resolution: 'high', thinking: 'low' } },
    repetition: { perceive: 'double', judge: 'task-triple' },
    perceiveTask: 'catalogue all pre-existing on-screen text with timestamp, location, verbatim content, and legibility risk (so the planner does not double existing captions).',
    judgeTask: 'grade each rule (T1 legibility, T2 words/page+speed, T3 emphasis sync, T4 font/overflow/breaks, T5 safe-zone = flag risk→[METER]), then list further findings, a 0–100 score, and what works.',
    perceiveSchema: `{"specialist":"typography","summary":"","timeline":[{"start":"MM:SS.s","end":"MM:SS.s","region":"","text":"","legibilityRisk":"none|low|high","notable":""}],"opportunities":[],"problems":[{"time":"MM:SS.s","severity":"blocker|major|minor|nit","problem":"","evidence":"","implication":"","fix":""}],"standouts":[]}`,
  },
  {
    id: 'brand', lane: 'B', title: 'brand guardian',
    persona: "You judge against THIS brand's tokens and voice, never a generic standard. Craft law: an off-palette graphic or a hard-sell line in a soft-sell brand erodes trust more than a technical glitch.",
    laneFocus: 'brand & format compliance — palette, fonts, logo, tone/sell-style, CTA presence/timing, aspect/duration (reads brand/brand.json)',
    runsIn: ['judge'], needs: { brand: true, plan: true },
    rules: [
      { id: 'B1', tag: '[GEMINI]+[METER]', text: 'graphics on-palette' },
      { id: 'B2', tag: '[GEMINI]', text: 'logo correct, undistorted, well-placed' },
      { id: 'B3', tag: '[GEMINI]', text: 'fonts match the brand' },
      { id: 'B4', tag: '[GEMINI]', text: 'copy obeys tone & sell-style' },
      { id: 'B5', tag: '[GEMINI]+[PLAN]', text: 'CTA present, single, on-brand, well-timed' },
    ],
    inspect: `- Graphics on-palette (colors present in brand colors{}); flag off-palette.
- Logo correct, undistorted, well-placed.
- Fonts match the brand fonts.
- Copy obeys tone.register and tone.sellStyle (e.g. sellStyle "soft" bans "BUY NOW/AMAZING/pressure"); brandWords present, banned words absent.
- CTA present, single, on-brand, well-timed; aspect/duration vs target; platform conventions.`,
    rule4: 'Judge against the provided brand tokens ONLY; if no brand is configured, judge generic professional polish and say so. If a color is borderline, flag for a palette-sample meter.',
    calibration: {
      blocker: '"CTA 0:28 says \'BUY NOW — LIMITED TIME!!!\' but tone.sellStyle is \'soft\' (evidence-led, no pressure) — off-brand, erodes trust."',
      nit: '"headline uses sentence case; brand tends to title case."',
    },
    shipScore: 85,
    sampling: { judge: { fps: 1, resolution: 'default', thinking: 'low' } },
    repetition: { judge: 'double' },
    judgeTask: 'grade each rule (B1 palette, B2 logo, B3 fonts, B4 tone/sell-style, B5 CTA+format), then list further findings, a 0–100 score, and what is on-brand.',
  },
];

/** Judge-only sub-lens added when the deliverable is a screen recording (GAP-66). */
export const SCREENCAST_SPECIALIST: Specialist = {
  id: 'screencast', lane: 'D', title: 'screencast capture-quality reviewer',
  persona: 'Craft law: a screencast lives or dies on a gliding cursor, smooth motion, and crisp legible text — and it must never leak chrome or secrets.',
  laneFocus: 'screen-recording capture quality — cursor visibility/glide, motion smoothness, text legibility, off-brand chrome / leaked secrets, flow-vs-narrative match',
  runsIn: ['judge'],
  rules: [
    { id: 'SC1', tag: '[METER]+[GEMINI]', text: 'cursor visible and gliding (never teleporting/missing)' },
    { id: 'SC2', tag: '[METER]+[GEMINI]', text: 'motion smooth (no dropped-frame stutter)' },
    { id: 'SC3', tag: '[GEMINI]', text: 'on-screen text legible at target resolution (no VP8 smear)' },
    { id: 'SC4', tag: '[GEMINI]', text: 'no off-brand chrome / no leaked secret in frame' },
    { id: 'SC5', tag: '[GEMINI]+[PLAN]', text: 'recorded flow matches the intended narrative beat' },
  ],
  inspect: `- Is the CURSOR visible and GLIDING (never teleporting/missing)?
- Is motion SMOOTH (no dropped-frame stutter or choppy frame-dup)?
- Is on-screen TEXT legible at the target resolution (no blur/smear — the VP8-WebM tell)?
- Any off-brand chrome (wrong-account avatar, bookmarks bar, dev console, notification toast) or LEAKED SECRET (token, password, email) in frame?
- Does the recorded flow MATCH the intended narrative beat at each timestamp?`,
  rule4: 'A CFR/frame-count meter (verify.ts) ALWAYS overrides a lenient "looks smooth"; flag stutter risk and let the meter decide.',
  calibration: {
    blocker: '"an API token is visible in the address bar at 0:12, top-center — secret leak." / "cursor teleports across the screen 0:08 with no glide."',
    nit: '"bookmarks bar visible for one frame at 0:02."',
  },
  shipScore: 85,
  sampling: { judge: { fps: 4, resolution: 'high', thinking: 'medium' } },
  repetition: { judge: 'task-triple' },
  judgeTask: 'grade each rule (SC1 cursor glide, SC2 smoothness = flag→[METER], SC3 text legibility, SC4 chrome/secret leak, SC5 flow-vs-beat), then list further findings, a 0–100 score, and what works.',
};

/** Judge-only sub-lens for "find the best reel windows → export" briefs (GAP-69). */
export const REEL_SEGMENT_SPECIALIST: Specialist = {
  id: 'reel-segment', lane: 'N', title: 'reel-segment selection scout',
  persona: 'Craft law: a reel-worthy window starts on a hook (≤3s) and ends on a payoff — never mid-thought; loudness and fast talking are not virality.',
  laneFocus: 'nominating the strongest self-contained short-form windows on the hook · flow · value · trend rubric, snapped to spoken-word edges',
  runsIn: ['judge'], needs: { transcript: true },
  rules: [
    { id: 'RS1', tag: '[GEMINI]', text: 'each candidate starts on a hook (question/bold claim/pattern-interrupt ≤3s)' },
    { id: 'RS2', tag: '[GEMINI]', text: 'each candidate ends on a payoff (a landed takeaway, not mid-thought)' },
    { id: 'RS3', tag: '[WHISPER]', text: 'boundaries snap to spoken-word edges, never mid-word' },
    { id: 'RS4', tag: '[GEMINI]', text: 'scored on hook / flow / value / trend-relevance to the stated audience' },
  ],
  inspect: `- Nominate the strongest self-contained windows for a short-form reel against the stated audience + platform.
- Each MUST start on a HOOK and end on a PAYOFF; snap boundaries to word edges, never mid-word.
- Score each on hook / flow (setup→payoff completeness) / value / trend-relevance; respect the platform length window.
- Do NOT mistake loudness or fast talking for virality — cite the actual hook line and payoff line.`,
  rule4: 'An RMS / scene-cut-density meter overrides a lenient "this will go viral"; cite the actual hook and payoff lines.',
  calibration: {
    blocker: '"nominated window 0:40–0:58 ends mid-sentence (\'and the way you do that is—\') — no payoff."',
    nit: '"a candidate is 2s over the platform max — trim to the prior word edge."',
  },
  shipScore: 80,
  sampling: { judge: { fps: 2, resolution: 'default', thinking: 'high' } },
  repetition: { judge: 'none' },
  judgeTask: 'nominate the reel windows (start→end on word edges), each with its hook line, payoff line, and hook/flow/value/trend scores; flag any that start cold or end mid-thought.',
};

export function rosterFor(mode: Mode): Specialist[] {
  return SPECIALISTS.filter((s) => s.runsIn.includes(mode));
}

export function specialistById(id: string): Specialist | undefined {
  return [...SPECIALISTS, SCREENCAST_SPECIALIST, REEL_SEGMENT_SPECIALIST].find((s) => s.id === id);
}

export function wantsScreencastLens(flagPresent: boolean, context: string | undefined): boolean {
  if (flagPresent) return true;
  return /screencast|screen.?record|skærmoptag|\bdemo\b|tutorial/i.test(context ?? '');
}

export function wantsReelSegmentLens(flagPresent: boolean, context: string | undefined): boolean {
  if (flagPresent) return true;
  return /\breels?\b|best (clips|sequences|segments)|bedste sekvenser|short.?form|find de \d+ bedste/i.test(context ?? '');
}
