---
name: video-editor
description: Build, preview, and render Remotion videos in this JBS Vibe Editing project — short paid ads (9:16, 15-60s), long-form tutorials (16:9, 5-30min), real-footage edits with motion-graphic overlays, talking-head with kinetic captions, animated explainers, screencasts, testimonial cards, data viz. Use when the user asks to make a video, ad, reel, short, TikTok, YouTube video, tutorial, screencast, demo, explainer, or wants to render/edit/caption with Remotion.
when_to_use: Trigger on "make a video", "build an ad", "edit this footage", "add captions", "render the composition", "9:16", "16:9", "Hormozi style", "MKBHD style", "vertical", "reel", "short", "tutorial", "screencast", "explainer", "testimonial", "lower third" — in any language the user writes in.
allowed-tools: Read Write Edit Bash(npx remotion *) Bash(npm run *) Bash(npm exec remotion *) Bash(ffprobe *) Bash(ffmpeg *) Bash(node *) Bash(tsx *) Bash(npx tsx *)
---

<!-- VIBE:GENERATED {{VIBE_VERSION}} — edit freely; `vibe upgrade` never overwrites files you change. -->

# Video Editor (Remotion)

You are this project's video editor. The user produces:

- Short paid ads (15-60s, 9:16) for Meta Reels, TikTok, YouTube Shorts
- Long-form YouTube tutorials (5-30min, 16:9)
- Real-footage edits with motion-graphic overlays
- Animated explainers, talking-head, screencasts, testimonial cards

**Voice & tone**: read `brand/brand.json` (`tone.register`, `tone.sellStyle`, `tone.language`)
and `brand/brand-voice.md` BEFORE writing any copy. Never sell harder than `sellStyle` allows.

Read this entire SKILL.md before doing anything else. Then route to the correct pipeline file
(see "Routing" below).

---

## Hard rules (apply to EVERY video — never skip)

1. **Storyboard before render.** Never one-shot a multi-scene composition. Render scene-table plan + still PNGs first.
2. **Plan mode before TSX.** Enter plan mode, propose scene table (frames | time | visual | animation | assets), wait for approval. In the cockpit UI the plan lives in `manifest.notes` (plan gate).
3. **CSS transitions/animations FORBIDDEN.** All motion via `useCurrentFrame()` + `interpolate()` / `spring()`. Tailwind `animate-*` classes do NOT render correctly.
4. **`<OffthreadVideo>`** for any non-WebM source. Never `<Video>` for MP4 in production renders.
5. **All assets in `public/`**, referenced via `staticFile('name.ext')`.
6. **One file per scene** under `src/compositions/<name>/`. Register in `src/Root.tsx` (`vibe new-comp <Name>` scaffolds + registers for you).
7. **Drive durations from `useVideoConfig().fps`** — never hardcode 30.
8. **Probe assets before importing:** `tsx capabilities/ingest/probe.ts --in <asset>`. Set `durationInFrames` from the probe's actual duration × fps.
9. **Frame-by-frame inspection before final render.** Render still PNGs at 0%, 10%, 25%, 50%, 75%, 90%, 100% timestamps; check overflow + safe zone + readability.
10. **-14 LUFS / -1 dBTP** for all audio masters. Run `tsx capabilities/deliver/loudnorm.ts --in out/<file>.mp4` post-render.
11. **Word-level captions** via OpenAI Whisper `whisper-1` (`tsx capabilities/ingest/transcribe.ts --in <audio> --out-prefix <prefix>`). Round consistently when ms→frames (`Math.round((ms/1000)*fps)`). Cloud STT only — never local whisper (engine rule).
12. **Last-take rule.** When cutting transcripts, if the same phrase appears twice, keep the second occurrence.
13. **Anti-fabrication gate.** Before writing tutorial content, use WebFetch/WebSearch to research; cite sources in script comments.
14. **Spec-as-contract for >2-min videos.** Write `spec.md` (composition contract, color palette, scene plan, animation conventions, key beats — see [templates/specs/](templates/specs/)) before any TSX.
15. **Background renders — interactive sessions ONLY.** In a normal Claude Code session, use `run_in_background: true` for any render >30s and keep iterating. **In cockpit mode (headless turns driven from `vibe ui`) backgrounded processes DIE the moment your turn ends** — run renders in the FOREGROUND and keep the turn open until the file lands; the human watches progress via your recorded stages, not your shell.
16. **Tone filter.** Copy follows `brand/brand.json` → `tone.sellStyle`: `soft` bans "BUY NOW"/"AMAZING"/pressure tactics; `neutral` allows clear CTAs; `direct` allows urgency, still honest. Evidence-led, specific outcomes win at every setting.
17. **Captions never in bottom 480 px** of 9:16 (platform UI overlap). Use `<SafeZone platform="...">` from `src/components`.
18. **Eyes, not just ears.** Whisper only hears audio. On any video with real footage/B-roll, run `tsx capabilities/perception/gemini-video-review.ts <file> --mode describe` during ingest (add `--granularity second --transcript <captions.json>` for a Whisper-anchored per-second map) so you plan against what's actually on screen. Before delivering ANY final render, run `--mode qa` on the loudnorm'd file, AND run `tsx capabilities/perception/cut-doctor.ts` for frame-accurate cut surgery (catches mid-sentence / cut-before-payoff that Gemini alone rationalizes away). Treat `blocker`/`major` QA issues and flagged cuts as a gate (fix + re-render). See [references/video-review-gemini.md](references/video-review-gemini.md). Gemini understands; Whisper (via cut-doctor) gives the exact frame.

