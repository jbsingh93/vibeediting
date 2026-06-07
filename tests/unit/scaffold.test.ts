/**
 * V3.4 — the scaffolder core: token substitution, template walk (rename map + skip rules),
 * project scaffold (seeds, .env, hashes) and the .vibe/state.json round-trip.
 * Uses a small fixture template (hermetic + fast); the real-template path is covered by
 * tests/integration/init.test.ts and the V3.6 scaffold suite.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  substituteTokens,
  planScaffold,
  scaffoldProject,
  sha256,
  writeState,
  readState,
  findTemplateDir,
  type ScaffoldTokens,
} from '../../src/init/scaffold.js';

const TOKENS: ScaffoldTokens = { projectName: 'my-videos', brandName: 'Acme', vibeVersion: '9.9.9' };

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function makeFixtureTemplate(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'vibe-template-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '{{PROJECT_NAME}}' }));
  writeFileSync(path.join(dir, 'gitignore'), 'node_modules\n.env\n');
  writeFileSync(path.join(dir, '.env.example'), 'OPENAI_API_KEY=\n');
  writeFileSync(path.join(dir, 'CLAUDE.md'), '# {{PROJECT_NAME}} by {{BRAND_NAME}} (vibe {{VIBE_VERSION}})\n');
  mkdirSync(path.join(dir, 'capabilities', '_env'), { recursive: true });
  writeFileSync(path.join(dir, 'capabilities', '_env', 'ffmpeg.ts'), '// engine\n');
  writeFileSync(path.join(dir, 'capabilities', '_env', 'ffmpeg-capabilities.json'), '{"machine":"snapshot"}');
  mkdirSync(path.join(dir, 'capabilities', '__pycache__'), { recursive: true });
  writeFileSync(path.join(dir, 'capabilities', '__pycache__', 'junk.pyc'), 'x');
  mkdirSync(path.join(dir, 'color', 'luts'), { recursive: true });
  writeFileSync(path.join(dir, 'color', 'luts', 'warm.cube'), 'TITLE "{{PROJECT_NAME}}"\n0 0 0\n');
  mkdirSync(path.join(dir, 'node_modules', 'x'), { recursive: true });
  writeFileSync(path.join(dir, 'node_modules', 'x', 'index.js'), 'no');
  mkdirSync(path.join(dir, 'sub'), { recursive: true });
  writeFileSync(path.join(dir, 'sub', 'gitignore'), 'NOT-renamed-here\n');
  return dir;
}

function makeTarget(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'vibe-target-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

describe('substituteTokens', () => {
  it('replaces all three tokens, every occurrence', () => {
    const out = substituteTokens('{{PROJECT_NAME}}/{{PROJECT_NAME}} {{BRAND_NAME}} v{{VIBE_VERSION}}', TOKENS);
    expect(out).toBe('my-videos/my-videos Acme v9.9.9');
  });
});

describe('planScaffold', () => {
  it('renames root gitignore, skips machine artifacts and junk dirs, keeps nested names', () => {
    const plan = planScaffold(makeFixtureTemplate());
    const rels = plan.map((p) => p.rel);
    expect(rels).toContain('.gitignore'); // root rename (npm strips dot-gitignore from tarballs)
    expect(rels).not.toContain('gitignore');
    expect(rels).toContain('sub/gitignore'); // rename applies at ROOT only
    expect(rels).toContain('.env.example');
    expect(rels).toContain('capabilities/_env/ffmpeg.ts');
    expect(rels).not.toContain('capabilities/_env/ffmpeg-capabilities.json'); // machine snapshot
    expect(rels.some((r) => r.includes('__pycache__'))).toBe(false);
    expect(rels.some((r) => r.includes('node_modules'))).toBe(false);
  });

  it('marks .cube as raw (no token substitution) and .json/.md as text', () => {
    const plan = planScaffold(makeFixtureTemplate());
    const byRel = Object.fromEntries(plan.map((p) => [p.rel, p.text]));
    expect(byRel['color/luts/warm.cube']).toBe(false);
    expect(byRel['package.json']).toBe(true);
    expect(byRel['CLAUDE.md']).toBe(true);
  });
});

describe('scaffoldProject', () => {
  it('writes substituted files, agent seeds, .env, .gitkeep dirs and a correct hash map', () => {
    const target = makeTarget();
    const { files, count } = scaffoldProject(makeFixtureTemplate(), target, TOKENS);

    // Token substitution in text files; none in .cube.
    expect(JSON.parse(readFileSync(path.join(target, 'package.json'), 'utf8')).name).toBe('my-videos');
    expect(readFileSync(path.join(target, 'CLAUDE.md'), 'utf8')).toContain('# my-videos by Acme (vibe 9.9.9)');
    expect(readFileSync(path.join(target, 'color', 'luts', 'warm.cube'), 'utf8')).toContain('{{PROJECT_NAME}}');

    // Rename landed.
    expect(existsSync(path.join(target, '.gitignore'))).toBe(true);

    // Agent runtime seeds (embedded payload).
    expect(existsSync(path.join(target, '.vibe', 'agent-settings.json'))).toBe(true);
    expect(existsSync(path.join(target, '.vibe', 'hooks', 'pretooluse-capability-firewall.mjs'))).toBe(true);
    expect(files['.vibe/agent-settings.json']).toBeDefined();

    // .env created from the example — and NOT hash-tracked (secrets).
    expect(readFileSync(path.join(target, '.env'), 'utf8')).toContain('OPENAI_API_KEY=');
    expect(files['.env']).toBeUndefined();

    // Standing dirs.
    for (const d of ['projects', 'public', 'deliver']) {
      expect(existsSync(path.join(target, d, '.gitkeep'))).toBe(true);
    }
    expect(existsSync(path.join(target, 'out'))).toBe(true);
    expect(existsSync(path.join(target, 'src', 'compositions'))).toBe(true);

    // Hash map matches bytes on disk.
    expect(count).toBe(Object.keys(files).length);
    for (const [rel, hash] of Object.entries(files)) {
      const onDisk = readFileSync(path.join(target, ...rel.split('/')));
      expect(sha256(onDisk), rel).toBe(hash);
    }
  });
});

describe('state round-trip', () => {
  it('writes and reads .vibe/state.json atomically', () => {
    const target = makeTarget();
    writeState(target, {
      packageVersion: '9.9.9',
      projectName: 'my-videos',
      brandName: 'Acme',
      platform: process.platform,
      createdAt: '2026-06-07T00:00:00.000Z',
      files: { 'a.txt': 'deadbeef' },
    });
    const state = readState(target);
    expect(state?.projectName).toBe('my-videos');
    expect(state?.files['a.txt']).toBe('deadbeef');
    expect(readState(mkdtempSync(path.join(tmpdir(), 'vibe-empty-')))).toBeNull();
  });
});

describe('findTemplateDir', () => {
  it('locates the real packaged template from the source tree', () => {
    const dir = findTemplateDir();
    expect(existsSync(path.join(dir, 'package.json'))).toBe(true);
    expect(existsSync(path.join(dir, 'capabilities'))).toBe(true);
    expect(existsSync(path.join(dir, 'gitignore'))).toBe(true); // dot-less in the template
  });
});
