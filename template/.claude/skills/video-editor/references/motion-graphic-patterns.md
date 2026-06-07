# Motion-Graphic Patterns Library

14 named patterns the Skill ships as ready-to-use components in `templates/components/`.

## Quick lookup table

| Pattern | Component | When to use |
|---|---|---|
| Animated tweet card | `<TweetCard>` | Social proof, viral quote |
| Animated chat thread | `<ChatThread>` | Testimonial dialogue, "how it went" |
| Animated bar chart | `<BarChart>` | Comparisons, before/after data |
| Animated notification toast | `<NotificationToast>` | Mid-video callout, reminder |
| Animated highlight card | `<HighlightCard>` | Reading viewer comments aloud |
| Animated map / route | `<MapRoute>` | Travel, journey, transformation |
| Animated counter | `<Counter>` | Revenue claim, follower count, stat |
| Animated checklist | `<Checklist>` | Feature lists, "what you'll learn" |
| Animated quote card | `<QuoteCard>` | Authority quotes, testimonials |
| Animated timeline | `<Timeline>` | Company history, roadmap |
| Animated split-compare | `<SplitCompare>` | Before/after transformations |
| Animated lower-third | `<LowerThird>` | Speaker/chapter ID |
| Animated logo sting | `<LogoSting>` | Intro/outro, brand consistency |
| Animated emoji reaction | `<EmojiReaction>` | Livestream-style reactions |

## Pattern details

### 1. Animated tweet card
- Card scale-pop in (300ms, ease-out, 1.05 overshoot)
- Body text fade in 200ms after
- Like/retweet count increments after 800ms with spring counter
- SFX: notification ding on entry; pop on engagement counter

### 2. Animated chat / message thread
- Each bubble: translateY(20→0) + scale(0.92→1.0) + opacity, 250ms ease-out
- Typing dots pulse at 600ms cycle for ~1.2s before next bubble
- SFX: iMessage swoosh on send, pop on receive

### 3. Animated bar chart / leaderboard
- Bars grow from left with ease-out (600–900ms)
- Value counter ticks up synchronized to bar growth
- Reordering uses FLIP (translateY tween 400ms)
- SFX: subtle ascending tone as bars fill; tick on rank change

### 4. Animated notification toast
- Slide in from top (translateY(-100→0), 300ms ease-out, slight overshoot)
- Auto-dismiss after 2.5–4s with slide-out (200ms ease-in)
- SFX: notification ding

### 5. Animated highlight card (community/comment)
- Scale-pop in (1.0 from 0.8 with overshoot 1.05, 350ms spring)
- Subtle shimmer or border glow loop for emphasis
- SFX: warm chime

### 6. Animated map / route line
- Path stroke-dashoffset animation 0→length over 1.5–3s ease-in-out
- Icon translates along path (use `getPointAtLength()` from `@remotion/paths`)
- Pin drop with bounce at endpoints
- SFX: subtle whoosh while drawing; pin-drop thunk at end

### 7. Animated counter
- Linear interpolation from 0 to target; 800–1500ms
- Ease-out for "settling" feel
- Optional digit-flip / slot-machine style
- SFX: rising synth or digital ticker; final tick on land

### 8. Animated checklist
- Each item: text fade in (200ms) → checkbox stroke-draw (250ms) → checkmark scale-pop (200ms spring)
- Items stagger 400ms apart
- SFX: tick on each check

### 9. Animated quote card
- Quote glyph scale-pop first (300ms)
- Body text per-line stagger fade-in (180ms each)
- Attribution slides up from bottom 200ms after last line
- SFX: subtle string swell or page-turn

### 10. Animated timeline
- Axis line draws (600ms ease-in-out)
- Each node scale-pops in sequence (200ms each, 400ms apart)
- Labels fade in after their node
- SFX: tick on each node

### 11. Animated split-screen comparison
- Divider draws from top (300ms)
- Halves slide in from outside (400ms ease-out)
- Labels fade in 200ms after
- SFX: vertical whoosh on divider; thud on label

### 12. Animated lower-third
- Accent bar slides in from left (200ms)
- Name slides in 100ms later (200ms)
- Subtitle fades in 100ms after
- Hold 4-6s; reverse animation on exit
- SFX: subtle whoosh on entry only

### 13. Animated logo intro/outro (sting)
- 1.5–3s total: build (0.5s) → reveal (0.7s) → hold (0.5s) → optional tagline (0.5s)
- SFX: branded audio mnemonic (ESSENTIAL — like Netflix "ta-dum")

### 14. Animated emoji reaction popup
- Scale-pop (0 → 1.2 → 1.0 with spring, 350ms)
- Float up & fade after 1.5s
- SFX: pop + light cheer/airy chime

## Reuse CODE, never CONTENT

Reuse the **component / code pattern**, never the rendered content. Graphics are 100%
context-specific per video — the data, copy, avatars, and B-roll inside a pattern belong to one
video only. Carry the `<TweetCard>` *implementation* forward and re-skin it with this video's data
and brand; never carry the previous video's filled-in card. Reusing actual graphic/B-roll content
across videos makes them feel templated and breaks the per-video narrative.

## How Claude should use these

When the user asks for any of these visual patterns:

1. Check if the corresponding component exists in `src/components/patterns/` (the user's project)
2. If not, copy from `${CLAUDE_SKILL_DIR}/templates/components/<Pattern>.tsx` to `src/components/patterns/<Pattern>.tsx`
3. Import in the composition; pass props
4. Don't re-derive from scratch — drop-in components, brand-consistent, tested

```tsx
// Example — fill with THIS video's data, never a reused card
import { TweetCard } from '../../components/patterns/TweetCard';

<Sequence from={120} durationInFrames={150}>
  <TweetCard
    avatar={staticFile('testimonials/avatar-01.jpg')}
    name="Customer name"
    handle="@handle"
    text="Cut my editing time from hours to minutes with 90-95% accuracy."
    likes={342}
    retweets={48}
  />
</Sequence>
```

## SFX layering rule

Each pattern has a recommended SFX. When using multiple patterns in one scene:
- Max 2-3 simultaneous SFX
- Spread across frequency bands (sub, mid, high)
- All SFX -3 dB under VO if VO is present
