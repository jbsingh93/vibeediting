/**
 * temp-project.ts — the ONE isolation primitive for agent/doctor tests.
 *
 * mkdtemp a fake vibe-project dir + point VIBE_PROJECTS_DIR at its projects/ subdir, so
 * tests NEVER touch a real project. The adapters read VIBE_PROJECTS_DIR at call time, so
 * setting it before the turn is enough. Manifests are seeded as plain JSON (the manifest
 * SCHEMA module lives in the scaffolded project from V2 — the package reads data files).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface TempProject {
  /** The fake vibe project root (cwd for agent spawns). */
  dir: string;
  /** The projects/ root inside it (= VIBE_PROJECTS_DIR while active). */
  projectsDir: string;
  cleanup: () => void;
}

export function makeTempProject(): TempProject {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-test-'));
  const projectsDir = path.join(dir, 'projects');
  fs.mkdirSync(projectsDir, { recursive: true });
  const prev = process.env.VIBE_PROJECTS_DIR;
  process.env.VIBE_PROJECTS_DIR = projectsDir;
  return {
    dir,
    projectsDir,
    cleanup: () => {
      if (prev === undefined) delete process.env.VIBE_PROJECTS_DIR;
      else process.env.VIBE_PROJECTS_DIR = prev;
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    },
  };
}

export interface SeedManifestOptions {
  mode?: 'agent' | 'wizard';
  notes?: string;
  stages?: Record<string, { status: string }>;
}

/** Seed a minimal manifest.json for a video project (plain JSON, adapter-readable). */
export function seedManifest(projectsDir: string, project: string, opts: SeedManifestOptions = {}): void {
  const dir = path.join(projectsDir, project);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = {
    project,
    inputs: { mode: opts.mode ?? 'wizard' },
    notes: opts.notes ?? '',
    stages: opts.stages ?? {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

export function readManifestRaw(projectsDir: string, project: string): {
  notes?: string;
  stages: Record<string, { status?: string }>;
} {
  return JSON.parse(fs.readFileSync(path.join(projectsDir, project, 'manifest.json'), 'utf8'));
}
