<!-- VIBE:GENERATED {{VIBE_VERSION}} — edit freely; `vibe upgrade` never overwrites files you change. -->

# Editing Protocol — the numbered craft standard (SSOT)

This is the binding, **numeric, checkable** standard for what "world-class" means in this project.
It is the single source of truth shared by THREE consumers:

1. **You, the editor agent** — plan and build to these rules (the [video-editor SKILL](../SKILL.md) routes here).
2. **The Gemini specialist panel** — `capabilities/perception/specialists.ts` grades the render
   rule-by-rule against these IDs (`perception-council` on ingest, `gemini-council` on delivery).
3. **The split verifier** — `capabilities/orchestrate/verify.ts` routes each rule to the right owner.

Every rule is one line, carries a **threshold**, and a **verifier tag** that says *who is authoritative*.
A rule is never "vibes" — it either passes a measurement, a Gemini perceptual judgment, or escalates
to a human.

> **Why numbers, not adjectives.** "Cuts feel good" can't be checked. "No hard cut between two
> shots of the same size without a ≥15% zoom delta" can. The whole point is to turn taste into a
> falsifiable bar so the editor plans to it and the panel grades against it. (Rationale travels with
> each rule — you tune intelligently, you don't obey blindly.)

---

## Verifier tags — who decides

| Tag | Owner | Gemini's role |
|---|---|---|
| `[GEMINI]` | the specialist panel | **authoritative** — perceptual/semantic judgment |
| `[METER]` | ffmpeg / loudness.py / RMS-envelope / scene-detect | Gemini flags risk as `unsure`; the meter decides |
| `[WHISPER]` | OpenAI `whisper-1` word timing | Gemini judges *feel* only |
| `[CUT-DOCTOR]` | Whisper-grounded cut surgery | Gemini flags perceptually; cut-doctor gives the frame |
| `[VAD]` | voice-activity detection (venv) | Gemini flags perceptually |
| `[PLAN]` | the storyboard / `broll_plan` / `manifest.notes` | Gemini judges render vs promised beat |
| `[HUMAN]` | the user (escalate) | Gemini advises; never auto-discounts |

**Governing rule (from `verify.ts`):** a Gemini `pass` NEVER overrides a failed `[METER]`. The panel
adds findings and raises trust on perceptual lanes; it can't excuse a number. `[HUMAN]`-only blockers
escalate to approval, they don't auto-resolve.

---

## A — AUDIO ARCHITECTURE  (specialist: `sound`)
| # | Rule | Threshold | Tag |
|---|---|---|---|
| A1 | Continuous music bed; level never floors to silence on a cut | bed RMS never → −∞ at any cut | `[METER]`+`[GEMINI]` |
| A2 | Music ducks under VO and recovers in gaps | 8–10 dB duck, ~10 ms attack / ~200 ms release | `[METER]` |
| A3 | Dead air removed | no speech gap > 0.4 s | `[VAD]` |
| A4 | SFX glue on events | text-entry → ~0.1 s pop; layout/transition → ~0.3 s swoosh | `[GEMINI]`+`[METER]` |
| A5 | Delivery loudness | −14 LUFS integrated / −1 dBTP | `[METER]` |

## C — CUT ENGINEERING  (specialist: `cut`)
| # | Rule | Threshold | Tag |
|---|---|---|---|
| C1 | No same-size cut on the same subject | shot-size change OR ≥15% zoom delta at the cut | `[GEMINI]` |
| C2 | Every naked face-cut is covered | b-roll, or ≥4% zoom-punch over ~0.13 s | `[GEMINI]`+`[PLAN]` |
| C3 | J/L-cut bridge at scene seams | audio leads/lags picture ~0.3 s | `[WHISPER]` |
| C4 | No cut mid-word; no cut before a verbal setup pays off | sentence/word boundary respected | `[CUT-DOCTOR]` |
| C5 | ASL in band + re-hook at the lull | ads/reels 1.5–3 s, tutorial 4–8 s; re-hook at 55–65% | `[METER]`+`[GEMINI]` |

## V — VISUAL MEANING  (specialist: `broll-concept`)
| # | Rule | Threshold | Tag |
|---|---|---|---|
| V1 | Hook visual present immediately | real promise/pattern-interrupt on screen ≤ 0.5 s | `[GEMINI]`+`[PLAN]` |
| V2 | Visual coverage | ≥ 70% of runtime has a meaningful visual over the talking head | `[PLAN]`+`[METER]` |
| V3 | Every overlay maps to the VO meaning at that second | the "reason" gate (no decorative filler) | `[GEMINI]`+`[PLAN]` |
| V4 | Concept beats teach | the teach-test: restated-sentence = fail | `[GEMINI]` |
| V5 | Timing & recognizability | visual covers its own line, ends before the pivot, subject decodes < 0.5 s | `[GEMINI]` |
| V6 | Consistency & credibility | one locked render style; mix is not all-generated (real > stock > generated) | `[GEMINI]` |

## N — NARRATIVE  (specialist: `story`)
| # | Rule | Threshold | Tag |
|---|---|---|---|
| N1 | Hook creates an open loop | bold claim / question / pattern-interrupt in ≤ 3 s | `[GEMINI]` |
| N2 | Every setup pays off | no dangling promise | `[GEMINI]` |
| N3 | No verbal-setup→visual-only-payoff severance | hold A-roll until the line finishes | `[CUT-DOCTOR]`+`[GEMINI]` |
| N4 | No unredeemed retention sag | re-hook the 55–65% lull | `[GEMINI]`+`[HUMAN]` |
| N5 | CTA lands | present, single, lands hard (no soft "let me know what you think") | `[GEMINI]` |

## F — FRAMING & HIERARCHY  (specialist: `composition`)
| # | Rule | Threshold | Tag |
|---|---|---|---|
| F1 | Shot size fits the beat | — | `[GEMINI]` |
| F2 | Thirds / headroom / lead-room respected | subject not dead-center unless deliberate | `[GEMINI]` |
| F3 | Subject in focus & separated | — | `[GEMINI]` |
| F4 | Nothing important crops at the edge in the target aspect | reframe-safe | `[GEMINI]`+`[METER]` |

## K — COLOR & EXPOSURE  (specialist: `color`)
| # | Rule | Threshold | Tag |
|---|---|---|---|
| K1 | Exposure/WB correct | no blown highlights / crushed blacks losing detail | `[GEMINI]` |
| K2 | Skin tones natural & consistent | — | `[GEMINI]` |
| K3 | Grade continuous across cuts | shot B matches shot A of the same scene | `[GEMINI]` |
| K4 | Composites match the plate | black level / color / grain / light-wrap | `[GEMINI]` |

## D — DEFECTS & ARTIFACTS  (specialist: `detail`)
| # | Rule | Threshold | Tag |
|---|---|---|---|
| D1 | No AI warping / anatomy errors | extra fingers, melted edges | `[GEMINI]` |
| D2 | No matte halos / fringing on composites | — | `[GEMINI]` |
| D3 | No flicker / banding / compression artifacts | — | `[GEMINI]` |
| D4 | No on-screen typos / logo errors | OCR every text element | `[GEMINI]` |
| D5 | Animation eases | no pop-in / snap / mistimed reveal | `[GEMINI]` |

## P — PERFORMANCE  (specialist: `performance`)
| # | Rule | Threshold | Tag |
|---|---|---|---|
| P1 | Speaker reads as engaged/authentic, not wooden | — | `[GEMINI]` |
| P2 | Eye contact held at the key lines | — | `[GEMINI]` |
| P3 | Weakest delivery moments are cut or covered | — | `[GEMINI]`+`[HUMAN]` |

## T — TYPOGRAPHY & CAPTIONS  (specialist: `typography`)
| # | Rule | Threshold | Tag |
|---|---|---|---|
| T1 | Text legible at phone scale | weight/stroke/contrast/size | `[GEMINI]` |
| T2 | Words per page + reading speed | ≤ 3 (short) / ≤ 6 (default); ~12 chars/sec + ~1.5 s dwell | `[GEMINI]`+`[METER]` |
| T3 | Emphasis word colored & synced to the stressed word | brand accent | `[GEMINI]`+`[WHISPER]` |
| T4 | Font consistent; no overflow/clipping/bad breaks | — | `[GEMINI]` |
| T5 | Captions/CTA out of the 9:16 safe zone | not in the bottom 480 px | `[METER]`+`[GEMINI]` |

## B — BRAND & FORMAT  (specialist: `brand`)
| # | Rule | Threshold | Tag |
|---|---|---|---|
| B1 | Graphics on-palette | colors in `brand.json` `colors{}` | `[GEMINI]`+`[METER]` |
| B2 | Logo correct, undistorted, well-placed | — | `[GEMINI]` |
| B3 | Fonts match the brand | — | `[GEMINI]` |
| B4 | Copy obeys tone & sell-style | soft `sellStyle` bans "BUY NOW/AMAZING/pressure" | `[GEMINI]` |
| B5 | CTA present, on-brand, well-timed | aspect/duration vs target | `[GEMINI]`+`[PLAN]` |

---

## UNIVERSAL CORE vs STYLE PACKS

**Universal core** — these hold for EVERY video regardless of style; never overridden:
`A5` (−14 LUFS), `C4` (no mid-word cut), `V1`+`N1` (hook fast), `N5` (CTA lands), `F4` (no edge crop),
`T1` (legible), `T5` (safe zone), `D4` (no typos), `D1–D3` (no artifacts), `K1` (exposure not destroyed),
`B4` (on-tone).

**Style packs** — a named style overrides specific *thresholds* (not the core). The editor picks the
pack from the brief / `named-style-anchors.md`; the panel is told which pack is active via the intent
contract, so it doesn't "fail" an Apple-keynote edit for lacking Hormozi swooshes.

| Rule | Hormozi / kinetic | MKBHD / cinematic | Apple-keynote |
|---|---|---|---|
| C1 zoom-shift on cuts | **required (≥15%)** | optional | **off** (clean dissolves/holds) |
| C5 ASL band | 1.5–2.5 s (hot) | 3–6 s | 4–8 s (slow) |
| A4 SFX density | pops + swooshes everywhere | sparse, tasteful | minimal/none |
| V2 coverage | ≥ 80% | ~60% (footage breathes) | low (type + negative space) |
| T2 words/page | ≤ 3, word-punch | ≤ 6 | display type, 1 idea/screen |

> A style pack is just a JSON overlay of `{ruleId: threshold}` on top of this core — wire it into the
> intent contract so all three consumers read the same active thresholds.

---

## THE LEARNING LOOP (how this stays nuanced)

Every time the user manually fixes something the panel passed, that fix becomes either **a new
numbered rule in the right lane** (with a threshold + verifier tag) or, if it's perceptual, **a new
few-shot calibration anchor** for that specialist (`specialists.ts`). This is the
`feedback_round6_audit` method: failures crystallize into rules so the same defect never ships twice.
Append new rules here; bump the specialist's `inspect` checklist and `calibration` in lockstep.
