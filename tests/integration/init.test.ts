/**
 * V3.4 — the full `vibe init` flow against the REAL template payload, headless
 * (--yes, no install/ffmpeg/venv — those have their own coverage + the V3.6 suite).
 * Mock agents stand in for claude/codex via the VIBE_AGENT_BIN/VIBE_CODEX_BIN seams.
 */
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initProject } from '../../src/commands/init.js';
import { readState } from '../../src/init/scaffold.js';
import { UserError } from '../../src/core/errors.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOCK_AGENT = path.join(HERE, '..', 'helpers', 'mock-agent.mjs');

let cwd: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'vibe-init-'));
  for (const k of ['VIBE_AGENT_BIN', 'VIBE_CODEX_BIN']) savedEnv[k] = process.env[k];
  process.env.VIBE_AGENT_BIN = MOCK_AGENT;
  process.env.VIBE_CODEX_BIN = MOCK_AGENT;
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const HEADLESS = { install: false, ffmpeg: false, venv: false, ui: false, yes: true } as const;

describe('initProject (real template, headless)', () => {
  it('scaffolds a complete project: rename, tokens, seeds, .env, state.json', async () => {
    const target = await initProject({ name: 'my-videos', brand: 'Acme Studio', cwd, ...HEADLESS });
    expect(target).toBe(path.join(cwd, 'my-videos'));

    // Base files: rename landed, tokens substituted.
    expect(existsSync(path.join(target, '.gitignore'))).toBe(true);
    expect(existsSync(path.join(target, 'gitignore'))).toBe(false);
    const pkg = JSON.parse(readFileSync(path.join(target, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('my-videos');
    expect(readFileSync(path.join(target, 'CLAUDE.md'), 'utf8')).not.toContain('{{PROJECT_NAME}}');

    // The full payload: engine, components, skills, brand, demo comp.
    for (const rel of [
      'capabilities/_env/ffmpeg.ts',
      'capabilities/orchestrate/manifest.ts',
      'CAPABILITIES.md',
      'src/Root.tsx',
      'src/demo-welcome/Main.tsx',
      'src/components/index.ts',
      'brand/brand.json',
      'brand/brand-voice.md',
      '.claude/agents/vibe-studio.md',
      '.claude/skills/video-editor/SKILL.md',
      '.claude/skills/template-distiller/SKILL.md',
      '.claude/settings.local.json',
      '.vibe/agent-settings.json',
      '.vibe/hooks/pretooluse-capability-firewall.mjs',
      '.env',
      '.env.example',
      'vibe.config.json',
    ]) {
      expect(existsSync(path.join(target, ...rel.split('/'))), rel).toBe(true);
    }

    // The machine snapshot must NOT be seeded (regenerated per machine by the probe).
    expect(existsSync(path.join(target, 'capabilities', '_env', 'ffmpeg-capabilities.json'))).toBe(false);

    // state.json: version, hash map, agent detection (mock seam → found), provision skips recorded.
    const state = readState(target)!;
    expect(state.projectName).toBe('my-videos');
    expect(state.brandName).toBe('Acme Studio');
    expect(Object.keys(state.files).length).toBeGreaterThan(100);
    expect(state.agent?.claude?.found).toBe(true);
    expect(state.provision?.install).toBe('skipped');
    expect(state.provision?.ffmpeg?.source).toBe('skipped');
    expect(state.provision?.venv).toBe('skipped');
  });

  it('rejects a non-empty target folder and bad names (typed exit 1)', async () => {
    mkdirSync(path.join(cwd, 'taken'));
    writeFileSync(path.join(cwd, 'taken', 'x.txt'), 'occupied');
    await expect(initProject({ name: 'taken', cwd, ...HEADLESS })).rejects.toThrowError(UserError);
    await expect(initProject({ name: '../escape', cwd, ...HEADLESS })).rejects.toThrowError(UserError);
    await expect(initProject({ name: '', cwd, ...HEADLESS })).rejects.toThrowError(UserError);
  });
});
