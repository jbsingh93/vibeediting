/**
 * temp-vibe-project.ts — the V4.1 server-integration isolation primitive.
 *
 * Shapes a temp dir like a freshly-scaffolded vibe project (vibe.config.json, projects/, public/,
 * deliver/, out/work/, brand/, .env, CAPABILITIES.md) so buildApp() can boot against it via
 * context.setProjectDir(). The factory also installs:
 *   - a tsx SHIM (node_modules/tsx) that re-exports the REPO's real tsx CLI, so spawn.ts's
 *     projectTsxCli() resolves without `npm install` inside the fixture;
 *   - a render-preset.ts STUB that emits the dry-run envelope jobs.ts resolveRenderArgs() consumes.
 *
 * Every path the route modules touch derives from context.ts, so we set VIBE_PROJECTS_DIR +
 * setProjectDir(tmp) at creation and restore the prior env in cleanup(). No real project is ever
 * touched (hard rule 2): the dir lives under os.tmpdir() and is rm'd on cleanup.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setProjectDir } from '../../src/server/context.js';
import { createManifest, startStage, approveStage } from '../../src/server/manifest.js';
import type { StageName } from '../../src/server/manifest.schema.js';
import { appendChat } from '../../src/agent/chat.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** This repo's real tsx CLI — the shim re-exports it so the fixture needs no npm install. */
const REPO_TSX_CLI = path.resolve(HERE, '..', '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');

/** The reusable fake-render seam (VIBE_RENDER_CMD points here). */
export const FAKE_RENDER = path.resolve(HERE, 'fake-render.mjs');
/** The scripted agent mock (VIBE_AGENT_BIN points here). */
export const MOCK_AGENT = path.resolve(HERE, 'mock-agent.mjs');

export interface SeedManifestOpts {
  mode?: 'agent' | 'wizard';
  inputs?: Record<string, unknown>;
  approvals_required?: StageName[];
  notes?: string;
  /** stages to start (pending → running) right after create. */
  running?: StageName[];
}

export interface TempVibeProject {
  /** The vibe project root (= context.projectDir()). */
  dir: string;
  /** The projects/ root inside it (= context.projectsRoot() / VIBE_PROJECTS_DIR). */
  projectsDir: string;
  /** Restore env + setProjectDir, then rm the temp tree. */
  cleanup: () => void;
  /** Create a manifest (+ stages) on disk via the real manifest service. */
  seedManifest: (id: string, opts?: SeedManifestOpts) => void;
  /** A project whose `motion` gate is blocked + in approvals_required (approve → complete). */
  seedBlockedProject: (id: string) => void;
  /** Append a raw line to projects/<id>/provenance.log (NDJSON). */
  seedProvenanceLine: (id: string, line: string) => void;
  /** Write out/work/<id>/orchestrate/budget.json. */
  seedBudget: (id: string, budget: unknown) => void;
  /** Append a user/event line to projects/<id>/chat.jsonl via the real chat service. */
  seedChatUser: (id: string, text: string) => void;
  /** Point vibe.config.json's agent at "claude" so VIBE_AGENT_BIN drives turns through the mock. */
  useClaudeAgent: () => void;
}

const BRAND = {
  _comment: 'test brand fixture — synthetic, no personal context',
  name: 'Acme Demo',
  colors: { primary: '#0a84ff', bg: '#000000' },
  tone: 'clean and direct',
  language: 'en',
};

const VIBE_CONFIG = {
  agent: 'auto',
  uiPort: 7878,
  language: 'en',
  maxRenderJobs: 1,
  minFreeGb: 5,
};

const ENV_TEXT = ['# vibe project secrets — local only, never committed', 'VIBE_TEST_PRESENCE=1', ''].join(
  '\n',
);

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
  'Probe and transcribe media.',
  '',
  '## 2. Deliver',
  '',
  'Render presets and loudnorm.',
  '',
].join('\n');

/** The render-preset dry-run stub: prints the one envelope jobs.ts resolveRenderArgs() consumes. */
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
// non-dry-run is not exercised by the fixture (real renders go through VIBE_RENDER_CMD).
process.stderr.write('render-preset stub: only --dry-run is supported\\n');
process.exit(1);
`;

function writeTsxShim(dir: string): void {
  const tsxDir = path.join(dir, 'node_modules', 'tsx');
  fs.mkdirSync(path.join(tsxDir, 'dist'), { recursive: true });
  fs.writeFileSync(
    path.join(tsxDir, 'package.json'),
    JSON.stringify({ name: 'tsx', version: '0.0.0-shim', bin: { tsx: 'dist/cli.mjs' } }, null, 2) + '\n',
    'utf8',
  );
  // Re-export the repo's real tsx CLI. pathToFileURL handles Windows drive letters → file:// URLs.
  const repoUrl = pathToFileURL(REPO_TSX_CLI).href;
  fs.writeFileSync(
    path.join(tsxDir, 'dist', 'cli.mjs'),
    `import(String.raw\`${repoUrl}\`);\n`,
    'utf8',
  );
}

