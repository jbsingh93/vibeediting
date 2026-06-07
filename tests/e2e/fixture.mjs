#!/usr/bin/env node
/**
 * tests/e2e/fixture.mjs — (re)create the disposable E2E project trees the Playwright webServers
 * boot against. Runs as PLAIN node (the playwright.config command invokes it directly), so it
 * duplicates the small shim/stub-writing logic from tests/helpers/temp-vibe-project.ts (that helper
 * is TS + imports the server's context module — neither is wanted here).
 *
 * It creates THREE project trees under test-artifacts/ (deleted + recreated every run):
 *   - e2e-project/   the MAIN + OFFLINE fixture (gallery, agent, gate, deliver, finetune, …) —
 *                    seeded with deterministic manifests by global-setup.ts after the server boots.
 *   - e2e-empty/     a fresh, project-less tree for the onboarding/keys/brand specs (:7884) so they
 *                    can mutate .env / brand.json without polluting the main fixture.
 *
 * Each tree is shaped exactly like a freshly-scaffolded vibe project: vibe.config.json, projects/,
 * public/, deliver/, out/work/, brand/brand.json (template-shaped), .env (with a comment),
 * CAPABILITIES.md (numbered ## sections), the tsx SHIM (node_modules/tsx re-exporting the repo's
 * real CLI) and the render-preset.ts dry-run stub.
 *
 * Hard guard: the server can only serve the SPA when ui-dist/index.html exists. CI builds it first;
 * if it's missing we exit non-zero with a clear message rather than letting the suite "pass" against
 * an API-only server.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const ARTIFACTS = path.join(REPO, 'test-artifacts');

/** The repo's real tsx CLI — the shim re-exports it so the fixture needs no `npm install`. */
const REPO_TSX_CLI = path.join(REPO, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const BRAND = {
  _comment: 'test brand fixture — synthetic, no personal context',
  name: 'My Brand',
  colors: { primary: '#0a84ff', bg: '#000000' },
  tone: { register: 'professional', sellStyle: 'neutral', language: 'en' },
};

const VIBE_CONFIG = {
  agent: 'claude',
  uiPort: 7878,
  language: 'en',
  maxRenderJobs: 1,
  minFreeGb: 5,
};

const ENV_TEXT = ['# vibe project secrets — local only, never committed', ''].join('\n');

/** Numbered ## sections so p6-routes' parseWikiSections yields the `sec-N` id scheme. */
const CAPABILITIES_MD = [
  '# Capabilities',
  '',
  'A short preamble paragraph that becomes the `intro` section.',
  '',
  '## 0. Intro',
  '',
  'The zeroth capability section.',
  '',
  '## 1. Ingest',
  '',
  'Probe and transcribe media — `ingest/transcribe` writes captions.json.',
  '',
  '## 2. Deliver',
  '',
  'Render presets and loudnorm.',
  '',
].join('\n');

/** render-preset.ts dry-run stub: prints the one envelope jobs.ts resolveRenderArgs() consumes. */
const RENDER_PRESET_STUB = `#!/usr/bin/env node
// Minimal render-preset.ts stub (fixture-only): mimics the engine's --dry-run envelope contract.
const argv = process.argv.slice(2);
function flag(name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
const preset = flag('--preset') ?? 'scene-clip';
const comp = flag('--comp') ?? 'DemoWelcome';
const out = flag('--out') ?? '_scratch/out';
if (argv.includes('--dry-run')) {
  const now = new Date().toISOString();
  process.stdout.write(
    JSON.stringify({
      success: true,
      capability: 'deliver/render-preset',
      outputs: [],
      metrics: {
        preset,
        dryRun: true,
        argv: ['remotion', 'render', comp, 'out/' + out + '.mp4', '--codec=h264'],
      },
      startedAt: now,
      finishedAt: now,
      durationMs: 1,
    }) + '\\n',
  );
  process.exit(0);
}
process.stderr.write('render-preset stub: only --dry-run is supported\\n');
process.exit(1);
`;

function writeTsxShim(dir) {
  const tsxDir = path.join(dir, 'node_modules', 'tsx');
  fs.mkdirSync(path.join(tsxDir, 'dist'), { recursive: true });
  fs.writeFileSync(
    path.join(tsxDir, 'package.json'),
    JSON.stringify({ name: 'tsx', version: '0.0.0-shim', bin: { tsx: 'dist/cli.mjs' } }, null, 2) + '\n',
    'utf8',
  );
  const repoUrl = pathToFileURL(REPO_TSX_CLI).href;
  fs.writeFileSync(path.join(tsxDir, 'dist', 'cli.mjs'), `import(String.raw\`${repoUrl}\`);\n`, 'utf8');
}

/** Shape one disposable project tree. `brandName` lets the empty tree keep the placeholder name. */
function makeProject(dir, { brandName } = {}) {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const rel of ['projects', 'public', 'deliver', 'out/work', 'brand', 'capabilities/deliver']) {
    fs.mkdirSync(path.join(dir, rel.split('/').join(path.sep)), { recursive: true });
  }
  fs.writeFileSync(path.join(dir, 'vibe.config.json'), JSON.stringify(VIBE_CONFIG, null, 2) + '\n', 'utf8');
  fs.writeFileSync(
    path.join(dir, 'brand', 'brand.json'),
    JSON.stringify({ ...BRAND, name: brandName ?? BRAND.name }, null, 2) + '\n',
    'utf8',
  );
  fs.writeFileSync(path.join(dir, '.env'), ENV_TEXT, 'utf8');
  fs.writeFileSync(path.join(dir, 'CAPABILITIES.md'), CAPABILITIES_MD, 'utf8');
  fs.writeFileSync(path.join(dir, 'capabilities', 'deliver', 'render-preset.ts'), RENDER_PRESET_STUB, 'utf8');
  // isVibeProject() (src/commands/doctor.ts) accepts vibe.config.json OR .vibe/state.json.
  fs.mkdirSync(path.join(dir, '.vibe'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.vibe', 'state.json'),
    JSON.stringify({ initialized: true, version: '0.0.0-e2e' }, null, 2) + '\n',
    'utf8',
  );
  writeTsxShim(dir);
}

function main() {
  const uiDist = path.join(REPO, 'ui-dist', 'index.html');
  if (!fs.existsSync(uiDist)) {
    process.stderr.write(
      `\n[fixture] ui-dist/index.html is missing — the server cannot serve the SPA.\n` +
        `          Build the client first:  npm run ui:build\n\n`,
    );
    process.exit(1);
  }

  fs.mkdirSync(ARTIFACTS, { recursive: true });
  // truncate the per-run mock logs so each suite run starts clean (the mock APPENDS)
  for (const f of ['e2e-argv.log']) {
    try {
      fs.writeFileSync(path.join(ARTIFACTS, f), '', 'utf8');
    } catch {
      /* best-effort */
    }
  }
  // remove any stale scenario file (a crashed spec could leave one → the mock would replay it)
  try {
    fs.rmSync(path.join(ARTIFACTS, 'e2e-mock-scenario.json'), { force: true });
  } catch {
    /* best-effort */
  }

  makeProject(path.join(ARTIFACTS, 'e2e-project'));
  makeProject(path.join(ARTIFACTS, 'e2e-empty'), { brandName: 'My Brand' });

  process.stdout.write('[fixture] e2e project trees recreated under test-artifacts/\n');
}

main();
