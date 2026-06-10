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
    inspect: `- Voice: intelligibility per phrase; clipping/distortion; plosives (p/b pops into the mic); harsh sibilance (over-bright esses) AND the opposite lisp of over-de-essing; mouth clicks/saliva; loud breaths; level jumps between phrases/takes.
- The EDIT is audible even with eyes closed: room-tone/"air" discontinuity at a cut (the ambience signature changes = audible seam); a reverb or breath tail amputated mid-decay; a breath cut mid-intake; a double-breath from overlapping takes; a word onset clipped by an over-eager gate.
- Processing damage: denoiser "underwater"/musical-noise artifacts; over-compression pumping (the whole mix audibly breathing); robotic over-tuned timing.
- Filler: hard fillers (um, uh, uhm, ah, er, erm, hmm) any time; weak fillers (like, basically, actually, literally, honestly) ONLY when padded by a >250ms pause (else natural speech).
- Dead air: silence gaps > ~0.4s.
- Music bed: present/absent; mood — and does the mood/genre/key FIGHT the emotional content of the words at that moment?; CONTINUITY — does it ever drop to silence on a cut?; an audible loop/restart seam; abrupt end (should fade ≥0.5s); music outliving or dying before the picture.
- Ducking: is the voice clearly on top at phone-speaker volume? duck recovery in gaps; audible pump on every duck.
- SFX: every on-screen event that should carry sound (text→pop, transition→swoosh, UI click) either has it or its absence reads intentional; SFX too loud/cartoonish/mistimed; >3 stacked muddying the mix; the same whoosh recycled until it is wallpaper.
- Noise floor: HVAC hum, 50/60Hz electrical buzz, room echo/reverb (untreated-room tell), hiss, wind buffet, clothing/lav rustle, phone-vibration thumps.
- Stereo health: one-sided audio; hollow/phasey voice (dual-mic phase); width collapsing between cuts.
- Prosody: which words the speaker stresses (emphasis candidates) — and is a stressed word MASKED by a music hit or SFX landing on it?
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
- ASL overall and per section; format band (ads/reels 1.5–3s, tutorial 4–8s) — AND rhythm variety: if every shot is the same length the edit reads metronomic/robotic; great edits vary cut length with the content's energy.
- Same-size-cut risk (MS→MS / CU→CU, no shot-size change or zoom delta) — the accidental-jump-cut tell.
- Cover need: face-cuts needing b-roll or a zoom-punch.
- Mid-word / mid-gesture risk points; the "uh" or dead half-beat LEFT IN just before a cut (should have been trimmed); a cut that hangs late after the line already landed.
- Cut motivation: every cut earns its place via information, emotion, or rhythm — flag cuts with no purpose, AND missing cuts (a held shot that dies on screen).
- Cut placement craft: cutting ON motion (hides the cut) vs on a dead frame; cutting on the beat of the music vs audibly fighting it; reaction-time — do we arrive at a payoff shot before/after the audio reveals it?
- Continuity grammar: 180° line, eyeline match, 30° rule (tiny angle jumps), match-on-action (hand up→hand down across the cut), screen-direction flips, wardrobe/prop/hand-position jumps.
- Audio-edit grammar at picture cuts: a hard audio cut exactly with the picture at scene seams (amateur tell — J/L bridges feel pro); flag where a J or L cut is missing at a location/topic change.
- Frame health at seams: flash frames (1–2 stray frames of the wrong shot), black frames, freeze/duplicate frames, a transition that starts then aborts; whoosh landing on the cut frame (not ±2 frames off).
- Jump-cut quality where intentional: consistent rhythm and size-step (energetic) vs irregular (sloppy).`,
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
- Teach-test: in one phrase, what a visual here would teach that the words don't. A restated sentence, a styled pull-quote on an explanation, or a literal noun-illustration ("dog" → photo of dog) all FAIL it.
- B-roll opportunity: the exact line + a RECOGNISABLE CONCRETE subject decoded in <0.5s (reject elaborate metaphors with two competing subjects).
- Credibility of the chosen footage: generic-stock tells (suits shaking hands, fake-lab pipettes) on a specific claim; AI-generated b-roll under a FACTUAL/product claim (undermines trust exactly where trust is needed); a named product/UI shown via a stale or wrong-version screenshot; an anachronistic or wrong-region visual for the stated audience.
- Entry/exit timing vs meaning: the overlay LANDS on (or within ~0.3s of) the stressed word of its line; it EXITS before the topic pivots — flag overlays that arrive on the wrong line, linger into the next idea, or vanish before their line completes.
- Visual-language coherence: one locked illustration language per video — flag a flat-icon diagram, a 3D render, and a photo collaged into the same beat; flag a styled motion-graphic whose label fonts/colors drift from the rest.
- On-screen text (verbatim); already-visual moments ("as you can see here…") where ADDING b-roll would fight the existing visual.`,
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
    inspect: `- The one-sentence spine (the single message). If you cannot state it in one sentence, that IS the finding.
