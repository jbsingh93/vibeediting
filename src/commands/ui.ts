import type { Command } from 'commander';
import { notImplemented } from './_stub.js';

export function registerUiCommand(program: Command): void {
  program
    .command('ui')
    .description('start the JBS Vibe Editing web UI in the current project')
    .option('--port <port>', 'UI port (default 7878, env VIBE_UI_PORT)')
    .option('--no-open', 'do not auto-open the browser')
    .action(() => {
      notImplemented('ui', 'V4', 'the cockpit UI server');
    });
}
