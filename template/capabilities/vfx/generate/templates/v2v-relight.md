# Template — v2v relight / restyle (existing clip)

**Use when:** an existing clip needs relighting (sky swap, warmer key, "golden hour from overcast") OR
a selective in-context edit (add/remove element, swap wardrobe color).

**Router decision (GAP-50):** `Runway Aleph` — purpose-built. ≤30 s / 10 cuts per request. Fallback: Seedance 2.0 `@Video1`.

**Hard rules (GAP-50 — the wrapper enforces these):**
- **Granular phrasing.** Never "Make it look better" — refused by the wrapper.
- **"Preserve [subject], [camera], [composition]"** clause is auto-appended.
- 15 credits/s — high. Lock down the brief before iterating.

**Prompt template (paste into `--prompt`):**

```
Change only {{specific_attribute: the sky from overcast grey to warm sunset orange with low golden light}}.
{{additional_specific_changes if any}}.
Preserve subject, camera, composition.
```

**Wrapper invocation:**
```
tsx capabilities/vfx/generate/aleph.ts \
  --prompt "Change only the sky to sunset orange with warm key light spilling onto the foreground." \
  --input-video test-video/<project>/source.mp4 \
  --duration 8 --aspect 16:9 --resolution 1080 \
  --subject "the speaker" \
  --out out/work/<project>/vfx/relit-v1.mp4
```

**Rules of record:** the matching wrapper header (§Aleph.).