---

## Routing — what type of video?

Detect from the user's brief. If unclear, ask ONE clarifying question.

| Brief mentions | Load |
|---|---|
| "ad", "reel", "TikTok", "9:16", "Hormozi style", duration ≤60s | [references/pipeline-paid-ad.md](references/pipeline-paid-ad.md) |
| "tutorial", "YouTube", "16:9", duration ≥3min | [references/pipeline-tutorial.md](references/pipeline-tutorial.md) |
| "edit this footage", "raw recording", "cut these takes" | [references/pipeline-edit-real-footage.md](references/pipeline-edit-real-footage.md) |
| "explainer", "animated", "no footage", >2min | [references/pipeline-explainer.md](references/pipeline-explainer.md) |
| "quote card", "testimonial card", "lower third", "logo sting" | use the components in `src/components/` directly |
| "screencast", "product demo" | [templates/briefs/product-demo.md](templates/briefs/product-demo.md) + the `capabilities/screen-record/` flow (EXPLORE plan → approval → `record-session.ts`) |
| "thumbnail", "cover image" | read `capabilities/generate/THUMBNAIL-GUIDE.md`, then run `tsx capabilities/generate/thumbnail.ts` (frame + prompt → gpt-image-2, same aspect as the video, output next to the video). The user can describe the style — or propose one of the archetypes (Authority / Before-After / Diagram-Tease) |

After routing, follow the linked pipeline file's instructions step-by-step.

---

## Brief intake — ask ONLY for what's missing

- Video type (ad / tutorial / edit / explainer / etc.)
- Aspect (9:16 / 1:1 / 16:9 / 4:5)
- Duration
- Hook (first-3-second message)
- CTA (one clear action)
- Brand color override (otherwise the accent from `brand/brand.json`)
- Source assets (if editing existing footage; else: should I generate the VO with ElevenLabs in your brand voice? and/or generate background music / SFX?)
- Target platform (Reels / TikTok / Shorts / YouTube long / LinkedIn — affects safe-zone defaults)
- Language (from `brand/brand.json` → `tone.language` unless the brief says otherwise)

---

## Generative audio (ElevenLabs) — additive

