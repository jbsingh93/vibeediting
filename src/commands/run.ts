import type { Command } from 'commander';
import { notImplemented } from './_stub.js';

export function registerRunCommand(program: Command): void {
  program
    .command('run <capability> [args...]')
    .description('run a capability script in the current project (passthrough to tsx capabilities/...)')
    .allowUnknownOption(true)
    .action(() => {
      notImplemented('run', 'V3', 'the capability passthrough');
    });
}
