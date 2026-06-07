/**
 * V3 — template base + brand system + skills seed (the scaffold payload itself).
 * Runs against the project root the suite lives in: a raw template copy keeps `gitignore`
 * (npm strips dot-gitignore from tarballs); a real `vibe init` scaffold has `.gitignore`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertEqual, assertIncludes } from './harness';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel: string): boolean => fs.existsSync(path.join(ROOT, rel));

// ── V3.1 — template base files ───────────────────────────────────────────────
test('V3.1 base files exist (gitignore/.env.example/vibe.config.json)', () => {
  assert(exists('gitignore') || exists('.gitignore'), 'missing gitignore (template form) / .gitignore (scaffold form)');
  assert(exists('.env.example'), 'missing .env.example');
  assert(exists('vibe.config.json'), 'missing vibe.config.json');
});

test('V3.1 gitignore guards secrets, output and machine artifacts', () => {
  const gi = exists('.gitignore') ? read('.gitignore') : read('gitignore');
  for (const must of ['node_modules', '.env', 'out/', 'ffmpeg-capabilities.json', '.venv']) {
    assertIncludes(gi, must, `gitignore must cover ${must}`);
  }
});

test('V3.1 .env.example carries the five provider keys, all EMPTY (D18)', () => {
  const env = read('.env.example');
  for (const key of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'ELEVENLABS_API_KEY', 'RUNWAY_API_SECRET', 'FAL_KEY']) {
    const m = new RegExp(`^${key}=(.*)$`, 'm').exec(env);
    assert(m !== null, `.env.example must contain ${key}=`);
    assertEqual(m![1]!.trim(), '', `${key} must ship EMPTY (no real key material)`);
  }
});

test('V3.1 vibe.config.json parses with sane defaults', () => {
  const cfg = JSON.parse(read('vibe.config.json')) as Record<string, unknown>;
  assert(['auto', 'claude', 'codex'].includes(String(cfg.agent)), `agent must be auto|claude|codex, got ${cfg.agent}`);
  assertEqual(cfg.uiPort, 7878, 'uiPort default must stay 7878 (O5)');
  assert(typeof cfg.maxRenderJobs === 'number', 'maxRenderJobs must be a number');
});

// ── V3.2 — brand system (D9/D10) ─────────────────────────────────────────────
test('V3.2 brand/ boilerplate exists and ships NEUTRAL', () => {
  const brand = JSON.parse(read('brand/brand.json')) as {
    colors?: Record<string, string>;
    tone?: Record<string, string>;
    voice?: { elevenlabsVoiceId?: string };
    brandWords?: unknown[];
  };
  assert(/^#[0-9A-Fa-f]{6}$/.test(brand.colors?.accent ?? ''), 'brand.json colors.accent must be a hex color');
  assert(['soft', 'neutral', 'direct'].includes(brand.tone?.sellStyle ?? ''), 'tone.sellStyle must be soft|neutral|direct');
  assertEqual(brand.voice?.elevenlabsVoiceId, '', 'voice.elevenlabsVoiceId must ship EMPTY (D10 — no personal voice)');
  assert(Array.isArray(brand.brandWords) && brand.brandWords.length === 0, 'brandWords must ship empty');
  const fonts = JSON.parse(read('brand/fonts.json')) as Record<string, unknown>;
  for (const k of ['heading', 'body', 'mono']) assert(typeof fonts[k] === 'string', `fonts.json must define ${k}`);
  assert(exists('brand/brand-voice.md'), 'missing brand/brand-voice.md');
  assertIncludes(read('brand/brand-voice.md'), 'sellStyle', 'brand-voice.md must explain the sellStyle dial');
});

test('V3.2 BrandContext loads brand/brand.json with a tolerant fallback', () => {
  const src = read('src/components/BrandContext.tsx');
  assert(/from '\.\.\/\.\.\/brand\/brand\.json'/.test(src), 'BrandContext must import brand/brand.json');
  assert(/from '\.\.\/\.\.\/brand\/fonts\.json'/.test(src), 'BrandContext must import brand/fonts.json');
  assert(/export const PROJECT_BRAND/.test(src), 'BrandContext must export PROJECT_BRAND');
  assert(/export function brandFromConfig/.test(src), 'BrandContext must export brandFromConfig (the mapper)');
});

test('V3.2 the 16-component surface + overlays exist with a barrel', () => {
  const components = [
    'BrandContext.tsx', 'captions.ts', 'KineticCaptions.tsx', 'HookText.tsx', 'Counter.tsx',
    'TikTokCaptions.tsx', 'QuoteCard.tsx', 'TweetCard.tsx', 'BarChart.tsx', 'Checklist.tsx',
    'NotificationToast.tsx', 'HighlightCard.tsx', 'SplitCompare.tsx', 'index.ts',
  ];
  for (const f of components) assert(exists(`src/components/${f}`), `missing src/components/${f}`);
  for (const f of ['ConfettiBurst.tsx', 'PulseRing.tsx']) {
    assert(exists(`src/components/motion/${f}`), `missing src/components/motion/${f} (V3.2 overlay port)`);
  }
  const barrel = read('src/components/index.ts');
  for (const name of ['BrandContext', 'HookText', 'Counter', 'QuoteCard', 'BarChart', 'KineticCaptions']) {
    assert(new RegExp(`\\b${name}\\b`).test(barrel), `components barrel must export ${name}`);
  }
  const motion = read('src/components/motion/index.ts');
  for (const name of ['ConfettiBurst', 'PulseRing']) {
    assert(new RegExp(`\\b${name}\\b`).test(motion), `motion barrel must export ${name}`);
  }
});

test('V3.2 components carry no personal/brand leftovers (strip guard)', () => {
  const dir = path.join(ROOT, 'src', 'components');
  const offenders: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      const body = fs.readFileSync(p, 'utf8');
      if (/Janteloven|NS9d28sQKOHAR6m4HDgj|3lpebTlxkqrEOtTV8BZM|FØLGERE|da-DK/.test(body)) offenders.push(e.name);
    }
  };
  walk(dir);
  assertEqual(offenders.length, 0, `personal-context leftovers in: ${offenders.join(', ')}`);
});

// ── V3.3 — skills seed (D12–D15) ─────────────────────────────────────────────
test('V3.3 the four skills + persona + settings are seeded', () => {
  for (const skill of ['video-editor', 'master-gpt-prompter', 'remotion-official-skill', 'template-distiller']) {
    assert(exists(`.claude/skills/${skill}/SKILL.md`), `missing .claude/skills/${skill}/SKILL.md`);
  }
  assert(exists('.claude/agents/vibe-studio.md'), 'missing .claude/agents/vibe-studio.md');
  const settings = JSON.parse(read('.claude/settings.local.json')) as { permissions?: { allow?: string[] } };
  assert(
    (settings.permissions?.allow ?? []).includes('Skill(remotion-best-practices)'),
    'settings.local.json must allow the remotion-best-practices skill',
  );
});

test('V3.3 video-editor skill routes to capability CLIs, not skill scripts', () => {
  const md = read('.claude/skills/video-editor/SKILL.md');
  assertIncludes(md, 'capabilities/ingest/transcribe.ts', 'transcription must route to the capability CLI');
  assertIncludes(md, 'capabilities/deliver/render-preset.ts', 'rendering must route to the capability CLI');
  assertIncludes(md, 'capabilities/perception/cut-doctor.ts', 'cut surgery must route to the capability CLI');
  assertIncludes(md, 'whisper-1', 'the STT rule must be whisper-1');
  assert(!md.includes('large-v3-turbo'), 'the whisper doc-drift (large-v3-turbo) must be normalized to whisper-1');
  assert(!/CLAUDE_SKILL_DIR/.test(md), 'no skill-local script paths may remain');
  assert(!/Janteloven/.test(md), 'Janteloven is replaced by brand.json tone rules');
  assertIncludes(md, 'brand/brand.json', 'tone/voice must come from brand.json');
  // Pipelines + key references ship.
  for (const ref of ['pipeline-paid-ad.md', 'pipeline-tutorial.md', 'pipeline-edit-real-footage.md', 'pipeline-explainer.md', 'named-style-anchors.md', 'known-bugs-and-fixes.md', 'video-review-gemini.md']) {
    assert(exists(`.claude/skills/video-editor/references/${ref}`), `missing video-editor reference ${ref}`);
  }
  for (const brief of ['short-paid-ad.md', 'tutorial.md', 'real-footage-edit.md', 'animated-explainer.md', 'talking-head-kinetic.md', 'product-demo.md', 'quote-card.md', 'data-viz.md']) {
    assert(exists(`.claude/skills/video-editor/templates/briefs/${brief}`), `missing video-editor brief ${brief}`);
  }
  assert(!exists('.claude/skills/video-editor/references/danish-brand-voice.md'), 'danish-brand-voice.md must NOT ship (replaced by brand/brand-voice.md)');
});

test('V3.3 vibe-studio persona keeps the cockpit contract, drops the personal rules', () => {
  const md = read('.claude/agents/vibe-studio.md');
  assertIncludes(md, 'COCKPIT CONTRACT', 'the cockpit contract section must port verbatim');
  assertIncludes(md, 'brief.md', 'contract truth 1 (brief.md)');
  assertIncludes(md, 'manifest.notes', 'contract truth 2 (manifest.notes)');
  assertIncludes(md, 'startStage', 'contract truth 3 (recorded stages)');
  assertIncludes(md, 'Estimated cost', 'the D19 plan=cost-approval rule must be in the persona');
  assert(!/Janteloven/.test(md), 'Janteloven must be replaced by brand.json tone guidance');
  assert(/name: vibe-studio/.test(md), 'persona frontmatter must be named vibe-studio');
});

test('V3.3 remotion-official-skill ships with the D6 no-Studio note', () => {
  const md = read('.claude/skills/remotion-official-skill/SKILL.md');
  assertIncludes(md, 'JBS Vibe Editing note', 'SKILL.md must carry the cockpit-Player note at the Studio mention');
  assert(exists('.claude/skills/remotion-official-skill/rules'), 'rules/ must ship');
  assert(
    fs.readdirSync(path.join(ROOT, '.claude/skills/remotion-official-skill/rules')).length >= 30,
    'the vendored rules library must ship complete',
  );
});

test('V3.3 template-distiller defines the vibe-style frontmatter contract (D14)', () => {
  const md = read('.claude/skills/template-distiller/SKILL.md');
  assertIncludes(md, 'vibe-style: true', 'distilled skills must be marked vibe-style: true (wizard scan contract)');
  assertIncludes(md, 'chat.jsonl', 'the distiller must read the conversation (corrections are the gold)');
  assertIncludes(md, 'provenance', 'the distiller must read provenance (the real pipeline)');
});

test('V3.3 skills tree carries no personal voice/identity leftovers (strip guard)', () => {
  const offenders: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(md|json|tsx?|mjs)$/.test(e.name)) continue;
      const body = fs.readFileSync(p, 'utf8');
      if (/Janteloven|NS9d28sQKOHAR6m4HDgj|3lpebTlxkqrEOtTV8BZM|aiagentskolen|perspektivering|dinegenboss|large-v3-turbo/i.test(body)) {
        offenders.push(path.relative(ROOT, p));
      }
    }
  };
  walk(path.join(ROOT, '.claude'));
  assertEqual(offenders.length, 0, `personal-context leftovers in: ${offenders.join(', ')}`);
});
