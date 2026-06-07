# Brief — Animated Data Visualization

Bar chart races, counters, timelines, comparison reveals.

---

COMPOSITION:
  width: 1920
  height: 1080
  fps: 60 (smoother for numeric motion)
  durationInFrames: <typically 300-900 — 5 to 15s>

---

VIZ TYPE: <bar-race | counter | timeline | line-chart | pie | split-compare>

---

## DATA

Source: src/data/<dataset>.ts (typed with Zod) OR inline JSON

Example dataset:
```ts
export const salesByRegion = [
  { label: 'North',  value: 1200, color: '#4E9CFF' },
  { label: 'South',  value: 850,  color: '#00C2A8' },
  { label: 'East',   value: 540,  color: '#FF6600' },
  { label: 'West',   value: 410,  color: '#888' },
];
```

(In code, prefer useBrand() tokens over hardcoded hexes — your brand.json colors.)

---

## TITLE

Headline: <e.g., "User growth 2024 → 2026">
Subtitle: <optional source citation>

---

## COMPONENT BY VIZ TYPE

- bar-race → <BarChart bars={data} max={max} />
- counter → <Counter target={N} prefix="$" suffix="" duration={36} />
- timeline → <Timeline nodes={[{date, label}, ...]} />
- line-chart → <LineChart series={[...]} />
- pie → <PieChart slices={[...]} />
- split-compare → <SplitCompare beforeContent={...} afterContent={...} />

Import canonical components from the barrel: `import { BarChart, Counter, SplitCompare } from '../../components';`

---

## ANIMATION

- Stagger entries: 6-12 frames apart
- Bars/numbers/nodes interpolated over time (ease-out cubic)
- Numbers tick up: Math.round(interpolate(...))
- Y-axis labels with measureText for alignment
- END FRAME: hold 60 frames on final state for screenshot-ability

---

## NUMBER FORMATTING

Use the locale that matches your audience:
```tsx
const formatted = value.toLocaleString('en-US');   // 1,234,567
```

Currency:
```tsx
const usd = `$${value.toLocaleString('en-US')}`;
```

---

## STYLE

- Brand colors via useBrand() tokens (your brand.json colors)
- Font: brand heading (900) / body (400)
- Background: dark or light — match video context
- Axis labels: 24-32pt, medium weight
- Bar values: 32-48pt, bold weight

---

## SFX

- Subtle ascending tone as bars fill / counter ticks (optional)
- Tick on rank change (bar race)
- Final "thunk" on land

---

## EXPORT

Preset: youtube-1080 (or vertical-ad for 9:16 viz)
Render with: `tsx capabilities/deliver/render-preset.ts`
Output: out/dataviz_<topic>_<aspect>.mp4

Preview in the cockpit Player via `vibe ui`. Frame checks: `npx remotion still`.
