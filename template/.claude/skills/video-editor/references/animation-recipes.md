# Animation Recipes

Copy-paste snippets for common Remotion motion patterns. All snippets assume:
```tsx
import { useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from 'remotion';
const frame = useCurrentFrame();
const { fps, durationInFrames } = useVideoConfig();
```

Color literals below (`#FFE600`, `#00C2A8`, etc.) are placeholders — substitute your brand.json
colors (accent, success) at the call site.

## Fades

```tsx
// Fade in over 30 frames
const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });

// Fade in + hold + fade out
const opacity = interpolate(
  frame,
  [0, 20, durationInFrames - 20, durationInFrames],
  [0, 1, 1, 0],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
);

// Fade in with cubic ease-out (more polished)
const opacity = interpolate(frame, [0, 30], [0, 1], {
  extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
});
```

## Spring pop-ins

```tsx
// Snappy CTA pop (most common)
const scale = spring({
  frame, fps,
  config: { mass: 0.5, damping: 12, stiffness: 200 },
  durationInFrames: 12,
});

// Smooth UI element
const driver = spring({
  frame, fps,
  config: { damping: 18, stiffness: 100 },
  durationInFrames: 16,
});

// Playful overshoot (bouncy)
const scale = spring({
  frame, fps,
  config: { mass: 0.5, damping: 8, stiffness: 200 },
  durationInFrames: 14,
});

// Use spring as driver for any value
const x = interpolate(driver, [0, 1], [-100, 0]);
const opacity = interpolate(driver, [0, 1], [0, 1]);
```

## Slide-in patterns

```tsx
// Slide in from left
const driver = spring({ frame, fps, config: { damping: 18 }, durationInFrames: 16 });
const x = interpolate(driver, [0, 1], [-200, 0]);
const opacity = driver;

// Slide in from bottom (good for cards)
const y = interpolate(driver, [0, 1], [80, 0]);

// Slide in with arc (more organic — Disney "arcs" principle)
const x = interpolate(driver, [0, 1], [-100, 0]);
const y = interpolate(driver, [0, 0.5, 1], [0, -8, 0]);   // small arc, settles
```

## Word-by-word kinetic caption

```tsx
{words.map((w, i) => {
  const wordFrame = frame - i * 6;   // 200ms stagger @ 30fps
  const popScale = spring({
    frame: Math.max(0, wordFrame),
    fps,
    config: { mass: 0.5, damping: 12, stiffness: 200 },
    durationInFrames: 8,
  });
  const opacity = interpolate(wordFrame, [0, 4], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp'
  });
  return (
    <span key={i} style={{
      display: 'inline-block',
      transform: `scale(${popScale})`,
      opacity,
      margin: '0 8px',
    }}>{w}</span>
  );
})}
```

## Number counter (count-up)

```tsx
// Linear count up
const value = Math.round(
  interpolate(frame, [0, 36], [0, target], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  })
);
return <div style={{ fontSize: 200, fontWeight: 900 }}>
  {prefix}{value.toLocaleString()}{suffix}
</div>;
```

## Parallax zoom (Ken Burns)

```tsx
// Slow zoom 1.0 → 1.05 over full duration
const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.05]);

// More aggressive zoom on a specific scene
const scale = interpolate(frame, [0, 60], [1.0, 1.15], {
  extrapolateRight: 'clamp',
  easing: Easing.inOut(Easing.cubic),
});

// Apply
<div style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}>
  <OffthreadVideo src={...} />
</div>
```

## Blur in (focus pull effect)

```tsx
const blur = interpolate(frame, [0, 30], [20, 0], {
  extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
});
<div style={{ filter: `blur(${blur}px)` }}>{children}</div>
```

## Zoom punch (talking-head pattern interrupt)

```tsx
// Trigger at frame N (the moment of cut)
const punchFrame = frame - 0;   // adjust to cut moment
const scale = punchFrame < 0
  ? 1
  : punchFrame < 6
    ? interpolate(punchFrame, [0, 6], [1, 1.08], { easing: Easing.out(Easing.cubic) })
    : 1.08;
<OffthreadVideo style={{ transform: `scale(${scale})` }} src={...} />
```