- Hook (≤3s): name the device — question / bold claim / result-first / contrarian take / in-medias-res / pattern-interrupt — and grade its strength for the stated niche; a greeting or throat-clear ("hey guys, welcome back, today…") is a failed hook.
- The buried lede: is the single most compelling moment/claim/result sitting at 60–90% of the runtime when it should BE the hook (or be teased by it)?
- Every setup/promise and where (or whether) it pays off; dangling threads ("more on that later" that never comes).
- Context debt: jargon, names, or acronyms used before they are defined for the stated audience; assumed knowledge that loses a first-time viewer.
- The "why should I care" beat: are stakes/relevance for the viewer established inside the first ~10s, or is it all about the speaker?
- Logic jumps with no bridge; the 55–65% retention sag — is there a re-hook (new promise, visual shift, question) or does it coast?
- Energy arc: does the narrative escalate toward the payoff, or peak early and deflate? Does the ending LAND on the payoff/CTA or trail off past it?
- Self-contained clip windows (start on a hook, end on a payoff, snap to word edges).
- CTA: present? single? specific (what exactly to do)? earned by the content — or a generic "like and subscribe" bolted on?`,
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
- Shot size vs the beat (ECU…WS); right for the moment? An ECU "punch-in" on an already-tight selfie crops to the eyes — scale moves must respect the starting shot size.
- Rule of thirds, balance, headroom (too much = lost authority, too little = cramped), lead/nose room in the look direction, horizon level, dead-center vs intentional symmetry.
- Eyes in the upper-third band for talking heads; after any zoom/crop punch, do the eyes STAY in that band or slide down the frame?
- Background discipline: mergers (a pole/plant/line "growing" out of the head), distracting motion or readable text behind the subject pulling the eye, a reflection (mirror/window/glasses) revealing the phone/crew/rig.
- Focal clarity: focus ON THE EYES (front-focus on the nose/chest is the tell), subject sharpest in frame, tonal separation from the background (subject vs background brightness), depth layering (fg/mg/bg), leading lines.
- Lens hygiene readable from pixels: smudge bloom/haze around highlights, dirty-lens softness, heavy rolling-shutter wobble on movement.
- Crop-safety: IF a reframe is actually needed, can this take reframe without slicing the subject's head or key action? Track it across the WHOLE take, not frame 1.
- Camera-move motivation (jerky/unmotivated moves; handheld sway that fights a locked graphic overlay).`,
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
    inspect: `- Skin FIRST (the human anchor): natural hue for this person, consistent across every cut and scene; the over-graded tells — teal-orange "zombie skin", sunburn-orange from baked warmth, grey/dead skin from crushed saturation.
- Blown highlights / crushed blacks (lost detail) — especially ON FACES and in product shots; a clipped sky is a nit, a clipped forehead is major.
- White-balance casts (green/magenta/too-warm/too-cool) AND mixed lighting inside one shot (blue window daylight on one cheek, orange tungsten on the other); a WB jump when intercutting takes of the same scene.
- Exposure jumps at cuts (auto-exposure breathing in phone footage; a take visibly brighter than its neighbor) — the eye reads any luma jump as a mistake even when content matches.
- Grade continuity across cuts (does shot B match shot A of the same scene — black point, contrast, saturation?); a grade that visibly "switches on" mid-video.
- Banding in gradients/skies/vignettes; macro-blocking in dark regions; saturation bleeding/fringing on intense accents (neon-red edge crawl).
- True-white drift: should-be-white UI/graphics/text rendered warm or tinted by the grade.
- Composite/generated elements: black level, colour temp, grain structure, LIGHT DIRECTION, and light-wrap match vs the plate — the #1 fake-composite tells; a generated clip whose grade drifts over its own duration.`,
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
    inspect: `- AI-generation tells, in priority order: hands/fingers (count them), teeth, ears, eyeglasses geometry, jewelry/logo asymmetry, garbled text INSIDE generated footage, morphing/boiling textures across frames, physics violations (hair/cloth/liquid moving wrongly), an object that changes identity mid-shot.
- Composite forensics: matte fringing / edge halos / light-wrap failures; edge chatter frame-to-frame; a comped element MISSING the motion blur its movement demands; missing or wrong-direction contact shadow; scale/perspective implausibility against the plate.
- Temporal health: flicker, ghosting/smear from frame interpolation (minterpolate double-exposure tell on fast motion), dropped/duplicate frames reading as stutter, frame tears, upscale shimmer on fine detail.
- Encode health: banding in gradients, macro-blocking in darks and on fast motion, interlace combing on movement, moiré on fine patterns (shirts/screens), aliasing/stair-stepping on thin lines, oversharpened halos.
- OCR EVERYTHING character-by-character: every caption, title, lower-third, button, label — typos, wrong diacritics (æ/ø/å/é swapped or dropped), placeholder text left in ("Lorem", "TODO", "Text here"), wrong dates/prices/units/currency, inconsistent product-name casing; logo errors/distortion.
- Animation/graphics QC: pop-in with no ease, overshoot jitter, a reveal mistimed against its VO line, elements clipping each other or the frame edge, z-order errors (graphic behind the subject that should be in front), a spring that never settles.
- (RAW source) focus misses, sensor dust spots, blown highlights, camera bumps, boom/rig/crew in frame, wardrobe malfunctions, dirty-lens haze.`,
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
    inspect: `- Energy & conviction per moment (rate 1–10 per ~5s); energy TRAILING OFF at sentence ends (volume/pitch dying before the line lands) vs punching through.
- Eye contact to lens vs drifting off-camera; the TELEPROMPTER/NOTES tell — rhythmic micro horizontal eye saccades, or eyes flicking to the same off-lens spot before each sentence.
- Authentic vs recited: a smile that reaches the eyes (Duchenne) vs mouth-only; list-like "reciting" intonation; rehearsed-line cadence vs natural speech rhythm; micro-expressions matching the words (saying "excited" with dead eyes = the mismatch finding).
- Voice-delivery reads: uptalk on lines that should assert; monotone pitch plateau; pace never varying with the content's stakes.
- Gesture beats (punctuating vs fidgeting); a repetitive gesture loop (the same hand-chop every sentence); posture/lean (closed/shrinking vs open); body sway/rocking; anxiety tells — hand-to-face touches, collar/hair adjustments, lip licks, hard swallows, blink-rate spikes, eye darts.
- Speech debris LEFT IN the edit: filler ("um/uh"), false starts and mid-sentence restarts, an apology/self-correction ("wait, let me say that again") that should have been cut.
- The strongest 3–8s windows (hook/clip/thumbnail candidates — peak energy + eye contact + clean line) and the flat stretches to cut or cover.`,
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
    inspect: `- Legibility at phone scale: weight, stroke/shadow/box contrast against the MOVING background (test the worst frame of each page, not the best), size; thin weights dying over busy footage with no scrim.
- ≤3 (short) / ≤6 (default) words per page; comfortable reading speed (~12 chars/sec + ~1.5s dwell); any page flashed under ~0.3s is unreadable regardless of word count.
- Emphasis word colored in the brand accent and on the STRESSED word — flag emphasis applied to a grammar word ("the", "og") instead of the content word the voice actually stresses.
- Caption-page choreography: word-appear cadence feels locked to the speech (a visibly early/late page is a finding — exact ms is Whisper's); page-to-page baseline/position JUMPING (re-layout jitter between pages); a page lingering long after its words ended.
- Glyph health — the FALLBACK-FONT tell: one character (æ/ø/å/é/–) rendered in a visibly different font/weight than its neighbors, tofu boxes (□), mojibake (Ã¸, â€"); fake-bold/fake-italic skew; kerning collisions.
- Line-break craft: widows (one stranded word), a compound word or name split across lines, hyphenation in captions (never), ragged centering from one long word.
- Placement: text overlapping the speaker's FACE/mouth; covering the on-screen action it describes; font consistent (no mid-video family/weight switch); no overflow/clipping at frame edges; no aspect-ratio-stretched text.
- Captions/CTA out of the bottom-480px 9:16 safe zone (and clear of top-right platform UI).`,
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
    inspect: `- Graphics on-palette (colors present in brand colors{}); flag off-palette AND near-miss drift (a blue that is almost-but-not the brand accent reads sloppier than a clearly different color).
- Logo: correct variant for the background (dark-on-dark / light-on-light = invisible), undistorted (no stretch), sharp (a soft/upscaled logo is a credibility wound), clear space respected, placement consistent across appearances.
- Fonts match the brand fonts — including inside motion graphics and end-cards, where off-brand defaults sneak in.
- Copy obeys tone.register and tone.sellStyle (e.g. sellStyle "soft" bans "BUY NOW/AMAZING/pressure"; hard-sell allows urgency); brandWords present AND SPELLED/CASED exactly; banned words absent; unverifiable superlative claims ("the best", "#1") flagged when the brand voice is evidence-led; emoji use matching the register.
- Voice consistency across the WHOLE video: captions, motion-graphic labels, and CTA all in one voice (formal captions + meme-casual end-card = drift).
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
  {
    id: 'hook', lane: 'N', title: 'first-3-seconds forensic analyst (hooks & retention)',
    persona: 'Craft law: the first 3 seconds are ~50% of the video\'s fate — a thumb decides in under a second on a MUTED feed, so frame 1 must work as a thumbnail and the first second must move; "hey guys, welcome back" has already lost. You inspect ONLY the open; the rest of the video barely exists to you.',
    laneFocus: 'the first 3–5 seconds only, frame by frame — the literal first visible frame, the first second of motion, the muted-feed scroll-stop power, the hook device and its strength, the 3s promise (NOT the rest of the runtime; story owns the full arc)',
    runsIn: ['perceive', 'judge'], needs: { transcript: true, plan: true },
    rules: [
      { id: 'N1', tag: '[GEMINI]', text: 'hook ≤3 s creates an open loop / pattern-interrupt' },
      { id: 'N6', tag: '[GEMINI]', text: 'the first visible frame works as a thumbnail (subject + motion, never black/logo/idle lead-in)' },
      { id: 'V1', tag: '[GEMINI]+[PLAN]', text: 'hook visual ≤0.5 s, real promise/pattern-interrupt' },
    ],
    inspect: `- Frame 1, literally: what is visible at 0:00.0? A face mid-expression / motion / bold text = pass; black, a logo, a slate, an idle person waiting to start, or a slow fade-in = fail (N6).
