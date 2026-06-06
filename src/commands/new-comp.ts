import type { Command } from 'commander';
import { notImplemented } from './_stub.js';

export function registerNewCompCommand(program: Command): void {
  program
    .command('new-comp <name>')
    .description('scaffold a new Remotion composition and register it in Root.tsx')
    .action(() => {
      notImplemented('new-comp', 'V3', 'the composition scaffolder');
    });
}