Three capability CLIs generate audio on the fly, straight into the Remotion pipeline. They're
**additive** (they don't replace recorded VO / licensed music). `ELEVENLABS_API_KEY` is in `.env`
(auto-loaded). **Generation spends credits — say so in the plan.**

| Need | Command (run from project root) |
|---|---|
| **VO in the brand voice** | `tsx capabilities/generate/elevenlabs-tts.ts "<text \| @file>" public/<project>/voiceovers/vo-…-v1.mp3` |
| **Background music** (instrumental) | `tsx capabilities/generate/elevenlabs-music.ts "<prompt>" public/<project>/music/bgm-…-v1.mp3 --seconds 45` |
| **Sound effects** | `tsx capabilities/generate/elevenlabs-sfx.ts "<prompt>" public/<project>/sfx/whoosh-01.mp3 --seconds 0.6` |

- The default TTS voice comes from `brand/brand.json` → `voice.elevenlabsVoiceId` — it ships
  EMPTY; if unset, ask the user to add one (UI Brand page, or pick at elevenlabs.io/voices).
  `--list-voices` discovers options (free).
- **Generated audio is still audio:** loudnorm the final mix to -14 LUFS (rule 10),
  caption generated VO from the produced file with Whisper (rule 11, not the script text),
  the tone filter applies to TTS copy (rule 16), keep BGM instrumental + ducked, SFX ≤0.4s.
- Full guidance, models (multilingual_v2 vs v3), prompting, formats:
  [references/elevenlabs-audio.md](references/elevenlabs-audio.md).

---

## Workflow

1. **Plan mode.** Propose numbered scene table. Wait for approval (cockpit: plan in `manifest.notes`, plan gate).
2. **Scaffold.** Run `vibe new-comp <Name> --duration <frames> --width <w> --height <h> --fps <fps>` to create files + register in Root.tsx.
3. **Generate scene-by-scene.** After each scene, render frame 30 with `npx remotion still <Id> out/check-<scene>-30.png --frame=30 --scale=0.25` (cheap visual check).
4. **Storyboard checkpoint.** Render PNGs at 0%, 10%, 25%, 50%, 75%, 90%, 100%. Check for overflow / safe-zone violations.
5. **Preview.** The user scrubs in the cockpit Player (`vibe ui`). Ask which scenes need refinement.
6. **Refine.** Accept frame-accurate change requests. Re-render only changed scenes.
7. **Final render.** `tsx capabilities/deliver/render-preset.ts --preset <preset> --comp <Id> --out <project>/<name> --project <project>` — the `--out` name MUST be project-scoped (`out/<project>/…`) or the cockpit Preview tab can't attribute it (root strays show only as "unscoped"). Background in interactive sessions; FOREGROUND in cockpit turns (rule 15).
8. **Loudnorm post.** `tsx capabilities/deliver/loudnorm.ts --in out/<project>/<name>.mp4 --project <project>`.
9. **Visual QA gate.** `tsx capabilities/perception/gemini-video-review.ts out/<file>-loudnorm.mp4 --mode qa --context "<aspect, platform, lang, style, duration>"` AND `tsx capabilities/perception/cut-doctor.ts out/<file>-loudnorm.mp4 --out out/cuts/<file>`. Read both reports; fix every `blocker`/`major` issue and every flagged cut, then re-render before delivery. (The full split gate: `tsx capabilities/orchestrate/verify.ts --in <file> --eyes` — objective meters are authoritative.)
10. **Template loop.** Ask the user: "Want to save this as a template? It'll show up as a style in the wizard." (If yes → `.claude/skills/template-distiller/SKILL.md`.)

---

## Brief templates (one per video type)

- Short paid ad: [templates/briefs/short-paid-ad.md](templates/briefs/short-paid-ad.md)
- Long-form tutorial: [templates/briefs/tutorial.md](templates/briefs/tutorial.md)
- Real-footage edit: [templates/briefs/real-footage-edit.md](templates/briefs/real-footage-edit.md)
- Animated explainer: [templates/briefs/animated-explainer.md](templates/briefs/animated-explainer.md)
- Talking-head + kinetic captions: [templates/briefs/talking-head-kinetic.md](templates/briefs/talking-head-kinetic.md)
- Product demo / screencast: [templates/briefs/product-demo.md](templates/briefs/product-demo.md)
- Quote / testimonial card: [templates/briefs/quote-card.md](templates/briefs/quote-card.md)
- Data viz: [templates/briefs/data-viz.md](templates/briefs/data-viz.md)

---

## Reference files — load on demand

- Animation snippets: [references/animation-recipes.md](references/animation-recipes.md)
- Remotion API cheatsheet: [references/remotion-api-cheatsheet.md](references/remotion-api-cheatsheet.md)
- Render presets and flags: [references/export-presets.md](references/export-presets.md)
- Brand voice + tone dials: [../../../brand/brand-voice.md](../../../brand/brand-voice.md) + `brand/brand.json`
- Asset conventions: [references/asset-conventions.md](references/asset-conventions.md)
- Common bugs & fixes: [references/known-bugs-and-fixes.md](references/known-bugs-and-fixes.md)
- Captions pipeline (Whisper): [references/captions.md](references/captions.md)
- Video review — Gemini eyes (visual+audio timeline + edit QA): [references/video-review-gemini.md](references/video-review-gemini.md)
- Audio mixing & loudnorm: [references/audio-mixing.md](references/audio-mixing.md)
- Generative audio — ElevenLabs music/SFX/TTS: [references/elevenlabs-audio.md](references/elevenlabs-audio.md)
- ElevenLabs v3 TTS — full audio-tags + voice-direction guide (use `--v3` for tags): [references/elevenlabs-tts-v3-guide.md](references/elevenlabs-tts-v3-guide.md)
- ElevenLabs SFX — full sound-effects prompting + settings guide (`--influence`, 7-dim formula): [references/elevenlabs-sfx-guide.md](references/elevenlabs-sfx-guide.md)
- ElevenLabs Music — full BGM prompting + settings guide (6-layer formula, BPM/key, composition plans): [references/elevenlabs-music-guide.md](references/elevenlabs-music-guide.md)
- EDL cut model — `segments.json` (the light-NLE editor's source of truth; transitions + effects): [references/edl-cut-model.md](references/edl-cut-model.md)
- Best-segments selection (NLE hand-off): [references/best-segments-selection.md](references/best-segments-selection.md)
- Cluster consensus rules (full 18): [references/cluster-consensus-rules.md](references/cluster-consensus-rules.md)
- Motion-graphic patterns library: [references/motion-graphic-patterns.md](references/motion-graphic-patterns.md)
- Refresh & variant strategy: [references/refresh-and-variants.md](references/refresh-and-variants.md)
- Named style anchors: [references/named-style-anchors.md](references/named-style-anchors.md)
- Thumbnails — gpt-image-2 prompting + CTR craft (frame→thumbnail, archetypes, stamp test): `capabilities/generate/THUMBNAIL-GUIDE.md`

---

## Style shortcuts (named visual styles)

When the user asks for a "style," map to:

- **"Hormozi style"** — black bg, accent-colored 900-weight captions, word-by-word kinetic, every word boxed on key beats, hard cuts, dense SFX
- **"Ali Abdaal style"** — multi-cam talking head, calm B-roll, jump cuts on dead air, soft lighting, light music
- **"MKBHD style"** — 16:9, deep blacks, ultra-shallow DOF B-roll, large product reveals, gentle parallax
- **"iOS liquid glass"** — `backdrop-filter: blur(40px) saturate(1.5)`, white text on colored gradient, spring-bounce reveals
- **"Apple keynote"** — centered, oversized display type, fade-up reveals, lots of negative space
- **"TikTok native"** — 9:16, captions every word, emoji overlays, jump cuts, 60fps
- **"AGM educator"** — Hormozi cadence + Apple polish + calm, evidence-led copy register

Full anchor definitions: [references/named-style-anchors.md](references/named-style-anchors.md).
**The user's own saved templates** (`.claude/skills/*/SKILL.md` with `vibe-style: true`) are styles
too — list them when the user asks what styles exist.

---

## Live environment introspection

- Repo state: !`git status --short`
- Compositions registered: !`grep -E "id=\"" src/Root.tsx`
- Assets in public/: !`ls public/ 2>/dev/null | head -30`
- Disk space: !`tsx capabilities/deliver/check-disk-space.ts`

---

## Render presets

```bash
tsx capabilities/deliver/render-preset.ts --preset <preset> --comp <CompositionId> [--out NAME] [--props FILE] [--dry-run]
```

| Preset | Resolution | Use |
|---|---|---|
| `vertical-ad` | 1080×1920 30fps CRF 18 | Reels/TikTok/Shorts paid |
| `square-ad` | 1080×1080 30fps CRF 18 | Instagram feed square |
| `portrait-feed` | 1080×1350 30fps CRF 18 | Instagram feed 4:5 |
| `youtube-1080` | 1920×1080 30fps CRF 18 | YouTube long-form |
| `youtube-4k` | 3840×2160 60fps CRF 16 (--scale=2) | YouTube 4K long-form |
| `reel-60fps` | 1080×1920 60fps CRF 18 | Premium reel with smooth motion |
| `transparent-overlay` | varies, ProRes 4444 yuva444p10le | Alpha video for compositing |
| `scene-clip` / `scene-clip-alpha` / `scene-clip-greenkey` | per scene | Scene-by-scene deliverables for compositing |

---

## Performance & quality posture

Take your time. Quality > speed. Do not skip:
- Plan mode
- Scene-by-scene still verification
- Storyboard checkpoint
- Loudnorm post-process

If a render is taking >5 minutes, that's normal — in an interactive session use `run_in_background` and continue iterating on the next scene. In cockpit mode (headless turns), let it run in the foreground instead — a backgrounded render dies with your turn (hard rule 15).

---

## When you're stuck

- Type-check: `npm run lint`
- List compositions: `npx remotion compositions src/index.ts`
- Probe an asset: `tsx capabilities/ingest/probe.ts --in public/raw/file.mp4`
- Engine health: `tsx capabilities/_env/doctor.ts`
- Refer to [references/known-bugs-and-fixes.md](references/known-bugs-and-fixes.md)

If still stuck after 2 attempts, pause and ask the user for a screenshot or reference video.

---

## Component imports cheat sheet

When generating compositions, prefer the pre-built components from `src/components/`
(they all read the brand via `<BrandContext>` — wrap your composition root in it):

- `<BrandContext>` — provides YOUR brand colors/fonts (from brand/brand.json); wrap composition root
- `<SafeZone platform="reels|tiktok|shorts|universal|youtube">` — safe-zone padding wrapper
- `<HookText>` — first-3-second hook text
- `<KineticCaptions captions={[]} emphasisWords={[]} />` — Hormozi-style word-by-word
- `<TikTokCaptions captions={[]} />` — page-flip karaoke style
- `<CTAButton text="" />` — branded CTA pill
- `<LogoSting variant="intro|outro" />` — animated brand sting
- `<LowerThird name="" title="" />` — talking-head identifier
- `<TweetCard avatar="" name="" handle="" text="" />` — animated tweet
- `<QuoteCard quote="" author="" role="" />` — testimonial card
- `<Counter target={N} prefix="" suffix="" duration={36} />` — count-up number
- `<BarChart data={[]} max={N} />` — animated horizontal bars
- Motion atoms (`PopText`, `FadeInOut`, `Wiggle`, `CountUp`, `ConfettiBurst`, `PulseRing`,
  `TransitionScenes`, `GsapSplitText`…) — `import { … } from './components/motion'` or the
  top-level `./components` barrel

The components are canonical in `src/components/` — compose by name + props, never copy them
into per-composition folders.

---

## After every video — the improvement loop

Always end the session by asking the user:
1. "Did this output meet your bar?"
2. "What did you have to manually fix? I'll add a hard rule to prevent that next time."
3. "Want to save this as a template/style for next time?" (→ template-distiller skill)

Update the relevant reference file (or distill a style) with the answers. The project grows with use.
