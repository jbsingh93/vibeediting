# Cluster Consensus Rules

The 18 rules that appear across every major public Remotion + Claude Code pipeline as of 2026. Treat them as defaults; deviate only with reason.

## The 18 rules

### 1. Storyboard before render
Never one-shot a multi-scene video. Render a scene-table plan or still PNG sequence first, get human approval, then commit to the full render.

### 2. Last-take rule
When cutting transcripts, if the same phrase appears twice consecutively, keep the second occurrence and cut the first. Detect via Whisper transcript + edit-distance matching (>0.85 similarity).

### 3. Render an HTML side-by-side script comparison page
When the editing pipeline trims raw footage, output `out/cut-review.html` showing original vs. proposed clean script before applying cuts.

### 4. 0.2-second word-gap default
For transcript-based cuts, trim silences >300ms down to ~150-200ms between sentences.

### 5. Inspiration folder pattern
Maintain a per-project `inspiration/` folder. Save every reference video, screen recording, and design inspiration. When designing new content, ask the user "do you have a reference?" before designing from scratch.

### 6. Plan mode before TSX
Always enter plan mode and propose a scene table before writing any composition code. Get ExitPlanMode approval first.

### 7. Anti-fabrication gate
Before generating tutorial content from a brief, use WebFetch/WebSearch to research the topic. Cite at least 2 sources in script comments. Do not write content from training-data memory alone.

### 8. Frame-by-frame layout-overflow inspection
After scaffolding a composition, render still PNGs at 0%, 10%, 25%, 50%, 75%, 90%, 100% timestamps. Visually check each for: text outside safe zone, layout overflow past frame boundaries, illegible text contrast.

### 9. Proxy file discipline
Never send 4K raw to APIs. Generate a 720p H.264 CRF 28 proxy via `tsx capabilities/deliver/make-proxy.ts`. APIs read the proxy; final Remotion render reads the original.

### 10. Folder-contract I/O between phases
Even in single-agent mode, enforce folder contracts: `01-ingest/`, `02-analyze/`, `03-edit/`, `04-storyboard/`, `05-compose/`, `06-render/`. Each phase reads from previous phase's folder, writes to its own.

### 11. BIT framework
**Build → Integrate → Tune**. After each successful video, ask the user what to add to the Skill. After each failed/manual-fix video, ask what hard rule should prevent the failure next time.

### 12. README-as-install-script
This SKILL.md is the install script. Written so Claude reads it and walks the user through setup without needing extra docs.

### 13. Two-workspace folder discipline (for long-form)
Script Lab (`scripts/` folder for prose scripts) + Animation Studio (the Remotion project). Keep them separate.

### 14. Spec-as-contract for >2-min videos
Mandatory `spec.md` before any TSX. Spec includes: composition contract, color palette, visual philosophy, scene plan, animation conventions, key beats.

### 15. `/clear` discipline at low context
When context drops below 25%, save state to `state.md` and tell the user to `/clear`. Resume from `state.md` in fresh session.

### 16. Don't try to do audio inside Remotion (for long-form)
For >5-min videos, default mode = render video-only from Remotion, recommend final audio polish in an external editor. For short ads where deterministic VO+music+SFX layering is preferred: audio inside Remotion is fine.

### 17. Audio↔animation sync via word-level timestamps
Caption pipeline always uses word-level granularity. Transcription is OpenAI `whisper-1` via the OpenAI API (`tsx capabilities/ingest/transcribe.ts`) with word-level timestamps — STT is OpenAI cloud only (binding engine rule).

### 18. Skills with absolute filepaths, not relative
Use `${CLAUDE_SKILL_DIR}` for skill-relative references. Use absolute project root via `${CLAUDE_PROJECT_DIR}` for asset references. Never relative `./` paths in shared code.

## Diagnostic prompt

When debugging an output that didn't meet quality bar, ask Claude:

> "Read references/cluster-consensus-rules.md. Cross-check the code/output you just produced against every rule. Report which were violated and either fix or justify."

Forces systematic review.
