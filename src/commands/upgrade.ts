/**
 * `vibe upgrade` — re-sync seeded files from the installed package version.
 *
 * Semantics (the GATE V3 contract): a seeded file the user EDITED is preserved
 * (reported, never touched); a PRISTINE file (content still hash-identical to what
 * init/last-upgrade wrote) is updated to the new template content. New template
 * files are added; files missing on disk are restored; files no longer shipped
 * are reported but never deleted. `.env`, projects/, public/ etc. are untouched
 * (they were never hash-tracked).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import type { Command } from 'commander';
import { UserError } from '../core/errors.js';
import { VERSION } from '../version.js';
import { AGENT_SEED_FILES } from '../init/agent-seeds.js';
import {
  findTemplateDir,
  planScaffold,
  renderScaffoldFile,
  readState,
  writeState,
  sha256,
  statePath,
  substituteTokens,
  type ScaffoldTokens,
} from '../init/scaffold.js';

export interface UpgradeReport {
  fromVersion: string;
  toVersion: string;
  updated: string[];
  added: string[];
  restored: string[];
  preserved: string[];
  removedFromTemplate: string[];
  unchanged: number;
  /** preserved (user-modified) files under capabilities/ — surfaced on the Health page. */
  modifiedEngineFiles: number;
  dryRun: boolean;
}

interface PlannedContent {
  rel: string;
  content: Buffer;
}

/** Everything the new package version would seed (template walk + embedded agent seeds). */
function planNewContents(templateDir: string, tokens: ScaffoldTokens): PlannedContent[] {
  const out: PlannedContent[] = planScaffold(templateDir).map((f) => ({
    rel: f.rel,
    content: renderScaffoldFile(f, tokens),
  }));
  for (const seed of AGENT_SEED_FILES) {
    out.push({ rel: seed.rel, content: Buffer.from(substituteTokens(seed.content, tokens), 'utf8') });
  }
  return out;
}

export function upgradeProject(
  projectDir: string,
  opts: { dryRun?: boolean; templateDir?: string } = {},
): UpgradeReport {
  const state = readState(projectDir);
  if (!state || !state.files) {
    // readState() returns null both for a MISSING file and for a CORRUPT one (it swallows the
    // parse error). Distinguish them so a corrupt state.json gets an actionable message instead
    // of "nothing to upgrade" — and is never overwritten (we throw before any write). [VT.2]
    if (state === null && fs.existsSync(statePath(projectDir))) {
      throw new UserError(
        'this project\'s .vibe/state.json is corrupt (not valid JSON) — cannot upgrade safely',
        'Restore .vibe/state.json from version control (it is git-tracked in scaffolded projects): `git checkout -- .vibe/state.json`. Note: `vibe init` cannot regenerate it here — init refuses to run in a non-empty folder.',
      );
    }
    throw new UserError(
      'this folder has no .vibe/state.json — nothing to upgrade',
      'Run `vibe upgrade` inside a project created by `vibe init` (or pass --project <dir>).',
    );
  }

  const tokens: ScaffoldTokens = {
    projectName: state.projectName,
    brandName: state.brandName ?? 'My Brand',
    vibeVersion: VERSION,
  };
  const planned = planNewContents(opts.templateDir ?? findTemplateDir(), tokens);
  const plannedRels = new Set(planned.map((p) => p.rel));

  const report: UpgradeReport = {
    fromVersion: state.packageVersion,
    toVersion: VERSION,
    updated: [],
    added: [],
    restored: [],
    preserved: [],
    removedFromTemplate: [],
    unchanged: 0,
    modifiedEngineFiles: 0,
    dryRun: Boolean(opts.dryRun),
  };

  const newFiles: Record<string, string> = { ...state.files };

  for (const { rel, content } of planned) {
    const dest = path.join(projectDir, ...rel.split('/'));
    const newHash = sha256(content);
    const seededHash = state.files[rel];
    const exists = fs.existsSync(dest);
    const currentHash = exists ? sha256(fs.readFileSync(dest)) : null;

    const write = (): void => {
      if (opts.dryRun) return;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, content);
    };

    if (seededHash === undefined) {
      // Never seeded before → new in this package version.
      if (!exists) {
        write();
        newFiles[rel] = newHash;
        report.added.push(rel);
      } else if (currentHash === newHash) {
        newFiles[rel] = newHash;
        report.unchanged++;
      } else {
        // A user file occupies the path — sacred.
        report.preserved.push(rel);
      }
      continue;
    }

    if (!exists) {
      write();
      newFiles[rel] = newHash;
      report.restored.push(rel);
      continue;
    }

    if (currentHash === newHash) {
      newFiles[rel] = newHash;
      report.unchanged++;
      continue;
    }

    if (currentHash === seededHash) {
      // Pristine → safe to update.
      write();
      newFiles[rel] = newHash;
      report.updated.push(rel);
    } else {
      // User-modified → sacred. Baseline hash stays at what THEY started from.
      report.preserved.push(rel);
    }
  }

  for (const rel of Object.keys(state.files)) {
    if (!plannedRels.has(rel)) report.removedFromTemplate.push(rel);
  }

  report.modifiedEngineFiles = report.preserved.filter((r) => r.startsWith('capabilities/')).length;

  if (!opts.dryRun) {
    writeState(projectDir, { ...state, packageVersion: VERSION, files: newFiles });
  }
  return report;
}

export function renderUpgradeReport(r: UpgradeReport): string {
  const lines: string[] = [];
  const arrow = r.fromVersion === r.toVersion ? r.toVersion : `${r.fromVersion} → ${r.toVersion}`;
  lines.push(`${chalk.bold('vibe upgrade')} ${arrow}${r.dryRun ? chalk.yellow(' (dry-run — nothing written)') : ''}`);
  const row = (label: string, items: string[], color: (s: string) => string): void => {
    if (items.length === 0) return;
    lines.push(`  ${color(`${label} (${items.length})`)}`);
    const shown = items.slice(0, 12);
    for (const i of shown) lines.push(`    ${chalk.dim(i)}`);
    if (items.length > shown.length) lines.push(`    ${chalk.dim(`… +${items.length - shown.length} more`)}`);
  };
  row('updated', r.updated, chalk.green);
  row('added', r.added, chalk.green);
  row('restored (was missing)', r.restored, chalk.cyan);
  row('preserved (you modified these — left untouched)', r.preserved, chalk.yellow);
  row('no longer shipped (left in place)', r.removedFromTemplate, chalk.dim);
  lines.push(`  ${chalk.dim(`unchanged: ${r.unchanged}`)}`);
  if (r.modifiedEngineFiles > 0) {
    lines.push(
      `  ${chalk.yellow(`⚠ modified engine files: ${r.modifiedEngineFiles}`)} ${chalk.dim('(capabilities/ you edited — they no longer track upstream fixes)')}`,
    );
  }
  return lines.join('\n');
}

export function registerUpgradeCommand(program: Command): void {
  program
    .command('upgrade')
    .description('re-sync generated files from the installed package version (user-modified files preserved)')
    .option('--dry-run', 'show what would change without writing')
    .action((opts: { dryRun?: boolean }, cmd: Command) => {
      const globals = cmd.optsWithGlobals<{ project?: string; json?: boolean }>();
      const projectDir = path.resolve(globals.project ?? process.cwd());
      const report = upgradeProject(projectDir, { dryRun: opts.dryRun });
      if (globals.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      } else {
        process.stderr.write(`${renderUpgradeReport(report)}\n`);
      }
    });
}
