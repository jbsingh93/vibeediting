import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertEqual } from './harness';

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');
const MOTION = path.join(SRC, 'components', 'motion');

// The parent's per-composition checks returned at V3 against the template's DemoWelcome comp
// (src/Root.tsx + src/demo-welcome/ land with the scaffolder — see the P3.0 block below).

// ── P3.0 — demo composition + Root wiring (the V2-deferred comp checks, vs DemoWelcome) ──
test('P3.0 src/index.ts registers the Root', () => {
  const idx = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8');
  assert(/registerRoot\(\s*Root\s*\)/.test(idx), 'src/index.ts must call registerRoot(Root)');
});

test('P3.0 Root.tsx registers the DemoWelcome composition', () => {
  const root = fs.readFileSync(path.join(SRC, 'Root.tsx'), 'utf8');
  assert(/id="DemoWelcome"/.test(root), 'Root.tsx must register id="DemoWelcome" (the render-gate target)');
  assert(/from '\.\/demo-welcome\/Main'/.test(root), 'Root.tsx must import the demo comp from ./demo-welcome/Main');
  assert(/<Composition/.test(root), 'Root.tsx must use <Composition>');
});

test('P3.0 DemoWelcome is media-free, brand-driven, frame-driven', () => {
  const demo = fs.readFileSync(path.join(SRC, 'demo-welcome', 'Main.tsx'), 'utf8');
  for (const banned of ['staticFile', 'OffthreadVideo', '<Video', '<Audio', '<Img']) {
    assert(!demo.includes(banned), `DemoWelcome must be media-free — found ${banned}`);
  }
  assert(/BrandContext/.test(demo), 'DemoWelcome must wrap its scene in <BrandContext>');
  assert(/useCurrentFrame|interpolate/.test(demo), 'DemoWelcome must be frame-driven');
  // The CSS-animation ban (hard rule) — no transition/animation styles.
  assert(!/animation\s*:/.test(demo) && !/transition\s*:/.test(demo), 'DemoWelcome must not use CSS animations/transitions');
});

test('P3.0 composition skeletons ship in the video-editor skill (data-driven starters)', () => {
  const comps = path.join(ROOT, '.claude', 'skills', 'video-editor', 'templates', 'compositions');
  for (const f of ['ShortAd9x16.tsx', 'Tutorial16x9.tsx', 'Square1x1.tsx']) {
    assert(fs.existsSync(path.join(comps, f)), `missing skill composition skeleton ${f}`);
    const src = fs.readFileSync(path.join(comps, f), 'utf8');
    assert(/from '\.\.\/\.\.\/components'/.test(src), `${f} must import from src/components via ../../components (post-copy path)`);
  }
  const shortAd = fs.readFileSync(path.join(comps, 'ShortAd9x16.tsx'), 'utf8');
  assert(/z\.object|zod/.test(shortAd), 'ShortAd9x16 must keep its Zod props schema (data-driven contract)');
});

// ── P3.3 — atomic motion library + GSAP engine ───────────────────────────────
test('P3.3 atomic motion library exists in src/components/motion/', () => {
  const expected = [
    'index.ts',
    'PopText.tsx',
    'FadeInOut.tsx',
    'Wiggle.tsx',
    'CountUp.tsx',
    'LowerThird.tsx',
    'CTAButton.tsx',
    'LogoSting.tsx',
    'SafeZone.tsx',
    'GsapSplitText.tsx',
    'useGsapTimeline.ts',
    'TransitionScenes.tsx',
  ];
  for (const f of expected) {
    assert(fs.existsSync(path.join(MOTION, f)), `missing src/components/motion/${f}`);
  }
});