Pair with a soft "thump" SFX at frame 0.

## Underline draw-on (emphasis)

```tsx
import { evolvePath } from '@remotion/paths';

const progress = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });
const underline = "M 0 0 L 400 0";
const { strokeDasharray, strokeDashoffset } = evolvePath(progress, underline);

<svg width={400} height={6} style={{ position: 'absolute', bottom: -10, left: 0 }}>
  <path d={underline} fill="none" stroke="#FFE600" strokeWidth={6} strokeLinecap="round"
        strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} />
</svg>
```

## Animated checkmark

```tsx
import { evolvePath } from '@remotion/paths';

const checkProgress = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });
const check = "M 5 12 L 11 18 L 22 5";
const { strokeDasharray, strokeDashoffset } = evolvePath(checkProgress, check);

<svg width={28} height={24}>
  <path d={check} fill="none" stroke="#00C2A8" strokeWidth={4}
        strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} />
</svg>
```

## Bar chart (animated horizontal)

```tsx
{bars.map((bar, i) => {
  const barFrame = frame - i * 6;   // stagger
  const width = interpolate(barFrame, [0, 24], [0, bar.value / max * 800], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const value = Math.round(interpolate(barFrame, [0, 24], [0, bar.value], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp'
  }));
  return (
    <div key={bar.label} style={{ display: 'flex', alignItems: 'center', height: 60, marginBottom: 12 }}>
      <div style={{ width: 200, fontSize: 28 }}>{bar.label}</div>
      <div style={{ width, height: 40, background: bar.color, borderRadius: 6 }} />
      <div style={{ marginLeft: 12, fontSize: 28, fontWeight: 700 }}>{value}</div>
    </div>
  );
})}
```

## Audio fade in/out

```tsx
import { Audio, staticFile, interpolate } from 'remotion';

<Audio
  src={staticFile('bgm.mp3')}
  volume={(f) => interpolate(
    f,
    [0, 30, durationInFrames - 30, durationInFrames],
    [0, 0.25, 0.25, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  )}
/>
```

## Sidechain ducking (VAD-driven)

```tsx
// vadSegments: [{from, to}] from Silero VAD output in frames
const isSpeaking = (f: number) =>
  vadSegments.some(s => f >= s.from && f <= s.to);

const duck = (f: number) => (isSpeaking(f) ? 0.15 : 0.6);

<Audio src={staticFile('bgm.mp3')} volume={duck} />
<Audio src={staticFile('vo.mp3')} volume={1.0} />
```

## Glitch effect (pattern interrupt)

```tsx
// Trigger glitch during frames N-M
const inGlitch = frame >= 60 && frame < 72;
const dx = inGlitch ? (Math.sin(frame * 1.5) * 8) : 0;
const dy = inGlitch ? (Math.cos(frame * 1.3) * 6) : 0;
const split = inGlitch ? Math.random() * 4 - 2 : 0;

<AbsoluteFill style={{
  transform: `translate(${dx}px, ${dy}px)`,
  textShadow: inGlitch ? `${split}px 0 #FF0066, -${split}px 0 #00C2FF` : 'none',
}}>
  {children}
</AbsoluteFill>
```

## Asset preload (avoid black flash)

```tsx
<Sequence from={60} durationInFrames={120}
         premountFor={30}
         styleWhilePremounted={{ opacity: 0 }}>
  <OffthreadVideo src={staticFile('hero.mp4')} />
</Sequence>
```

## Frame range helper

```tsx
// Time helpers — drop in src/utils/frames.ts
export const secondsToFrames = (s: number, fps: number) => Math.round(s * fps);
export const framesToSeconds = (f: number, fps: number) => f / fps;
export const msToFrames = (ms: number, fps: number) => Math.round((ms / 1000) * fps);
```
