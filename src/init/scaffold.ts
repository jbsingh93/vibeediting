/**
 * The project scaffolder — copies the packaged `template/` payload into a new project
 * folder, substituting tokens and recording a per-file content hash so `vibe upgrade`
 * can tell pristine files (safe to re-sync) from user-modified ones (sacred).
 *
 * Design notes (doc 02 §4 / doc 07 §5 of the build contract):
 * - Seeded text files carry a `VIBE:GENERATED <version>` marker where the format allows;
 *   the AUTHORITATIVE upgrade signal is the sha256 map in `.vibe/state.json` (markers
 *   can't live in JSON/LUT files, and hashes survive marker-preserving edits).
 * - `gitignore` (no dot) ships in the template because npm permanently strips files
 *   named `.gitignore` from tarballs — it is renamed on copy.
 * - `.env` is created from `.env.example` at init and is NEVER hash-tracked (secrets).
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsError } from '../core/errors.js';
import { AGENT_SEED_FILES } from './agent-seeds.js';

/** Root-level file renames applied on copy (npm tarball constraints). */
export const RENAME_MAP: Record<string, string> = {
  gitignore: '.gitignore',
};

/** Directory/file names never copied out of the template (defense in depth). */
const SKIP_NAMES = new Set(['node_modules', '.vibe', 'out', '.venv', '__pycache__']);
const SKIP_FILES = new Set(['ffmpeg-capabilities.json']); // machine snapshot — regenerated per machine

/** Extensions treated as token-substitutable text. */
const TEXT_EXTS = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.py', '.txt',
  '.example', '.css', '.html', '.yml', '.yaml', '.srt', '',
]);
/** Text, but large and token-free — copied verbatim for speed. */
const RAW_TEXT_EXTS = new Set(['.cube']);

export interface ScaffoldTokens {
  projectName: string;
  brandName: string;
  vibeVersion: string;
}

export interface ScaffoldFile {
  /** Project-relative path, posix separators (the state.json key). */
  rel: string;
  /** Absolute source path in the template. */
  src: string;
  /** True when the file gets token substitution. */
  text: boolean;
}

export function substituteTokens(content: string, tokens: ScaffoldTokens): string {
  return content
    .replaceAll('{{PROJECT_NAME}}', tokens.projectName)
    .replaceAll('{{BRAND_NAME}}', tokens.brandName)
    .replaceAll('{{VIBE_VERSION}}', tokens.vibeVersion);
}

export function sha256(buf: Buffer | string): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Locate the packaged template/ directory by walking up from this module
 * (dist/bin/vibe.js when installed; src/init/ when run from source).
 */
export function findTemplateDir(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'template');
    if (fs.existsSync(path.join(candidate, 'package.json')) && fs.existsSync(path.join(candidate, 'capabilities'))) {
      return candidate;
    }
    dir = path.dirname(dir);
  }
  throw new FsError(
    'cannot locate the packaged template/ directory',
    'The vibeediting installation looks incomplete — try reinstalling: npm i -g vibeediting',
  );
}

/** Enumerate every file the scaffold will write (template walk + rename map). */
export function planScaffold(templateDir: string): ScaffoldFile[] {
  const out: ScaffoldFile[] = [];
  const walk = (dirAbs: string, relPrefix: string): void => {
    for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP_NAMES.has(entry.name)) continue;
      const srcAbs = path.join(dirAbs, entry.name);
      if (entry.isDirectory()) {
        walk(srcAbs, `${relPrefix}${entry.name}/`);
        continue;
      }
      if (SKIP_FILES.has(entry.name)) continue;
      const mapped = relPrefix === '' && RENAME_MAP[entry.name] ? RENAME_MAP[entry.name]! : entry.name;
      const rel = `${relPrefix}${mapped}`;
      const ext = path.extname(mapped).toLowerCase();
      const text = TEXT_EXTS.has(ext) && !RAW_TEXT_EXTS.has(ext);
      out.push({ rel, src: srcAbs, text });
    }
  };
  walk(templateDir, '');
  return out;
}

/** Render the final content of one planned file (token-substituted when text). */
export function renderScaffoldFile(file: ScaffoldFile, tokens: ScaffoldTokens): Buffer {
  const raw = fs.readFileSync(file.src);
  if (!file.text) return raw;
  return Buffer.from(substituteTokens(raw.toString('utf8'), tokens), 'utf8');
}

export interface ScaffoldResult {
  /** rel (posix) → sha256 of the bytes written. The upgrade baseline. */
  files: Record<string, string>;
  count: number;
}

/** Directories every project needs even when empty (kept via .gitkeep where tracked). */
const PROJECT_DIRS = ['projects', 'public', 'deliver', 'out', path.join('src', 'compositions')];
const GITKEEP_DIRS = new Set(['projects', 'public', 'deliver']);

/**
 * Copy the template into `targetDir`, substitute tokens, write the agent runtime seeds,
 * create `.env` from `.env.example`, and return the hash map for `.vibe/state.json`.
 */
export function scaffoldProject(templateDir: string, targetDir: string, tokens: ScaffoldTokens): ScaffoldResult {
  const files: Record<string, string> = {};
  const plan = planScaffold(templateDir);

  for (const file of plan) {
    const content = renderScaffoldFile(file, tokens);
    const dest = path.join(targetDir, ...file.rel.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
    files[file.rel] = sha256(content);
  }

  // Agent runtime seeds (embedded — see agent-seeds.ts for why they aren't template files).
  for (const seed of AGENT_SEED_FILES) {
    const content = Buffer.from(substituteTokens(seed.content, tokens), 'utf8');
    const dest = path.join(targetDir, ...seed.rel.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
    files[seed.rel] = sha256(content);
  }

  // .env from .env.example — secrets file, intentionally NOT hash-tracked.
  const envExample = path.join(targetDir, '.env.example');
  const envFile = path.join(targetDir, '.env');
  if (fs.existsSync(envExample) && !fs.existsSync(envFile)) {
    fs.copyFileSync(envExample, envFile);
  }

  // Standing directories.
  for (const d of PROJECT_DIRS) {
    const abs = path.join(targetDir, d);
    fs.mkdirSync(abs, { recursive: true });
    if (GITKEEP_DIRS.has(d)) {
      const keep = path.join(abs, '.gitkeep');
      if (!fs.existsSync(keep)) fs.writeFileSync(keep, '');
    }
  }

  return { files, count: Object.keys(files).length };
}

// ── .vibe/state.json ──────────────────────────────────────────────────────────

export interface VibeState {
  packageVersion: string;
  projectName: string;
  brandName: string;
  platform: NodeJS.Platform;
  createdAt: string;
  agent?: {
    claude?: { found: boolean; version?: string };
    codex?: { found: boolean; version?: string };
  };
  provision?: {
    ffmpeg?: { source: 'path' | 'downloaded' | 'skipped'; version?: string };
    venv?: 'created' | 'skipped' | 'failed';
    install?: 'done' | 'skipped' | 'failed';
  };
  /** rel → sha256 at seed time. THE upgrade baseline. */
  files: Record<string, string>;
}

export function statePath(projectDir: string): string {
  return path.join(projectDir, '.vibe', 'state.json');
}

export function writeState(projectDir: string, state: VibeState): void {
  const file = statePath(projectDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

export function readState(projectDir: string): VibeState | null {
  try {
    return JSON.parse(fs.readFileSync(statePath(projectDir), 'utf8')) as VibeState;
  } catch {
    return null;
  }
}
