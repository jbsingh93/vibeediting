# Brief — Quote / Testimonial Card

For animated quote cards (8s typical). Drop-in component, minimal config.

---

COMPOSITION:
  width: 1080
  height: 1080  (or 1920 for 9:16)
  fps: 30
  durationInFrames: 240 (8s)

---

## TESTIMONIAL DATA

OPTION A — Use an existing testimonial JSON:
  Source: templates/assets/testimonials/<id>.json
  A fictional example ships at templates/assets/testimonials/jordan-lee.json.
  Add your own as JSON files in that folder (see the README there for the format).

OPTION B — Custom inline:
  ```json
  {
    "name": "<Name>",
    "role": "<Role / Brand>",
    "avatar": "/assets/testimonials/<file>.jpg",
    "quote": "<quote>",
    "metric": "<headline metric>"
  }
  ```

---

## COMPONENT

Use <QuoteCard> from the canonical barrel.

```tsx
import { QuoteCard } from '../../components';
import { staticFile } from 'remotion';
import testimonial from '../../../public/assets/testimonials/jordan-lee.json';

<QuoteCard
  quote={testimonial.quote}
  author={testimonial.name}
  role={testimonial.role}
  avatar={testimonial.avatar ? staticFile(testimonial.avatar) : undefined}
/>
```

(Brand color comes from useBrand() inside QuoteCard — your brand.json colors.)

---

## ANIMATION

- Avatar: spring scale 0→1 frames 0-30
- Quote glyph (large """): scale-pop frames 5-15
- Quote text: word-by-word fade-in, stagger 6 frames
- Attribution: fade up frames 60-90
- Hold to end (frame 240)

---

## STYLE

LAYOUT:
  - Background: gradient from brand[primary] to brand[accent] (useBrand() tokens)
  - Quote text centered
  - Font: serif display 600 OR brand heading 900 (depending on register)
  - Size: 56px for quote, 24px for attribution
  - Avatar circle 96px, top-center

LANGUAGE: <language code, e.g. en>

---

## SFX

- Subtle string swell on entry (optional)
- Page-turn on quote glyph (optional)

---

## EXPORT

Preset: square-ad (for 1:1) | vertical-ad (for 9:16)
Render with: `tsx capabilities/deliver/render-preset.ts`
Output: out/quote_<id>_<lang>_<aspect>.mp4
Loudnorm: -14 LUFS (if audio added)

Preview in the cockpit Player via `vibe ui`. Frame checks: `npx remotion still`.
