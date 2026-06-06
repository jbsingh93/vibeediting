/**
 * `vibe doctor` — preliminary environment checks (V0 stub).
 *
 * V0 ships a small, honest subset that runs everywhere with zero project
 * context: Node version, platform, and PATH presence of the external tools
 * the product depends on. The full ported 11-check doctor (venv imports,
 * ffmpeg capability probe, disk space, project-mode checks, …) lands in V1
 * per the implementation plan.
 */
import { statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { Command } from 'commander';
import chalk from 'chalk';
import { VERSION } from '../version.js';

type CheckStatus = 'ok' | 'missing' | 'warn';

interface DoctorCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

/** Cross-platform PATH scan — avoids child-process spawn quirks (.cmd shims) in the stub. */
export function findOnPath(names: string[]): string | null {
  const pathEnv = process.env.PATH ?? '';
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', '.ps1'] : [''];
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      for (const ext of exts) {
        const candidate = join(dir, name + ext);
        try {
          if (statSync(candidate).isFile()) return candidate;
        } catch {
          // not here — keep scanning
        }
      }
    }
  }
  return null;
}

export function runDoctorChecks(): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({
    id: 'node',
    label: 'Node.js ≥ 20',
    status: nodeMajor >= 20 ? 'ok' : 'missing',
    detail: `v${process.versions.node}`,
  });

  checks.push({
    id: 'platform',
    label: 'Platform',
    status: 'ok',
    detail: `${process.platform} ${process.arch}`,
  });

  const tools: Array<{ id: string; label: string; names: string[]; required: boolean; hint: string }> = [
    {
      id: 'claude',
      label: 'Claude Code CLI',
      names: ['claude'],
      required: false,
      hint: 'npm install -g @anthropic-ai/claude-code',
    },
    {
      id: 'codex',
      label: 'Codex CLI',
      names: ['codex'],
      required: false,
      hint: 'npm install -g @openai/codex',
    },
    {
      id: 'ffmpeg',
      label: 'FFmpeg',
      names: ['ffmpeg'],
      required: false,
      hint: 'vibe init will auto-provision FFmpeg per-OS (from V2)',
    },
    {
      id: 'git',
      label: 'git',
      names: ['git'],
      required: false,
      hint: 'https://git-scm.com/downloads',
    },
  ];

  for (const tool of tools) {
    const found = findOnPath(tool.names);
    checks.push({
      id: tool.id,
      label: tool.label,
      status: found ? 'ok' : 'warn',
      detail: found ?? `not on PATH — ${tool.hint}`,
    });
  }

  // The product needs at least ONE agent CLI (Claude Code or Codex).
  const hasAgent = checks.some((c) => (c.id === 'claude' || c.id === 'codex') && c.status === 'ok');
  checks.push({
    id: 'agent',
    label: 'Agent CLI (Claude Code or Codex)',
    status: hasAgent ? 'ok' : 'missing',
    detail: hasAgent
      ? 'at least one agent CLI found'
      : 'none found — JBS Vibe Editing requires Claude Code (or Codex CLI)',
  });

  return checks;
}

const GLYPH: Record<CheckStatus, string> = {
  ok: chalk.green('✓'),
  warn: chalk.yellow('•'),
  missing: chalk.red('✗'),
};

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('check this machine for everything JBS Vibe Editing needs')
    .option('--json', 'machine-readable output')
    .action((opts: { json?: boolean }, cmd: Command) => {
      // --json may be parsed by the root program (global option) — honor both.
      const json = opts.json === true || (cmd.optsWithGlobals() as { json?: boolean }).json === true;
      const checks = runDoctorChecks();
      const failed = checks.some((c) => c.status === 'missing');

      if (json) {
        process.stdout.write(
          `${JSON.stringify({ version: VERSION, preliminary: true, checks, ok: !failed }, null, 2)}\n`,
        );
      } else {
        process.stdout.write(chalk.bold(`vibe doctor (preliminary — full checks land in V1)\n\n`));
        for (const check of checks) {
          process.stdout.write(`  ${GLYPH[check.status]} ${check.label.padEnd(36)} ${chalk.dim(check.detail)}\n`);
        }
        process.stdout.write('\n');
        process.stdout.write(
          failed
            ? chalk.red('Some required checks failed — see above.\n')
            : chalk.green('Looking good for this stage.\n'),
        );
      }
      if (failed) process.exitCode = 1;
    });
}
