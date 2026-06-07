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

/**
 * Copy the REAL acquire capability tree from template/ into the fixture so the Acquire MODAL e2e
 * (acquire.spec.ts) drives the genuine fetch-url / download-asset CLIs against a local 127.0.0.1
 * fixture HTTP server — real sockets, zero internet (doc 13 §5). These files are dependency-free
 * (they import only `../_env/contract` + sibling provenance) and resolve REPO_ROOT from __dirname,
 * which lands at the fixture project dir. We copy verbatim rather than stub so the e2e exercises the
 * shipping contract (envelope + provenance.json shape the asset tiles read).
 */
const TEMPLATE = path.join(REPO, 'template');
const ACQUIRE_CAP_FILES = [
  ['capabilities', '_env', 'contract.ts'],
  ['capabilities', 'acquire', 'provenance.ts'],
  ['capabilities', 'acquire', 'fetch-url.ts'],
  ['capabilities', 'acquire', 'download-asset.ts'],
];
function copyAcquireCapabilities(dir) {
  for (const segs of ACQUIRE_CAP_FILES) {
    const src = path.join(TEMPLATE, ...segs);
    const dst = path.join(dir, ...segs);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

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

/** Shape one disposable project tree. `brandName` lets the empty tree keep the placeholder name;
 *  `agent` overrides the agent preference (the codex leg uses 'codex'); `acquire` copies the real
 *  acquire capability CLIs in (the MAIN tree needs them for acquire.spec.ts). */
function makeProject(dir, { brandName, agent, acquire } = {}) {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const rel of ['projects', 'public', 'deliver', 'out/work', 'brand', 'capabilities/deliver']) {
    fs.mkdirSync(path.join(dir, rel.split('/').join(path.sep)), { recursive: true });
  }
  fs.writeFileSync(
    path.join(dir, 'vibe.config.json'),
    JSON.stringify({ ...VIBE_CONFIG, ...(agent ? { agent } : {}) }, null, 2) + '\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'brand', 'brand.json'),
    JSON.stringify({ ...BRAND, name: brandName ?? BRAND.name }, null, 2) + '\n',
    'utf8',
  );
  fs.writeFileSync(path.join(dir, '.env'), ENV_TEXT, 'utf8');
  fs.writeFileSync(path.join(dir, 'CAPABILITIES.md'), CAPABILITIES_MD, 'utf8');
  fs.writeFileSync(path.join(dir, 'capabilities', 'deliver', 'render-preset.ts'), RENDER_PRESET_STUB, 'utf8');
  if (acquire) {
    copyAcquireCapabilities(dir);
    // The copied capabilities use CommonJS `__dirname` (the template ships a CJS package.json — no
    // "type":"module"). The fixture otherwise has no package.json, so tsx would treat .ts as ESM and
    // `__dirname` would be undefined. A minimal CJS package.json restores the shipping module mode.
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'e2e-fixture-project', version: '0.0.0', private: true }, null, 2) + '\n',
      'utf8',
    );
  }
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

  makeProject(path.join(ARTIFACTS, 'e2e-project'), { acquire: true });
  makeProject(path.join(ARTIFACTS, 'e2e-empty'), { brandName: 'My Brand' });
  // CODEX leg — its own tree so vibe.config.json can prefer codex without touching the MAIN tree's
  // claude semantics (selectRunner reads the project's config; the bridge has no env override).
  makeProject(path.join(ARTIFACTS, 'e2e-codex'), { agent: 'codex' });

  process.stdout.write('[fixture] e2e project trees recreated under test-artifacts/\n');
}

main();
