import type { Command } from 'commander';
import { notImplemented } from './_stub.js';

export function registerUpgradeCommand(program: Command): void {
  program
    .command('upgrade')
    .description('re-sync generated files from the installed package version (user-modified files preserved)')
    .action(() => {
      notImplemented('upgrade', 'V3', 'the marker-based re-sync');
    });
}
