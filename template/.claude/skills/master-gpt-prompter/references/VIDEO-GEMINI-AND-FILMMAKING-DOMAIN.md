# VIDEO · GEMINI VISION · FILMMAKING — DOMAIN KNOWLEDGE FOR POTENT PROMPTS

> **When to use this file:** read it whenever the prompt you are crafting targets **video, film, motion graphics, a Gemini *vision/video-understanding* call, or this project's Remotion pipeline** (e.g. a "Gemini council" specialist prompt, a video-QA prompt, a bounding-box-detection prompt, a generative-VFX prompt). For unrelated prompt tasks (code, marketing copy, generic LLM), **skip this file** — it is domain-specific, not general prompt theory.
> **Purpose:** give you (the prompter) the project context + the craft/film vocabulary + the Gemini-vision forcing techniques needed to produce *potent, expert, evidence-forcing* prompts — not vague "is this good?" prompts.

---

## PART 0 — THE ONE THING THAT MAKES THESE PROMPTS POTENT

The model we prompt for vision is **`gemini-3.1-flash-lite`** (project standard — never Gemini 2.5). Its failure mode is **leniency / over-reading**: left to a generic prompt it says "looks great," invents problems that aren't there (false safe-zone violations, imagined "audio jumps" at natural pauses, OCR typos), and skims the center of the frame. A potent prompt **fights that** with five forcing functions — bake these into EVERY Gemini-vision prompt you craft:

1. **Assign one narrow, world-class expert persona** (not a generalist). A "world-class film colourist" gives sharper color findings than "an assistant."
2. **Ban the non-answer.** Explicitly forbid "looks good / looks great / seems fine" with no evidence. Require every claim to carry **a timestamp (s) + a frame region (e.g. upper-left quadrant / lower-third / center) + a concrete observation**. A verdict without cited evidence is an invalid response.
3. **Force exhaustive spatial + temporal coverage.** Tell it to scan the frame in tiles/quadrants (not just center) and to inspect the specified sampled frames one by one. "Examine each quadrant of every sampled frame."
4. **Demand a strict machine-readable contract.** Output **valid JSON only, no markdown fences**, against an explicit schema with **severity** (`blocker|major|minor|nit`) and per-finding `time_s`, `region`, `observation`, `why_it_matters`, `fix`. We parse it programmatically.
5. **Calibrate against leniency.** Instruct: "Default to skepticism. If you are unsure whether something is a defect, report it as `minor` with your uncertainty — do NOT silently pass it. But never invent a defect to seem thorough: every finding must be visually grounded in a cited frame/region." Pair with the principle that objective meters (LUFS, frame count, safe-zone pixels) override the model — so the prompt should ask it to *describe what it sees*, not to *adjudicate things a measurement already settled*.

Prefer **many narrow calls** (one per specialist, multiple frames, frame tiles, high fps, high resolution) over one broad call — quality of coverage beats a single sweeping pass.

---

## PART 1 — HOW THIS PROJECT USES GEMINI (so prompts are correctly targeted)