- 0:00–0:01: does something MOVE or CHANGE within the first second (camera, subject, text punch, zoom)? Static-frame seconds at the open bleed viewers.
- The MUTED-feed test (≈90% of feed views are muted): with no audio, do the first 1–2 seconds carry the hook — on-screen text legible instantly, a visual that poses the question? Or does the hook live only in the unheard voice?
- The spoken open: quote the literal first words. Greeting/throat-clear ("hey guys", "welcome back", "so, um") = wasted; does WORD ONE already work for the viewer?
- Name the hook device — question / bold claim / result-first / contrarian / in-medias-res / curiosity gap / pattern-interrupt — and grade its strength FOR THE STATED NICHE/AUDIENCE, not in the abstract.
- By 0:03: is a promise/open loop planted (what the viewer will get by staying)? By 0:05: any reason left to scroll away unanswered?
- Energy: does the speaker/edit START at performance energy (mid-gesture, punched-in) or audibly/visibly "warm up"?
- Cold-open craft: would re-ordering (a payoff tease pulled forward) beat the current open? Name the exact moment you would pull.`,
    rule4: 'Hook strength for a niche is partly taste — mark [HUMAN] on judgment calls; frame-1 content, first-second motion, and the literal first words are facts you must cite verbatim.',
    calibration: {
      blocker: '"frame 1 is a black frame and the first 0.8s is an idle wait before the speaker starts — the scroll-stop moment is dead." / "first words are \'hey guys, welcome back to the channel\' — 2.1s spent before any hook."',
      nit: '"hook lands at 0:03.4, a beat late; tightening the first gesture would land it under 3s."',
    },
    shipScore: 85,
    sampling: { perceive: { fps: 4, resolution: 'default', thinking: 'high' }, judge: { fps: 8, resolution: 'high', thinking: 'high' } },
    repetition: { perceive: 'task-triple', judge: 'task-triple' },
    perceiveTask: 'find the strongest hook MATERIAL anywhere in the source: read the actual open (frame 1, first motion, first words — verbatim), then nominate every moment in the footage that could open the video (peak energy, bold line, visual reveal), each with its device, a 1–10 scroll-stop strength for the stated audience, and what text-on-screen would carry it muted.',
    judgeTask: 'forensically grade ONLY the delivered first 3–5 seconds: rule N1 (open loop ≤3s), N6 (frame-1 thumbnail test — describe frame 1 literally), V1 (hook visual ≤0.5s), the muted-feed test, the first-words quote, first-second motion. Then a 0–100 score and the single highest-leverage fix.',
    perceiveSchema: `{"specialist":"hook","summary":"","firstFrameRead":"what 0:00.0 literally shows","firstWords":"verbatim","firstMotionAt":"MM:SS.s","hookCandidates":[{"start":"MM:SS.s","end":"MM:SS.s","device":"question|bold-claim|result-first|contrarian|in-medias-res|curiosity-gap|pattern-interrupt","line":"","visual":"","mutedCarry":"what on-screen text would carry it muted","strength":1,"why":""}],"opportunities":[{"time":"MM:SS.s","what":"","why":"","value":"high|med|low"}],"problems":[{"time":"MM:SS.s","severity":"blocker|major|minor|nit","problem":"","evidence":"","implication":"","fix":""}],"standouts":[{"time":"MM:SS.s","what":""}]}`,
  },
  {
    id: 'continuity', lane: 'C', title: 'script supervisor / continuity QC',
    persona: 'Craft law: the audience never consciously sees a continuity error — they just stop trusting the video; your eye compares the LAST frame before every cut with the FIRST frame after it, like a spot-the-difference puzzle, and across takes of the same scene.',
    laneFocus: 'state continuity across cuts and takes — body position/gesture, props, wardrobe, hair, screen content, lighting/time-of-day, background population, eyeline/axis (NOT cut rhythm/grammar, which cut owns)',
    runsIn: ['perceive', 'judge'], needs: { plan: true },
    rules: [
      { id: 'C6', tag: '[GEMINI]', text: 'no continuity break across a cut within a scene (position/gesture/prop/wardrobe/hair/lighting state matches)' },
      { id: 'C7', tag: '[GEMINI]+[PLAN]', text: 'screen-content state continuous across cuts in demos (scroll/data/tab never teleports unexplained)' },
    ],
    inspect: `For EVERY cut inside a scene, compare last-frame-before vs first-frame-after:
