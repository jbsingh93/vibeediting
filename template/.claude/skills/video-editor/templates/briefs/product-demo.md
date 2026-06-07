# Brief — Product Demo / Screencast

For screen recordings of software/UI with overlays, callouts, intro/outro.

---

SOURCE: public/screencap.mp4

PROBE FIRST:
  tsx capabilities/ingest/probe-asset.ts public/screencap.mp4

Source dimensions: <typically 1920×1200 or 2560×1600>

---

COMPOSITION:
  width: 1920
  height: 1080
  fps: 60 (60fps for smoother UI motion)
  durationInFrames: <duration × 60>

---

## TREATMENT

CONTAINER: pillar-box screencap centered
  - 32px rounded corners
  - Drop shadow: 0 24px 48px rgba(0,0,0,0.4)
  - Background: gradient or brand-color solid (useBrand() tokens)

CURSOR HIGHLIGHT: ring follows pointer
  - Render <CursorHighlight x={x} y={y} radius={40} />

CALLOUTS: at key UI moments
  - Type: arrow | circle | underline | bracket
  - From frame: ___, To frame: ___
  - Target: { x, y, width, height } on the screencap (in screencap coordinates)

SPEED RAMP:
  - 1× for typing segments
  - 2× for navigation segments
  - Use OffthreadVideo's playbackRate prop

---

## INTRO (3s)

- Logo sting
- "How to <feature>" title
- Use <LogoSting variant="intro" /> + <HookText>

---

## OUTRO (5s)

- CTA card
- "Sign up" / "Learn more" / "Book a call"
- Use <CTAButton text={...} />

---

## CALLOUT EXAMPLES

```tsx
<CalloutArrow
  from={420}    // start frame
  to={510}      // end frame
  target={{ x: 1200, y: 380 }}   // point arrow at this UI element
  direction="from-bottom-right"
  text="Click here to deploy"
/>

<CalloutCircle
  from={600}
  to={720}
  target={{ x: 540, y: 380, radius: 80 }}
  pulse={true}
/>

<CalloutUnderline
  from={800}
  to={870}
  target={{ x: 200, y: 600, width: 400 }}
  color="<brand accent>"
/>
```

---

## AUDIO

VO: optional
  - If present: keep source clicks/UI sounds, layer VO at full volume, duck source to 0.3
  - If absent: keep source clicks/UI sounds, add music

MUSIC: ambient/lofi at -18dB
SFX: subtle clicks already in source — don't add more

---

## EXPORT

Preset: youtube-1080
Render with: `tsx capabilities/deliver/render-preset.ts`
Output: out/demo_youtube_16x9_<duration>s_<feature>.mp4
Loudnorm: -14 LUFS / -1 dBTP

Preview in the cockpit Player via `vibe ui`. Frame checks: `npx remotion still`.
