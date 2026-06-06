# Template — talking-head cutaway

**Use when:** the brief needs a B-roll cutaway of the on-camera presenter (identity-locked face) over the talking-head A-roll.

**Router decision (GAP-50):** `Veo 3.1 Standard` — Ingredients to Video for identity-lock. NEVER Seedance 2.0
(blocks realistic faces). Fallback: Seedance 1.5 Pro (lip-sync) → Runway Gen-4.5 (Gen-4 References).

**Prompt order:** `Camera/Cinematography → Primary Action → Environment → Lighting → Style → Audio`.

**Identity-lock checklist:**
- 3–4 contact-sheet reference images of the presenter (multi-angle, neutral expression, even light).
- Repeat the character descriptor *verbatim* in every shot's prompt block, e.g.:
  > "marketing entrepreneur, mid-30s, dark short hair, neutral grey hoodie, square jawline,
  > slight stubble, warm brown eyes."
  (Write YOUR presenter's descriptor once, then paste it word-for-word into every block.)
- 15+ descriptors total across the prompt — face morphing increases as descriptor count drops.

**Prompt template (paste into `--prompt`):**

```
[00:00-00:04] Static medium shot. {{primary_action}}, {{environment}}. Soft window-left key light,
gentle shadow on right cheek. {{character_descriptor_verbatim}}. Cinematic, raw footage, no overlay
text. Audio: ambient room tone only.

[00:04-00:08] Slow push-in (~2% over 4s). {{secondary_action}}. {{character_descriptor_verbatim}}.
Same lighting. Audio: same ambient bed.
```

**Wrapper invocation:**
```
tsx capabilities/vfx/generate/veo.ts \
  --prompt "<fill template>" \
  --reference public/<project>/refs/presenter-contact-sheet.png \
  --duration 8 --aspect 16:9 --resolution 1080 \
  --negative "watermark,subtitles,extra fingers,face morphing,identity drift" \
  --out out/work/<project>/vfx/talking-head-cutaway-v1.mp4
```

**Rules of record:** the Veo wrapper header (`veo.ts`) — "Ingredients to Video" + "Identity Consistency".
