# Refresh & Variant Strategy

How to use Remotion's parametrization to generate ad variants and combat creative fatigue.

## Refresh cadence (Meta Ads)

| Funnel stage | Refresh cycle |
|---|---|
| Top of funnel (cold) | 5–7 days |
| Mid-funnel (retarget) | 10–14 days |
| Standard rule of thumb | every 2–4 weeks |
| High-spend (>$10k/wk) | weekly to biweekly |

Frequency cap signal: refresh when frequency >2.5/week and CTR drops >15%.

You don't need to rebuild from scratch — small "iterative refreshes" (new hook line, new B-roll opener, new CTA color) extend a winner's life. **Pre-build the refresh queue before fatigue hits.**

## The variant-from-CSV pattern

Drive variants from a CSV the marketer edits in a spreadsheet:

```csv
id,headline,cta,brandColor,vo
v1,"Stop scrolling.","Shop now","#FFE600","public/voiceovers/vo-en-v1.mp3"
v2,"Most marketers waste 80%.","See how","#FF6600","public/voiceovers/vo-en-v2.mp3"
v3,"AI is coming for your job.","Learn AI in 14 days","#00C2A8","public/voiceovers/vo-en-v3.mp3"
v4,"4-5 hours → 6 minutes.","Check the link","#FFE600","public/voiceovers/vo-en-v4.mp3"
```

`brandColor` values are placeholders — use your brand.json colors. Then run
`tsx scripts/variants-from-csv.ts <csv> <CompositionId>` to render one MP4 per row.

## Composition setup for variants

The composition takes typed props (Zod schema). Each variant supplies different prop values:

```tsx
import { z } from 'zod';
import { zColor } from '@remotion/zod-types';

export const adSchema = z.object({
  hookText: z.string().max(60),
  ctaText: z.string().max(20),
  brandColor: zColor(),
  voiceoverSrc: z.string(),
});

export const ShortAd: React.FC<z.infer<typeof adSchema>> = ({
  hookText, ctaText, brandColor, voiceoverSrc
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {/* Use props throughout */}
      <h1 style={{ color: 'white', fontSize: 96 }}>{hookText}</h1>
      <button style={{ background: brandColor }}>{ctaText}</button>
      <Audio src={staticFile(voiceoverSrc)} />
    </AbsoluteFill>
  );
};
```

## Variant batch render (Node script)

```ts
// scripts/variants-from-csv.ts
import { renderMedia, selectComposition } from '@remotion/renderer';
import { bundle } from '@remotion/bundler';
import { parse } from 'csv-parse/sync';
import fs from 'node:fs';
import path from 'node:path';

const [csvPath, compId] = process.argv.slice(2);
const variants = parse(fs.readFileSync(csvPath), { columns: true });

const serveUrl = await bundle({ entryPoint: path.resolve('./src/index.ts') });

for (const v of variants) {
  const composition = await selectComposition({ serveUrl, id: compId, inputProps: v });
  const outName = `out/${compId}_${v.id}.mp4`;
  await renderMedia({
    composition, serveUrl, codec: 'h264',
    outputLocation: outName,
    inputProps: v,
    crf: 18, pixelFormat: 'yuv420p', concurrency: 4,
  });
  console.log(`Rendered: ${outName}`);
}
```

Run: `tsx scripts/variants-from-csv.ts variants.csv ShortAd`

## Variant matrix planning

For a campaign launch, plan a matrix:

| Dimension | Values |
|---|---|
| Hook | 5 different hooks |
| CTA color | 3 colors |
| VO | 2 (male, female) |
| Music | 3 BPM profiles |

Don't render every combination (5×3×2×3 = 90 ads). Use **fractional factorial design**:

1. Render 5 hooks × 1 base setup → find winning hook
2. Take winning hook, render × 3 colors → find winning color
3. Take winning hook+color, render × 2 VOs → find winner
4. Take overall winner, refresh weekly with hook tweaks

This identifies the high-performing combination in ~10-15 renders, not 90.

## Platform CTA fan-out

Deliver per-platform variants of the same cut — the CTA must match the platform's native action:

- **YouTube** = "Subscribe" CTA
- **LinkedIn** = "Follow" CTA
- **Instagram / TikTok** = "Follow" / "Link in bio"
- Never ship a generic "comment below" CTA across platforms — it converts worst everywhere.

Render one master, then swap the CTA card + end-screen per platform from props.

## YouTube Shorts metadata

When delivering a Short, also produce the metadata:

- **Title**: keyword-first, ~40 characters (the searchable phrase leads).
- **Description**: 150–500 characters.
- **Hashtags**: 3–4, specific to the topic.

## Refresh queue (pre-build)

For each ad campaign, pre-build a refresh queue:

```
refresh-queue/
├── week-1/
│   └── ad_meta-reels_9x16_30s_v1-original.mp4
├── week-2/
│   ├── ad_meta-reels_9x16_30s_v2-new-hook.mp4
│   └── ad_meta-reels_9x16_30s_v2-new-cta-color.mp4
├── week-3/
│   ├── ad_meta-reels_9x16_30s_v3-new-broll.mp4
│   └── ad_meta-reels_9x16_30s_v3-new-music.mp4
└── week-4/
    └── ad_meta-reels_9x16_30s_v4-fresh-angle.mp4
```

Render the entire month upfront. When fatigue hits in week 1, swap in week-2 immediately.

## A/B test discipline

When testing variants:
- **Change ONE thing** between variant A and B (hook only, OR color only)
- Run for 7 days minimum to get statistical significance
- Need 100+ conversions per variant to call a winner
- Document the winner pattern; integrate into Skill via BIT loop

## Programmatic refresh (the agentic pattern)

Eventually, the Skill could:

1. Read Meta Ads Manager export (CSV of recent performance)
2. Detect fatigue signals (frequency > 2.5/wk, CTR drop > 15%)
3. Auto-generate 3-5 refresh variants based on the winning original
4. Stage in Meta Ads Manager via API for your approval
5. Apply BIT learnings: "this hook + this CTA combo wins for this audience"

This is the long-term arc. For now, manual refresh queue is sufficient.

## Naming convention for variants

```
{compId}_{variantId}_{description}.mp4

Examples:
ShortAd_v1_accent-cta.mp4
ShortAd_v2_green-cta.mp4
ShortAd_v3_new-hook.mp4
ShortAd_v4_testimonial.mp4
```

Allows easy filtering in `out/` and Meta Ads Manager.