export function makeTempVibeProject(): TempVibeProject {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-srv-'));
  const projectsDir = path.join(dir, 'projects');

  // scaffold-shaped tree
  for (const rel of ['projects', 'public', 'deliver', path.join('out', 'work'), 'brand', 'capabilities/deliver']) {
    fs.mkdirSync(path.join(dir, rel.split('/').join(path.sep)), { recursive: true });
  }
  fs.writeFileSync(path.join(dir, 'vibe.config.json'), JSON.stringify(VIBE_CONFIG, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'brand', 'brand.json'), JSON.stringify(BRAND, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(dir, '.env'), ENV_TEXT, 'utf8');
  fs.writeFileSync(path.join(dir, 'CAPABILITIES.md'), CAPABILITIES_MD, 'utf8');
  fs.writeFileSync(
    path.join(dir, 'capabilities', 'deliver', 'render-preset.ts'),
    RENDER_PRESET_STUB,
    'utf8',
  );

  writeTsxShim(dir);

  // wire context + env so every route module + adapter sees the fixture
  const prevProjectsDir = process.env.VIBE_PROJECTS_DIR;
  process.env.VIBE_PROJECTS_DIR = projectsDir;
  setProjectDir(dir);

  const seedManifest = (id: string, opts: SeedManifestOpts = {}): void => {
    const inputs: Record<string, unknown> = { mode: opts.mode ?? 'wizard', ...(opts.inputs ?? {}) };
    createManifest(id, {
      inputs,
      approvals_required: opts.approvals_required,
      notes: opts.notes,
    });
    for (const stage of opts.running ?? []) startStage(id, stage);
  };

  const seedBlockedProject = (id: string): void => {
    createManifest(id, {
      inputs: { mode: 'wizard' },
      approvals_required: ['motion'],
    });
    startStage(id, 'motion');
    // running → blocked: hand-write the blocked status through the service is not exposed, so use
    // startStage's sibling path — the manifest service models blocked via approveStage on a blocked
    // stage. We set blocked directly by editing the on-disk manifest, then read-modify-write is
    // unnecessary: seed via the public service by transitioning running→blocked manually.
    setStageStatus(projectsDir, id, 'motion', 'blocked');
  };

  const seedProvenanceLine = (id: string, line: string): void => {
    const p = path.join(projectsDir, id, 'provenance.log');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, line + '\n', 'utf8');
  };

  const seedBudget = (id: string, budget: unknown): void => {
    const p = path.join(dir, 'out', 'work', id, 'orchestrate', 'budget.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(budget, null, 2) + '\n', 'utf8');
  };

  const seedChatUser = (id: string, text: string): void => {
    appendChat(projectsDir, id, { t: 'user', text });
  };

  const useClaudeAgent = (): void => {
    fs.writeFileSync(
      path.join(dir, 'vibe.config.json'),
      JSON.stringify({ ...VIBE_CONFIG, agent: 'claude' }, null, 2) + '\n',
      'utf8',
    );
  };

  const cleanup = (): void => {
    if (prevProjectsDir === undefined) delete process.env.VIBE_PROJECTS_DIR;
    else process.env.VIBE_PROJECTS_DIR = prevProjectsDir;
    setProjectDir(process.cwd());
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort (Windows AV can briefly hold a handle) */
    }
  };

  return {
    dir,
    projectsDir,
    cleanup,
    seedManifest,
    seedBlockedProject,
    seedProvenanceLine,
    seedBudget,
    seedChatUser,
    useClaudeAgent,
  };
}

/** Force a stage's status on disk (used to seed `blocked` — not a normal service transition). */
function setStageStatus(
  projectsDir: string,
  project: string,
  stage: StageName,
  status: string,
): void {
  const p = path.join(projectsDir, project, 'manifest.json');
  const m = JSON.parse(fs.readFileSync(p, 'utf8')) as {
    stages: Record<string, { status: string; finished_at?: string }>;
  };
  m.stages[stage] = { ...m.stages[stage], status } as { status: string };
  if (status === 'blocked' || status === 'complete') m.stages[stage]!.finished_at = new Date().toISOString();
  fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n', 'utf8');
}

/** Re-export so tests can drive a version flow without re-importing the service module. */
export { startStage, approveStage };
