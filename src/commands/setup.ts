import type { Command } from 'commander';
import { notImplemented } from './_stub.js';

export function registerSetupCommand(program: Command): void {
  program
    .command('setup')
    .description('re-run individual provisioning steps')
    .option('--ffmpeg', 'provision FFmpeg into .vibe/bin')
    .option('--venv', 'create the Python venv for the audio/analysis engines')
    .option('--browser', 'install the Playwright browser for screen recording')
    .action(() => {
      notImplemented('setup', 'V2–V3', 'the FFmpeg/venv/browser provisioners');
    });
}