- **`describe` mode** (ingest): build a timestamped visual+audio timeline of *source* footage — shots, on-screen text, people, camera, notable moments. Used to plan edits. Invoked via `tsx capabilities/perception/gemini-video-review.ts --mode describe`.
- **`qa` mode** (delivery): inspect a *rendered* edit for defects before shipping. Invoked via `tsx capabilities/perception/gemini-video-review.ts --mode qa`.
- **`council` mode** (the big one): a **panel of specialist reviewers**, each its own call. Invoked via `tsx capabilities/perception/gemini-council.ts`. You will most often be asked to craft a *single specialist's* prompt. The roster + what each must catch is in PART 3.
- **reference / bounding-box analysis** (auto-rotoscoping, reference matching): `tsx capabilities/perception/reference-analyze.ts`. Gemini returns normalized `[ymin, xmin, ymax, xmax]` on a **0–1000** scale (origin top-left); we descale to pixels and feed the box to SAM 2 — no human clicks. When crafting a bbox prompt: demand the exact array format, 0–1000 normalization, one object per request, and a confidence value.
- **Hard facts about the model to respect in prompts:** timestamps land in ~1-second buckets (don't ask for frame-exact timing — that's Whisper's job; STT is OpenAI `whisper-1` only); it reads `video/mp4` etc.; it needs an explicit output schema or it rambles; it will wrap JSON in ```json fences unless told not to.

**Brand/format constraints every reviewer prompt should encode when relevant** (read the user's `brand/brand.json` for the concrete values — colors, tone, voice, brandWords):
- Colors, fonts, and logo come from `brand/brand.json` (`colors`, plus any logo/font fields). Reviewer prompts should check rendered output against those tokens.
- **9:16 safe zone:** captions/CTA must stay **out of the bottom ~480 px** (platform UI). This is an engine policy. (Verify against a measurement too — Gemini over-flags this.)
- **Tone register:** follow the tone rules in `brand/brand.json` (`tone.register`, `tone.sellStyle`, `tone.language`). For example, a soft/understated `sellStyle` means no aggressive "BUY NOW / AMAZING" hard-sell — evidence-led copy instead. Mind language-specific text expansion and that any non-ASCII characters render correctly; captions ~4–6 words/line.
- Kinetic captions are typically word-by-word, with emphasis words in the brand accent color.
- Audio target: −14 LUFS integrated / −1 dBTP true-peak.

---

## PART 2 — VIDEO-EDITING CRAFT VOCABULARY (so reviewer prompts ask EXPERT questions)

Feed the relevant items below into the specialist persona so it judges like a pro, not a layperson.

- **Pacing / ASL (Average Shot Length):** short-form ads/reels run hot (ASL ~1.5–3 s, a pattern-interrupt every 1.5–3 s, hook in first 3 s, face/motion in frame 1, audio sting at 0.0 s, designed for 90% muted viewing → caption-first). Long-form tutorials breathe more but must beat the ~55–65% retention lull with re-hooks.
- **Cut taxonomy:** hard cut, **J-cut** (audio leads picture), **L-cut** (audio lags), **match cut**, **jump cut** (intentional energy vs. accidental continuity break), cutaway/B-roll insert, smash cut. A reviewer must distinguish *intentional jarring* from *broken*.
- **Murch's Rule of Six** (priority order for whether a cut works): 1) Emotion (51%), 2) Story, 3) Rhythm, 4) Eye-trace, 5) 2D plane of screen / stage-line, 6) 3D spatial continuity. Emotion outranks technical continuity — a reviewer should weight "does the cut feel right emotionally" above a minor continuity slip.
- **Continuity:** the **180° rule** (camera stays one side of the action line so screen direction is consistent), eyeline match, consistent screen direction, prop/wardrobe/lighting continuity across a cut.
- **Kinetic typography:** word-by-word reveal synced to speech, emphasis on stressed words, legible weight/stroke, never crossing the safe zone.
- **Audio craft:** music ducks under VO (sidechain, ~8–10 dB, attack ~10 ms / release ~200 ms), music in at 0.3–0.5 s, fades ≥ ~0.5 s, SFX layered ≤ 3 at once across frequency bands; dialogue leveled, no clipping, no dead air.
- **Transitions discipline:** most cuts should be straight cuts; effects (whoosh, glitch, zoom) earn their place on beats/pattern-interrupts, not decoration.

---

## PART 3 — THE GEMINI COUNCIL ROSTER (the personas you craft prompts for)

Each is a **separate, single-purpose, world-class expert**. When asked for one, give it ONLY its lens + the forcing functions (PART 0) + the relevant craft/film vocabulary, and the JSON contract. Never blend lenses into one prompt.

1. **Detail / artifact spotter** — persona: *world-class VFX QC artist*. Must scan every quadrant of every sampled frame for: AI warping, extra/merged fingers or limbs, melted or duplicated edges, text/logo errors, **matte fringing / edge halos / light-wrap failures**, temporal flicker, banding, compression blocking, ghosting, on-screen typos. The hardest, most valuable lens — it catches what makes a shot read as "fake."
2. **Transition analyst** — persona: *master editor*. Cut rhythm/ASL, jump-cut quality, J/L-cut execution, continuity & 180°, whoosh/SFX alignment to the cut frame, jarring-vs-intentional (apply Rule of Six).
3. **Story → B-roll → consistency expert** — persona: *showrunner/story editor*. Does each B-roll/overlay/cutaway match the VO meaning at that exact moment? Narrative coherence; does the visual support or fight the script; are inserts motivated or random.
4. **Brand & safe-zone compliance** — persona: *brand guardian*. Check against the brand tokens/fonts/logo in `brand/brand.json`; captions & CTA out of the bottom 480 px (9:16, engine policy); the tone rules in `brand/brand.json` (no hard-sell when the sellStyle is understated); CTA presence + timing.
5. **Composition & visual hierarchy** — persona: *cinematographer/DP*. Framing for the target aspect, rule of thirds, headroom/lead room, focal clarity, leading lines, depth layering, text legibility/contrast, crop safety.
6. **A/V sync & pacing** — persona: *supervising sound editor + retention analyst*. Word/lip sync (flag where picture and speech drift — note Whisper has the exact ms), music duck under VO, dead air, energy/retention curve shape.
7. **Color & exposure consistency** — persona: *senior colourist*. Grade continuity across cuts, **skin-tone** naturalness, exposure/white-balance match shot-to-shot, and **match between any composited/generated element and the base plate** (the #1 tell of a fake composite).

(Roster is extensible — when a review loop finds a recurring failure, add a specialist for it.)

---

## PART 4 — FILMMAKING FUNDAMENTALS (vocabulary for world-class personas)

Use these so a persona reasons with real craft terms, which sharpens its findings.

- **Shot sizes:** ECU, CU, MCU, MS, MLS, WS/LS, establishing, two-shot, OTS (over-the-shoulder), insert. Wrong shot size for the beat = a finding.
- **Camera movement:** pan, tilt, dolly/track, crane/jib, push-in/pull-out, handheld, whip-pan, static lock-off. Movement should be motivated; jerky/unmotivated moves = a finding.
- **Lens & focus:** focal length & compression, depth of field (shallow vs deep), rack focus, focus errors (soft on subject) = a finding. Shutter/motion-blur should match motion (strobing/judder = a finding).
- **Lighting:** 3-point (key / fill / rim), motivated source, high-key vs low-key, contrast ratio, hard vs soft, colour temperature (warm ~3200K / daylight ~5600K), blown highlights / crushed blacks = findings.
- **Color:** **correction** (neutralize exposure/WB/contrast — make it technically right) vs **grade** (a look/mood — teal-orange, film emulation). Watch skin tones, consistent black point/white balance across cuts.
- **Composition:** rule of thirds, balance, negative space, leading lines, depth (fg/mg/bg), headroom, lead/nose room, horizon level, symmetry vs dynamic.
- **Compositing realism cues (for the detail/color personas to judge a fake):** grain match, edge quality (no hard cut-out or halo), **light wrap** & spill, contact shadow, perspective/scale plausibility, **colour & black-level match**, motion-blur match, temporal stability. A composite fails when any of these mismatch the plate.
- **Continuity & grammar:** 180° action line, eyeline match, screen direction, the 30° rule (avoid tiny angle jumps), match-on-action.

---

## PART 5 — GEMINI-VISION PROMPT PATTERNS (apply when crafting)

- **Open with the persona + the leniency-buster:** "You are a [world-class X]. You are reviewing [N] sampled frames at [fps]. Default to skepticism: report every visually-grounded concern; never write 'looks good' without cited evidence; never invent a defect."
- **Force coverage:** "For EACH sampled frame, examine the four quadrants and the lower-third separately."
- **Constrain scope to the lens:** "Report ONLY [color / transitions / artifacts / …]. Ignore everything outside your lens — other reviewers cover those."
- **Demand the JSON contract (no fences):** a top-level object with `verdict` (`ship|fix|rework`), `blocker_count`, and `findings[]` where each finding = `{ time_s, region, observation, why_it_matters, severity, fix }`. State: "Output valid JSON only. No markdown, no prose outside the JSON."
- **Ground, don't adjudicate:** "Describe what you SEE; do not judge loudness, exact frame timing, or pixel-exact safe-zone — those are measured separately. Flag *visual* safe-zone risk as `minor` for measurement confirmation."
- **For bbox:** "Detect [single object]. Return `{box:[ymin,xmin,ymax,xmax] (0–1000, origin top-left), label, confidence}` only."
- **For generative-VFX prompts (Runway/Veo/Seedance):** specify subject + lighting (match the plate's analyzed lighting from describe-mode) + camera + **"isolated on pure black background, no environment"** when the element will be screen-blended, + negative terms (text, watermark, people, overexposure) where supported; request seed for reproducibility.
- **Repetition:** `gemini-3.1-flash-lite` runs effectively non-reasoning at low effort — for position-sensitive recall (long video, "find X in the frame") consider the prompt-repetition technique (see `PROMPT-REPETITION-TECHNIQUE.md`).

---

## PART 6 — WHERE TO GO DEEPER (project source of truth)

- Perception capabilities (describe / qa / council / reference) usage and CLI flags: `capabilities/perception/README.md`.
- Engine wiki — the Gemini model rule, council design, and pipeline overview: `CAPABILITIES.md` (see §13).
- Brand config (colors, tone, voice, brandWords): `brand/brand.json`.
- Remotion components: `src/components/`.
- Project manifests: `projects/<name>/`.
