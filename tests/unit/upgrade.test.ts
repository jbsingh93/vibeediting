/**
 * V3.5 — `vibe upgrade` marker/hash semantics (THE GATE V3 contract):
 * edit a generated file → preserved; pristine file → updated; missing → restored;
 * new template file → added; removed-from-template → reported, never deleted.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scaffoldProject, writeState, readState, type ScaffoldTokens } from '../../src/init/scaffold.js';
import { upgradeProject } from '../../src/commands/upgrade.js';
import { UserError } from '../../src/core/errors.js';
import { VERSION } from '../../src/version.js';

const TOKENS: ScaffoldTokens = { projectName: 'proj', brandName: 'Acme', vibeVersion: '0.0.1' };

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A v1 template + a scaffolded project from it, state.json included. */
function seedProject(): { templateDir: string; projectDir: string } {
  const templateDir = tmp('vibe-tpl-');
  writeFileSync(path.join(templateDir, 'package.json'), JSON.stringify({ name: '{{PROJECT_NAME}}' }));
  mkdirSync(path.join(templateDir, 'capabilities', 'ingest'), { recursive: true });
  writeFileSync(path.join(templateDir, 'capabilities', 'ingest', 'probe.ts'), 'export const v = 1;\n');
  writeFileSync(path.join(templateDir, 'CLAUDE.md'), 'guide v1 for {{PROJECT_NAME}}\n');
  writeFileSync(path.join(templateDir, 'gone.md'), 'will be removed from the template\n');

  const projectDir = tmp('vibe-proj-');
  const { files } = scaffoldProject(templateDir, projectDir, TOKENS);
  writeState(projectDir, {
    packageVersion: '0.0.1',
    projectName: TOKENS.projectName,
    brandName: TOKENS.brandName,
    platform: process.platform,
    createdAt: new Date().toISOString(),
    files,
  });
  return { templateDir, projectDir };
}

describe('upgradeProject', () => {
  it('updates pristine files, preserves user-modified ones, restores missing, adds new, reports removed', () => {
    const { templateDir, projectDir } = seedProject();

    // Evolve the template: engine fix (probe.ts), guide rewrite (CLAUDE.md), new file, one removed.
    writeFileSync(path.join(templateDir, 'capabilities', 'ingest', 'probe.ts'), 'export const v = 2;\n');
    writeFileSync(path.join(templateDir, 'CLAUDE.md'), 'guide v2 for {{PROJECT_NAME}}\n');
    writeFileSync(path.join(templateDir, 'NEW.md'), 'brand new\n');
    rmSync(path.join(templateDir, 'gone.md'));

    // The user: edits the engine file, deletes the package.json... no — deletes CLAUDE.md? Use:
    // - probe.ts user-edited → must be PRESERVED
    // - CLAUDE.md pristine → must be UPDATED
    // - package.json deleted → must be RESTORED
    writeFileSync(path.join(projectDir, 'capabilities', 'ingest', 'probe.ts'), 'export const v = 1; // my tweak\n');
    rmSync(path.join(projectDir, 'package.json'));

    const report = upgradeProject(projectDir, { templateDir });

    expect(report.preserved).toContain('capabilities/ingest/probe.ts');
    expect(report.updated).toContain('CLAUDE.md');
    expect(report.restored).toContain('package.json');
    expect(report.added).toContain('NEW.md');
    expect(report.removedFromTemplate).toContain('gone.md');
    expect(report.modifiedEngineFiles).toBe(1);

    // Disk truth.
    expect(readFileSync(path.join(projectDir, 'capabilities', 'ingest', 'probe.ts'), 'utf8')).toContain('my tweak');
    expect(readFileSync(path.join(projectDir, 'CLAUDE.md'), 'utf8')).toContain('guide v2 for proj');
    expect(JSON.parse(readFileSync(path.join(projectDir, 'package.json'), 'utf8')).name).toBe('proj');
    expect(existsSync(path.join(projectDir, 'gone.md'))).toBe(true); // never deleted

    // State refreshed: version bumped, updated file re-baselined, preserved file keeps its OLD baseline.
    const state = readState(projectDir)!;
    expect(state.packageVersion).toBe(VERSION);
    const second = upgradeProject(projectDir, { templateDir });
    expect(second.updated).toHaveLength(0); // idempotent
    expect(second.preserved).toContain('capabilities/ingest/probe.ts'); // still sacred
  });

  it('treats a user file occupying a NEW template path as sacred', () => {
    const { templateDir, projectDir } = seedProject();
    writeFileSync(path.join(templateDir, 'NEW.md'), 'template version\n');
    writeFileSync(path.join(projectDir, 'NEW.md'), 'the user got there first\n');
    const report = upgradeProject(projectDir, { templateDir });
    expect(report.preserved).toContain('NEW.md');
    expect(readFileSync(path.join(projectDir, 'NEW.md'), 'utf8')).toContain('user got there first');
  });

  it('--dry-run reports without writing anything', () => {
    const { templateDir, projectDir } = seedProject();
    writeFileSync(path.join(templateDir, 'CLAUDE.md'), 'guide v2 for {{PROJECT_NAME}}\n');
    const report = upgradeProject(projectDir, { templateDir, dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.updated).toContain('CLAUDE.md');
    expect(readFileSync(path.join(projectDir, 'CLAUDE.md'), 'utf8')).toContain('guide v1'); // untouched
    expect(readState(projectDir)!.packageVersion).toBe('0.0.1'); // state untouched
  });

  it('refuses to run outside a scaffolded project (typed exit 1)', () => {
    const empty = tmp('vibe-not-a-project-');
    expect(() => upgradeProject(empty, {})).toThrowError(UserError);
  });
});