test('P3.3 useGsapTimeline enforces frame-seeked timelines (HARD RULE)', () => {
  const raw = fs.readFileSync(path.join(MOTION, 'useGsapTimeline.ts'), 'utf8');
  // Strip comments before checking — the rule prose legitimately mentions the forbidden calls.
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1'); // line comments
  assert(/paused\s*:\s*true/.test(code), 'timeline must be built `paused: true` (hard rule)');
  assert(/\.seek\(/.test(code), 'must call .seek(frame / fps) every render');
  assert(
    !/\.play\(\)/.test(code) && !/\.reverse\(\)/.test(code) && !/\.pause\(\)/.test(code),
    'must never call .play()/.pause()/.reverse() in the build (only .seek)',
  );
});

test('P3.3 gsap + @gsap/react are dependencies of the project', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert(pkg.dependencies?.gsap, 'gsap must be a dependency for the GSAP engine');
  assert(pkg.dependencies?.['@gsap/react'], '@gsap/react must be a dependency for the GSAP engine');
});

test('P3.3 motion index re-exports every atom', () => {
  const idx = fs.readFileSync(path.join(MOTION, 'index.ts'), 'utf8');
  for (const name of [
    'PopText',
    'FadeInOut',
    'Wiggle',
    'CountUp',
    'LowerThird',
    'CTAButton',
    'LogoSting',
    'SafeZone',
    'GsapSplitText',
    'useGsapTimeline',
    'TransitionScenes',
  ]) {
    assert(new RegExp(`\\b${name}\\b`).test(idx), `motion/index.ts must export ${name}`);
  }
});

// ── P3.4 — TransitionSeries + springTiming ───────────────────────────────────
test('P3.4 TransitionScenes uses TransitionSeries + springTiming defaults', () => {
  const src = fs.readFileSync(path.join(MOTION, 'TransitionScenes.tsx'), 'utf8');
  assert(/TransitionSeries/.test(src), 'must wrap @remotion/transitions TransitionSeries');
  assert(/springTiming/.test(src), 'must default to springTiming per the P3.4 consensus rule');
});

// ── P3.6 — alpha overlays (ProRes 4444 / yuva444p10le) ───────────────────────
test('P3.6 deliver/render-preset transparent-overlay uses per-render PNG + yuva444p10le', async () => {
  const mod = await import('../../capabilities/deliver/render-preset');
  const { ext, args } = mod.presetArgs('transparent-overlay', 'DemoWelcome', 'alpha');
  assertEqual(ext, 'mov', 'transparent overlay must be .mov (ProRes 4444 container)');
  // Per-render image-format override (NOT relying on global jpeg config).
  assert(args.includes('--image-format=png'), 'must pass --image-format=png per-render');
  assert(args.includes('--codec=prores'), 'must use ProRes codec');
  assert(args.includes('--proresProfile=4444'), 'must use ProRes 4444 profile');
  assert(args.includes('--pixel-format=yuva444p10le'), 'must request yuva444p10le pixel format');
});

test('P3.6 remotion.config.ts still defaults JPEG, alpha overrides are per-render', () => {
  const cfg = fs.readFileSync(path.join(ROOT, 'remotion.config.ts'), 'utf8');
  assert(/setVideoImageFormat\("jpeg"\)/.test(cfg), 'global default stays jpeg (alpha is a per-render override)');
});

// ── P3.3b — safeRegion + SceneClip + green-key palette guard ─────────────────
test('P3.3b motion index re-exports SceneClip + greenKeyGuard surface', () => {
  const idx = fs.readFileSync(path.join(MOTION, 'index.ts'), 'utf8');
  for (const name of ['SceneClip', 'defaultSafeRegion', 'isGreenKeyZone', 'assertGreenKeyFriendly']) {
    assert(new RegExp(`\\b${name}\\b`).test(idx), `motion/index.ts must export ${name}`);
  }
});

test('P3.3b SafeZone exports a SafeRegion type + default-region helper', () => {
  const src = fs.readFileSync(path.join(MOTION, 'SafeZone.tsx'), 'utf8');
  assert(/export type SafeRegion/.test(src), 'must export SafeRegion type');
  assert(/export function defaultSafeRegion/.test(src), 'must export defaultSafeRegion(width, height)');
  assert(/safeRegion\??:/.test(src) && /children\??:/.test(src), 'props must include safeRegion + children (constraint mode)');
});

