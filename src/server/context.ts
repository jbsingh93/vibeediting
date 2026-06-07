/**
 * src/server/context.ts — the ONE place that knows which user project this server instance
 * serves, and where the package's own payloads (ui-dist/) live.
 *
 * The parent UI server lived INSIDE the repo it served (REPO_ROOT = two levels up). The vibe
 * server ships in the npm package but operates ON a scaffolded user project: every path the
 * route modules touch derives from the project dir set here at boot (`vibe ui --project <dir>`,
 * default cwd). Tests call setProjectDir() against a temp fixture before buildApp().
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

let currentProjectDir = process.cwd();

/** Point the server at a vibe project folder (called once at boot / per test). */
export function setProjectDir(dir: string): void {
  currentProjectDir = path.resolve(dir);
}

/** The vibe project this server instance serves. */
export function projectDir(): string {
  return currentProjectDir;
}

/** The durable, git-tracked projects root (VIBE_PROJECTS_DIR is the test seam). */
export function projectsRoot(): string {
  return process.env.VIBE_PROJECTS_DIR
    ? path.resolve(process.env.VIBE_PROJECTS_DIR)
    : path.join(currentProjectDir, 'projects');
}

/** Per-project asset tree (the comps' staticFile root). */
export function publicDir(): string {
  return path.join(currentProjectDir, 'public');
}

/** Disposable work/renders tree. */
export function outDir(): string {
  return path.join(currentProjectDir, 'out');
}

/** Disposable per-stage intermediates (storyboards, budget ledgers). */
export function workDir(): string {
  return path.join(currentProjectDir, 'out', 'work');
}

/** Final deliverables (the parent's test-video/ role — doc 04 mount table). */
export function deliverDir(): string {
  return path.join(currentProjectDir, 'deliver');
}

export interface VibeConfig {
  agent?: 'auto' | 'claude' | 'codex';
  uiPort?: number;
  language?: string;
  maxRenderJobs?: number;
  minFreeGb?: number;
}

/** vibe.config.json, read defensively (missing/malformed → {}). */
export function readVibeConfig(dir: string = currentProjectDir): VibeConfig {
  try {
    const raw = fs.readFileSync(path.join(dir, 'vibe.config.json'), 'utf8');
    const cfg = JSON.parse(raw) as VibeConfig;
    return cfg && typeof cfg === 'object' ? cfg : {};
  } catch {
    return {};
  }
}

/**
 * Locate the prebuilt UI client (ui-dist/). Walks up from the bundled module (dist/bin/) to
 * the package root — same walk-up discipline as the template resolver. Returns null when the
 * client isn't built (dev tree before `npm run ui:build`); the server still serves the API.
 */
export function findUiDist(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'ui-dist');
    if (fs.existsSync(path.join(candidate, 'index.html'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
