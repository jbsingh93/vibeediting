# THUMBNAIL-GUIDE.md — world-class thumbnails with `generate/thumbnail.ts`

Read this BEFORE writing a `--prompt`. Distilled from deep research into
(a) the gpt-image-2 API, (b) gpt-image prompting craft, (c) the CTR science of world-class
thumbnails. Sources at the bottom. Brand colors below come from YOUR `brand/brand.json`
(`colors.bg`, `colors.accent`, …) — substitute them wherever a hex appears.

## The pipeline (what the capability does)

```
finished video ──ffmpeg──▶ frame PNG ──/v1/images/edits (gpt-image-2-2026-04-21)──▶
  long-edge-2048 image in the SAME aspect ──ffmpeg scale/crop──▶
  "<video_name> thumbnail.png" NEXT TO the video (+ .jpg sibling if PNG >2 MB)
```

```bash
# default: midpoint frame, high quality, no in-image text
npx tsx capabilities/generate/thumbnail.ts --video "test-video/<p>/<name>.mp4" \
  --prompt "<creative direction — the CHANGE block>" --at 42 --project <p>

# 3 variants for YouTube Test & Compare; draft cheaply first with --quality low --dry-run
```

## Learned live (hard-won — do not relearn these)

- **Accented glyphs garble (CONFIRMED):** the model drew French œ for æ in two attempts, even
  with an explicit spell-it-out rule. é renders fine, but non-ASCII text in-model = NEVER.
  Use **two-stage**: generate the base text-free ("keep the top ~25% clean for text") →
  composite the headline in a Remotion still (a handwriting-class font at 700 weight with
  `latin-ext`, slight rotation + an SVG swoosh reads as hand-made).
- **Multi-line prompts MUST be `--prompt @file.txt`** — the Windows npx/cmd-shim truncates
  inline args at the first newline (symptom: `usage.input_tokens_details.text_tokens`
  suspiciously low, ~37 instead of ~340 — one wasted paid call taught us this).
- **Composition instructions must be quantified:** "upper quarter as clean space" produced a 55%
  ceiling and a tiny subject; "their head and shoulders fill the lower 70-75%, top of head
  25-30% down" landed exactly.
- `--aspect W:H` overrides the video's aspect (LinkedIn-feed 3:4 etc.).

## Hard rules (API)

1. **NEVER send `input_fidelity`** — gpt-image-2 removed it (the request fails). Face
   preservation is automatic + reinforced by the prompt scaffold.
2. **Pick the frame deliberately** (`--at`). Default is the midpoint, but YOU should choose:
   extract 3-5 candidate stills first (`ffmpeg -ss T -i in.mp4 -frames:v 1 out.png`), pick the
   one where the subject looks confident/engaged with eyes open and mouth not mid-word.
3. **Moderation false-flags real faces.** It IS the creator's own footage; the script defaults
   `--moderation low` and retries are legitimate — try another frame or softer wording, never
   try to "trick" the filter.
4. **Iterate cheap, finish high.** `--quality low` to lock composition (~$0.01), `high` for the
   final (~$0.17-0.21). Single-pass edits only — face drift compounds over many rounds.
5. **Non-ASCII text garbles in-model.** Default = NO in-image text; overlay headlines in
   Remotion (exact brand fonts, exact brand hex, `latin-ext` when needed). `--headline` only for
   short ASCII-safe text (≤4 words, ALL CAPS) — the script warns on non-ASCII glyphs.
6. Hex codes in prompts steer color but are **approximate** — exact brand color only via
   Remotion overlay.

## Prompt craft (what goes in `--prompt`)

The script wraps your text in the proven scaffold (CHANGE → PRESERVE → USE CASE → REALISM →
CONSTRAINTS), so `--prompt` is only the **CHANGE block**: concrete visual facts, not adjectives.

- ✅ "Replace the car interior with a premium dark studio backdrop in near-black <brand bg hex>,
  subtle radial vignette, soft <brand accent hex> rim light separating them from the background,
  key light from camera-left. Keep them on the left third; leave the right two-thirds as clean
  empty negative space for a headline."
- ❌ "Make it look amazing and professional with great lighting."

Specify: background, lighting direction, palette (hex), subject placement (thirds), negative
space, and what the empty zone is FOR. One change-set per call; refine with single-change
follow-up calls (re-run with the tweaked prompt — the scaffold restates the preserve list).

## The CTR science — encode these in every thumbnail