test('P3.3b green-key guard rejects #00FF00 ± 25% and accepts normal brand palettes', async () => {
  const g = await import('../../src/components/motion/greenKeyGuard');
  // Center of the chroma zone is pure green — must be flagged.
  assert(g.isGreenKeyZone('#00FF00'), '#00FF00 must be flagged as green-key zone');
  assert(g.isGreenKeyZone('#10F010'), 'near-green #10F010 must be flagged');
  // Typical brand tokens MUST be safe.
  assert(!g.isGreenKeyZone('#101014'), 'near-black #101014 must NOT be in the green zone');
  assert(!g.isGreenKeyZone('#FFFFFF'), 'white must NOT be in the green zone');
  assert(!g.isGreenKeyZone('#4E9CFF'), 'accent blue must NOT be in the green zone');
  // The assert-throws variant.
  let threw = false;
  try {
    g.assertGreenKeyFriendly(['#FFFFFF', '#00FF00', '#101014']);
  } catch (err) {
    threw = true;
    assert(/00FF00/.test(String(err)), 'error must cite the offending color');
  }
  assert(threw, 'assertGreenKeyFriendly must throw on a green-zone palette entry');
  // Empty / clean palette is accepted silently.
  g.assertGreenKeyFriendly(['#101014', '#FFFFFF', '#4E9CFF']);
});

test('P3.3b default safeRegion is right-rail (16:9) and bottom-480-excluded (9:16)', async () => {
  const sz = await import('../../src/components/motion/SafeZone');
  const r16 = sz.defaultSafeRegion(1920, 1080);
  assert(r16.x >= 0.5 && r16.w <= 0.5, '16:9 default must put the rect in the RIGHT half');
  const r9 = sz.defaultSafeRegion(1080, 1920);
  // bottom 480 px excluded ⇒ the rect's bottom edge < 1 - 480/1920 + small slack
  const bottomEdge = r9.y + r9.h;
  assert(bottomEdge < 1 - 480 / 1920 + 0.001, '9:16 default must exclude bottom 480 px (platform UI)');
});

// ── P3.5b — scene-clip render presets ────────────────────────────────────────
test('P3.5b scene-clip family adds three new presets with the right codec + extension', async () => {
  const mod = await import('../../capabilities/deliver/render-preset');

  const clip = mod.presetArgs('scene-clip', 'SceneOne', 'project-x/scenes/01-attention-trap');
  assertEqual(clip.ext, 'mp4', 'scene-clip must emit .mp4');
  assert(clip.args.includes('--codec=h264'), 'scene-clip must use h264');
  assert(clip.args.some((a) => a.startsWith('--crf=')), 'scene-clip must set CRF');

  const alpha = mod.presetArgs('scene-clip-alpha', 'SceneOne', 'project-x/scenes/01-attention-trap');
  assertEqual(alpha.ext, 'mov', 'scene-clip-alpha must emit .mov (ProRes 4444)');
  assert(alpha.args.includes('--codec=prores'), 'scene-clip-alpha must use ProRes');
  assert(alpha.args.includes('--proresProfile=4444'), 'scene-clip-alpha must use 4444 profile');
  assert(alpha.args.includes('--pixel-format=yuva444p10le'), 'scene-clip-alpha must carry alpha');
  assert(alpha.args.includes('--image-format=png'), 'scene-clip-alpha must override the global jpeg config');

  const greenkey = mod.presetArgs('scene-clip-greenkey', 'SceneOne', 'project-x/scenes/01-attention-trap');
  assertEqual(greenkey.ext, 'mp4', 'scene-clip-greenkey must emit .mp4');
  assert(greenkey.args.includes('--codec=h264'), 'scene-clip-greenkey must use h264');
});

test('P3.5b scene-clip outName accepts nested project/scenes/<NN>-slug path', async () => {
  const mod = await import('../../capabilities/deliver/render-preset');
  const r = mod.presetArgs('scene-clip', 'X', 'myproject/scenes/03-reset-attention-v2');
  // The second positional argv (output path) must include the full nested directory.
  assert(
    r.args.some((a) => a.endsWith('myproject/scenes/03-reset-attention-v2.mp4')),
    'must preserve nested out path for the scene-clip output convention',
  );
});
