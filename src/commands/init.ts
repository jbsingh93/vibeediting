import type { Command } from 'commander';
import { notImplemented } from './_stub.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init [name]')
    .description('scaffold a complete video project and open the UI')
    .option('--no-ui', 'do not auto-start the UI after init')
    .action(() => {
      notImplemented('init', 'V3', 'the project scaffolder');
    });
}