1. **One focal point, max 3 elements** (face + 1 object + 1 text block). >3 elements ≈ 23% lower CTR.
2. **Stamp test (hard gate):** view the result at ~120-160 px wide (mobile feed). If the focal
   point isn't instant and text isn't legible, it fails — re-do.
3. **Text: 0-3 words** (hard cap 4, never exactly 6). Text must ADD a hook, never duplicate the
   title. Heavy sans (Anton/Archivo Black-class) + thick contrasting stroke.
4. **Face = credible, not cartoonish.** Confident / focused / mildly-intrigued expression.
   For professional/B2B audiences the manic MrBeast-face reads as spam — understated wins
   (serious faces are rare in feeds and outperform). Light retouch only; no plastic AI skin.
5. **Eye contact OR gaze at the object/text — pick one deliberately** (viewers follow gaze).
6. **Contrast sells:** subject cutout-feel via rim glow/outline against a dark field; the brand
   accent as the ~10% pop (60-30-10). Avoid dominant red+white (melts into YouTube chrome).
   Text contrast ≥4.5:1.
7. **Rule of thirds + 30-40% negative space** reserved for the (Remotion) headline.
8. **Nothing important bottom-right** (YouTube duration badge) — and on 9:16, respect the usual
   bottom-480px platform-UI rule.
9. **Honesty gate:** the thumbnail must promise what the video delivers — YouTube's A/B winner
   is picked by watch-time-per-impression, not raw CTR; clickbait that bounces gets suppressed.
10. **Make 3 variants** (literal / curiosity / branded-clean) → YouTube **Test & Compare**
    (≤3 variants, 16:9 long-form only — NOT Shorts/live).

## Platform facts

- **YouTube 16:9:** 1280x720 spec, <2 MB (script auto-emits a JPG sibling when PNG busts 2 MB).
- **YouTube Shorts:** the swipe feed IGNORES custom thumbnails — frame 0 of the video is the real
  "thumbnail" there; the custom 1080x1920 one only shows on search/channel/hashtag surfaces.
- **LinkedIn:** custom thumbnail on native uploads only, **must match the video's aspect ratio**,
  <2 MB JPG/PNG — exactly what this capability outputs. Always set one (LinkedIn's auto-frame
  is usually terrible).

## Archetypes (proven starting points — adapt to your brand)

- **A. "Authority"** *(default talking-head 16:9)* — subject cutout-feel on one third, confident
  expression, dark brand-bg field, subtle brand-accent rim glow, 60-30-10, opposite 40% = clean
  negative space → Remotion headline (2-3 light words, ONE accent-colored power word).
- **B. "Before/After"** *(results/case/tutorial-outcome)* — split: desaturated problem-state vs
  clean accent-lit result, thin accent divider/arrow (ONE directional element),
  2-word labels ("BEFORE"/"AFTER" — overlay in Remotion), the subject's gaze toward the "after" side.
- **C. "Diagram-Tease"** *(tutorials/tool-walkthroughs)* — one premium glowing diagram/UI shot as
  focal object, slightly tilted for depth; the subject smaller on a third, gesturing toward it.
  For software content a clean interface shot beats a screaming face.

## Workflow (the skill's checklist)

1. Probe the video; pick 3-5 candidate frames; choose the best face/moment (`--at`).
2. Pick archetype (A default) + write the CHANGE block; choose headline strategy
   (default: none in-image → Remotion overlay afterwards).
3. `--dry-run` → sanity-check plan + prompt. Then `--quality low` draft → stamp test.
4. Final at `--quality high`, `--n 3` for A/B when it's a YouTube long-form.
5. Verify: stamp test at ~150 px, aspect matches video, file <2 MB for upload, face matches
   the source frame, nothing critical bottom-right.
6. If a headline needs non-ASCII glyphs: composite it in Remotion/ffmpeg over the generated
   art — never ask gpt-image to render them.

## Sources (research)

- API: developers.openai.com/api/docs/models/gpt-image-2 · /api/docs/guides/image-generation ·
  cookbook image-gen prompting guide · openai-node #1844 (≤6.34.0 images.edit bug; we ship 6.37.0)
- Craft: ThumbMagic design principles · Paddy Galloway packaging thesis (3 thumbs per 10 titles) ·
  thumbnail psychology research (faces/3-element/6-word-trap) · YouTube Test & Compare help ·
  TeraLeap B2B thumbnails · the 2025 AI-thumbnail backlash (PetaPixel) — authenticity wins.