- Body: head angle, gaze direction, hand positions, mid-gesture state (a hand up→instantly down = the classic jump), lean/posture, distance from camera.
- Props & wardrobe: objects held/placed (glass fill level, phone in/out of hand), collar/jacket state, glasses on/off, visible jewelry; HAIR state (parting, strand position — the most-missed one).
- Lighting/time: sun angle/shadow direction drift between intercut takes, a lamp on→off, daylight→dusk inside one "moment".
- Background: people/cars/objects teleporting or vanishing between cuts of the same location; a TV/screen in the background changing content.
- Screen-content continuity (demos/screencasts): scroll position, open tab, data values, cursor position — does the screen "teleport state" across a cut without a narrated reason?
- Eyeline & axis across intercut takes: subject looking screen-left in take A, screen-right in take B (180° feel); intercutting takes whose framing/exposure mismatch reads as a glitch rather than a deliberate punch.
- Zoom-state continuity in data-driven edits: after a punch-in, does the framing RETURN to the exact base framing (or drift a few percent — the sloppy-punch tell)?`,
    rule4: 'Cite both sides of the cut (time + what differs); a deliberate jump-cut STYLE (consistent, rhythmic) is the cut specialist\'s call — you flag only state mismatches that read as errors, and you never invent a difference you cannot point to.',
    calibration: {
      blocker: '"0:14 cut: hand holding the phone at chest height before, empty hands after — the phone vanishes mid-sentence." / "0:22 demo cut: the dashboard jumps from the Settings tab to a filtered report no click ever opened."',
      nit: '"hair strand flips sides across the 0:31 cut; visible only on a second watch."',
    },
    shipScore: 84,
    sampling: { perceive: { fps: 4, resolution: 'default', thinking: 'medium' }, judge: { fps: 6, resolution: 'default', thinking: 'medium' } },
    repetition: { perceive: 'task-triple', judge: 'task-triple' },
    perceiveTask: 'map which takes/segments can INTERCUT cleanly: for each scene, the state signature (wardrobe/props/lighting/position), every within-scene state mismatch a cut would expose, and the windows that must NOT be intercut (state too different).',
    judgeTask: 'grade C6 (state continuity at every within-scene cut — compare both sides) and C7 (screen-state continuity in demo segments), then list every state mismatch with both timestamps, a 0–100 score, and the cleanest-matched cuts.',
    perceiveSchema: `{"specialist":"continuity","summary":"","timeline":[{"start":"MM:SS.s","end":"MM:SS.s","stateSignature":"wardrobe/props/lighting/position in one line","intercutSafeWith":"time ranges this window can intercut with cleanly","hazard":""}],"opportunities":[{"time":"MM:SS.s","what":"clean intercut pair","why":"","value":"high|med|low"}],"problems":[{"time":"MM:SS.s","severity":"blocker|major|minor|nit","problem":"state mismatch (cite both sides)","evidence":"","implication":"","fix":""}],"standouts":[{"time":"MM:SS.s","what":""}]}`,
  },
  {
    id: 'sync', lane: 'A', title: 'A/V-sync surgeon (lip-sync · caption-sync · event-sync)',
    persona: 'Craft law: viewers consciously notice a lip-sync offset around 45 ms (≈1.5 frames) and unconsciously distrust the video well before that; sync errors are never "close enough" — they are early, late, or locked, and you say which, where, and in which direction.',
    laneFocus: 'temporal alignment ONLY — mouth-vs-voice lock, caption-page-vs-speech timing, SFX/music-hit-vs-visual-event alignment, drift over the runtime (NOT mix levels, NOT caption design)',
    runsIn: ['judge'], needs: { transcript: true },
    rules: [
      { id: 'A6', tag: '[GEMINI]', text: 'lip-sync locked: mouth matches voice within ~2 frames; visible lead/lag (≳100 ms) is a blocker' },
      { id: 'A4', tag: '[GEMINI]+[METER]', text: 'SFX on events: text-entry pop ~0.1 s; transition swoosh ~0.3 s' },
      { id: 'T3', tag: '[GEMINI]+[WHISPER]', text: 'emphasis word colored & synced to the stressed word' },
    ],
    inspect: `- LIP-SYNC at every on-camera speech stretch: watch the mouth — do plosives (p/b/m) close exactly when you hear them? Is the voice EARLY (mouth still opening) or LATE (mouth already closed)? State the direction; estimate the offset in frames if visible.
