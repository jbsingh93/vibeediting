# Template — identity-consistent multi-shot character

**Use when:** the same character (typically the presenter) must appear in 2+ shots with identity preserved.

**Router decision (GAP-50):** Hybrid — `Veo 3.1 Standard (Ingredients)` for the connective shots,
`Runway Gen-4.5 (Gen-4 References)` for the detail close-ups.

**Hard rules:**
- **Repeat the character descriptor verbatim word-for-word** across every shot's block.
- **Contact-sheet refs:** assemble a 2x2 grid PNG with neutral expression + even light, multi-angle.
- 15+ descriptors total; identity drift correlates inversely with descriptor count.

**Character descriptor block (sample — adjust per subject, then paste UNCHANGED in every shot):**

```
{{character_descriptor_verbatim: "entrepreneur, mid-30s, dark short hair styled forward,
square jawline, slight stubble, warm brown eyes, neutral grey hoodie, no glasses, calm direct gaze."}}
```

**Multi-shot prompt template (Veo Ingredients, timestamps):**

```
[00:00-00:03] Medium shot, static, soft window-left key. {{primary_action}}. {{character_descriptor_verbatim}}.

[00:03-00:06] Close-up, 50mm look, same key direction. {{secondary_action}}. {{character_descriptor_verbatim}}.
```

**Wrapper invocation (Veo Ingredients):**
```
tsx capabilities/vfx/generate/veo.ts \
  --prompt "<fill template>" \
  --reference public/<project>/refs/contact-sheet-presenter.png \
  --duration 6 --aspect 16:9 --resolution 1080 \
  --negative "face morphing,identity drift,extra fingers" \
  --out out/work/<project>/vfx/multishot-veo-v1.mp4
```

**Wrapper invocation (Runway References for the close-up):**
```
tsx capabilities/vfx/generate/runway.ts \
  --prompt "Close-up portrait, slow push-in. <character descriptor verbatim>." \
  --reference public/<project>/refs/contact-sheet-presenter.png \
  --duration 4 --aspect 16:9 --resolution 1080 --seed 42 \
  --out out/work/<project>/vfx/multishot-runway-v1.mp4
```

**Rules of record:** the matching wrapper header (§"Identity Consistency".).