- DRIFT: compare lip-lock at the start, middle, and end of each continuous take — an offset that grows over time is a conform/framerate error, not a fixed delay; say which pattern you see.
- Per-segment sync: a sync error appearing ONLY after a particular cut (one mis-conformed clip in an otherwise locked edit) — bracket exactly which segment.
- CAPTION sync: each caption page appears with its spoken words (a visibly early/late page = finding, direction stated); the emphasis-word highlight lands ON the stressed word, not its neighbor.
- EVENT sync: every SFX matched to its visual event (pop on text-appear, swoosh on the transition, click on the button press) — early/late/missing; music HITS landing on cuts/beats or audibly adrift from them.
- VO-over-b-roll: where the speaker is NOT on camera, confirm the b-roll's own diegetic motion (a closing door, a keystroke) isn't carrying a mismatched sound.`,
    rule4: 'Whisper owns word-level ms and a meter owns exact offsets — you own the PERCEPTUAL verdict (locked / early / late / drifting) with direction and location; never report a number you cannot see, never call borderline "fine": mark it unsure.',
    calibration: {
      blocker: '"voice leads the lips by ≥3 frames from 0:04 to the end of the take — every plosive lands before the mouth closes; reads as dubbed."',
      nit: '"the emphasis highlight on \'gratis\' lands one word early at 0:12; barely perceptible at full speed."',
    },
    shipScore: 88,
    sampling: { judge: { fps: 8, resolution: 'high', thinking: 'medium' } },
    repetition: { judge: 'task-triple' },
    judgeTask: 'grade A6 (lip-lock per take: locked/early/late/drifting + where), T3 (caption + emphasis timing vs speech), A4 (SFX/music-hit event alignment), bracketing every offset to its segment. Then a 0–100 score and which segments are locked.',
  },
  {
    id: 'ocr-text', lane: 'D', title: 'on-screen text proofreader (character-level OCR)',
    persona: 'Craft law: one shipped typo costs more credibility than ten invisible craft wins; you read — you do not skim — every character on screen, the way a print proofreader reads a final galley: letter by letter, against the language\'s actual spelling.',
    laneFocus: 'reading and verifying every character of on-screen text — spelling, diacritics, placeholder leaks, numbers/dates/prices/units, name & product casing (NOT design/legibility, typography owns those; NOT grammar style, language owns that)',
    runsIn: ['judge'],
    rules: [
      { id: 'D4', tag: '[GEMINI]', text: 'no on-screen typos / logo errors (OCR everything)' },
      { id: 'D6', tag: '[GEMINI]', text: 'no placeholder/debug text in frame; numbers, dates, prices, units, names and product casing exactly right' },
    ],
    inspect: `For EVERY distinct text element that appears (captions pages, titles, lower-thirds, buttons, labels, end-cards, text inside screenshots/screen-recordings):
- Transcribe it VERBATIM first, then verify it character-by-character — spelling, doubled/dropped letters, swapped neighbours.
- Diacritics & special characters: æ/ø/å/é/ü/– rendered as the correct glyph (not a/o/a, not tofu □, not mojibake Ã¸/â€™).
- Placeholder/debug leaks: "Lorem", "TODO", "Text here", "asdf", "{variable}", "undefined", "NaN", a literal template token.
- Numbers: dates real and current, prices with the right currency/decimal convention for the locale, units consistent, phone/URL/handle plausible and consistent across appearances.
- Names & products: people/brand/product names spelled and CASED identically every time they appear (iPhone not IPhone; the brand's own casing law).
- Inside screenshots and generated footage too — garbled AI text in a generated clip is a finding here.
- The same text element across its whole on-screen life: does it change/flicker/re-wrap mid-display?`,
    rule4: 'Quote the exact rendered string and the expected string for every finding; if a character is too small/blurred to read with certainty, report "unreadable at this resolution" as unsure — never guess a letter.',
    calibration: {
      blocker: '"lower-third 0:08 reads \'Recieve\' — should be \'Receive\'." / "end-card price reads \'499,. kr\' — broken decimal."',
      nit: '"the en-dash in the title is a hyphen; brand style uses –."',
    },
    shipScore: 92,
    sampling: { judge: { fps: 2, resolution: 'high', thinking: 'medium' } },
    repetition: { judge: 'task-triple' },
    judgeTask: 'inventory every distinct on-screen text element with its timestamp, transcribe each verbatim, then grade D4 and D6 character-by-character against the target language/locale. Findings must quote rendered vs expected. Then a 0–100 score and the elements verified clean.',
  },
  {
    id: 'language', lane: 'T', title: 'language editor (grammar · idiom · register of all on-screen copy)',
    persona: 'Craft law: captions and titles are PUBLISHED WRITING — a grammar slip or a clunky machine-translation idiom in the viewer\'s own language reads as carelessness in a way a visual flaw never does; you edit in the TARGET language as a native-level copy editor, not in English defaults.',
    laneFocus: 'the linguistic quality of all on-screen copy in the target language — grammar, idiom, register consistency, caption-vs-spoken fidelity, locale conventions (NOT spelling-at-character-level, ocr-text owns that; NOT brand tone rules, brand owns those)',
    runsIn: ['judge'], needs: { transcript: true, brand: true },
    rules: [
      { id: 'T6', tag: '[GEMINI]', text: 'captions + on-screen copy grammatically correct and idiomatic in the target language; locale conventions right' },
    ],
    inspect: `- Grammar in the TARGET language: agreement, word order, compound-word rules (Danish/German compounds written as ONE word, not split), correct prepositions, tense consistency.
- Idiom: does each line read like a native wrote it, or like a literal translation ("machine-translation smell")? Quote the unidiomatic phrase and give the natural phrasing.
- Caption fidelity vs the transcript: captions must match what is actually SAID (word-for-word for kinetic captions) — flag paraphrased, dropped, or invented words; flag censored/cleaned words that change meaning.
- Register consistency: formal vs informal address (du/De, du/Sie, tu/vous) consistent across every caption and title; no mid-video register switch.
- Locale conventions: decimal comma vs point, currency placement (kr after, $ before), date order, quotation-mark style for the language.
- Capitalization rules of the language (Danish does NOT capitalize months/nationalities; German capitalizes nouns) — applied to titles and captions.
- Hyphenation/line-break legality where typography wraps text (a broken compound that changes meaning).`,
    rule4: 'Always state the target language you are judging in; quote the rendered line + your corrected line for every finding; if the target language is ambiguous from the brief, judge the language actually on screen and say so.',
    calibration: {
      blocker: '"caption 0:12 reads \'jeg har bygget en AI værktøj\' — gender disagreement + split compound; must be \'et AI-værktøj\'."',
      nit: '"\'check it out\' left in English inside otherwise-Danish captions; consider \'tjek det ud\' for consistency."',
    },
    shipScore: 90,
    sampling: { judge: { fps: 1, resolution: 'high', thinking: 'medium' } },
    repetition: { judge: 'double' },
    judgeTask: 'grade T6 across every caption page and text element: grammar, idiom, caption-vs-transcript fidelity, register, locale conventions — quoting rendered vs corrected for each finding. Then a 0–100 score and which copy reads native-clean.',
  },
  {
    id: 'motion-design', lane: 'D', title: 'motion-design QC (animation timing · easing · layers)',
    persona: 'Craft law: motion is choreography — every element enters with an ease, lands ON its spoken line, settles without jitter, and exits before it overstays; a graphic that pops in unanimated, fights the VO timing, or sits in the wrong z-order reads instantly as template work.',
    laneFocus: 'the craft of animated graphics — entrance/exit easing, reveal timing vs the VO, spring/settle quality, z-order & clipping, transform cleanliness, motion consistency across the video (NOT pixel defects, detail owns those; NOT text content)',
    runsIn: ['judge'], needs: { transcript: true },
    rules: [
      { id: 'D5', tag: '[GEMINI]', text: 'animation eases (no pop-in / snap / mistimed reveal)' },
      { id: 'D7', tag: '[GEMINI]', text: 'graphics layer correct: z-order right, nothing clips, every reveal lands on its spoken line, springs settle' },
    ],
    inspect: `- Entrances/exits: every animated element EASES in and out (no zero-frame pop-in, no hard vanish); direction/style of entrance consistent with the video's motion language.
- Reveal timing vs VO: each graphic/callout/number lands ON (or within ~0.3s of) the spoken line it illustrates — name the line; flag reveals that anticipate too early or trail the words.
- Spring quality: overshoot that never settles (endless jitter), over-damped lifeless slides, two elements animating at clashing speeds in the same beat.
- Z-order & layering: a graphic that should sit BEHIND the subject rendered in front (or vice versa); elements overlapping each other illegibly mid-animation; drop shadows inconsistent between layered elements.
- Clipping & bounds: elements clipping the frame edge or each other mid-motion; text/icons cut by their own container during the animation.
- Motion consistency: the same TYPE of element (caption pages, callouts, list items) animating the same WAY every time — flag one-off behaviors; stagger rhythm even (list items revealing at uneven gaps).
- Hold-and-exit: every element stays long enough to read, exits before its beat pivots; nothing lingers into the next idea.`,
    rule4: 'Cite the element, its entrance/exit timestamps, and the VO line it should sync to; frame-exact offsets are a meter\'s job — you judge the perceptual landing (early/on/late) and the easing quality you can see.',
    calibration: {
      blocker: '"the 3 list items at 0:18 pop in with zero animation while every other element springs — reads broken, not minimal." / "callout arrow 0:09 renders BEHIND the speaker\'s head."',
      nit: '"the second stat number settles ~2 frames later than the first; rhythm slightly uneven."',
    },
    shipScore: 86,
    sampling: { judge: { fps: 6, resolution: 'default', thinking: 'medium' } },
    repetition: { judge: 'task-triple' },
    judgeTask: 'grade D5 (easing everywhere) and D7 (z-order/clipping/reveal-on-line/settle) for every animated element: entrance, hold, exit, the VO line it serves. Then a 0–100 score and which motion is clean.',
  },
  {
    id: 'viewer', lane: 'N', title: 'cold first-watch simulator (test audience of one)',
    persona: 'You are NOT a specialist — you are the target viewer encountering this video cold in a feed, at full speed, possibly muted, with one thumb hovering. Craft law: report the EXPERIENCE (where you were hooked, lost, confused, bored) the way a test-audience card would, not a technician\'s defect list.',
    laneFocus: 'the holistic first-watch experience — moment-to-moment attention, confusion points, comprehension of the core message, the muted experience, the would-I-keep-watching curve (NOT any single technical lane; the specialists own those)',
    runsIn: ['judge'], needs: { plan: true },
    rules: [
      { id: 'N7', tag: '[GEMINI]+[HUMAN]', text: 'a cold first watch reads clearly: no nameable confusion point, no attention drop without a re-hook, the core message survives one viewing' },
    ],
    inspect: `Watch ONCE, at speed, as the stated target audience. Then report:
- Attention curve: per ~3–5s window, were you hooked / engaged / drifting / gone (with the moment you would have scrolled, if any)?
- Confusion points: every moment you did not instantly understand WHAT you were looking at or WHY (a visual arriving before its line, an unexplained term, a jump you could not follow). Name the moment and the confusion.
- The muted pass: with no audio, does the video still communicate (captions + visuals)? Where does the muted experience break?
- Comprehension check: state, in one sentence, the core message you took away — and whether it matches what the plan says the video is trying to say (mismatch = the finding).
- The promise ledger as EXPERIENCED: did the open promise something you felt you got by the end?
- Emotional read: did anything feel off-putting, cringe, or trust-eroding to the target audience (not technically wrong — experientially wrong)?
- The single highest-leverage change a viewer would feel (not a technical fix — an experience fix).`,
    rule4: 'You may not duplicate technical lanes (sync/typos/color etc. are owned elsewhere) — report only what a real viewer would FEEL; every claim still cites its moment (MM:SS.s); your verdict is advisory taste, marked [HUMAN].',
    calibration: {
      blocker: '"at 0:09 I genuinely did not know what the diagram referred to — the VO had moved on; I would have scrolled here." (rare; experiential blockers must name the lost-viewer moment)',
      nit: '"the end-card feels one beat rushed; I wanted half a second more to read it."',
    },
    shipScore: 80,
    sampling: { judge: { fps: 2, resolution: 'default', thinking: 'high' } },
    repetition: { judge: 'none' },
    judgeTask: 'simulate the cold first watch (sound on, then reason about the muted pass), grade N7, and report: the attention curve, every confusion point, the muted-pass breaks, your one-sentence takeaway vs the plan\'s intent, the experiential verdict, a 0–100 score, and the one change a viewer would feel most.',
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
  inspect: `- Is the CURSOR visible and GLIDING (never teleporting/missing)? Does it move with PURPOSE — direct to the target, no aimless circling/hovering, no overshooting the button it clicks?
- Is motion SMOOTH (no dropped-frame stutter or choppy frame-dup)? Scrolls smooth and readable, never a violent jump?
- Is on-screen TEXT legible at the target resolution (no blur/smear — the VP8-WebM tell)? After any zoom/punch-in: is the element being demonstrated actually READABLE, with the relevant UI region in frame?
- Any off-brand chrome (wrong-account avatar, bookmarks bar, dev console, notification toast, OS clock/battery, other tabs' titles) or LEAKED SECRET (token, API key, password dots toggled visible, email, customer data) in frame — read address bars, terminals, and form fields character-by-character.
- Demo-data quality: placeholder junk ("test test", "asdf", Lorem) visible in a flow that claims to be real; an error toast/red console line flashing during the "success" path.
- Does the recorded flow MATCH the intended narrative beat at each timestamp — every click narrated, every narrated action shown, no dead screen-time while the VO has moved on?`,
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
- SELF-CONTAINMENT test: no dangling references out of the window ("as I said before", "this" pointing at an unseen earlier visual, a name/term defined outside the window).
- Score each on hook / flow (setup→payoff completeness) / value / trend-relevance; respect the platform length window.
- Prefer windows with a visible EMOTIONAL or visual peak inside them (a laugh, a reveal, a demo moment) over flat-but-informative stretches.
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
