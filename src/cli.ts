/**
 * `vibe` — commander root dispatcher (aabclitool pattern).
 *
 * Global options: --project --json --quiet --log-level
 * Default command: `vibe` with no args = `vibe ui` (the UI is the product surface).
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { VERSION, PRODUCT_DESCRIPTION } from './version.js';
import { VibeError, CancelledError } from './core/errors.js';
import { registerInitCommand } from './commands/init.js';
import { registerUiCommand } from './commands/ui.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerSetupCommand } from './commands/setup.js';
import { registerUpgradeCommand } from './commands/upgrade.js';
import { registerRunCommand } from './commands/run.js';
import { registerNewCompCommand } from './commands/new-comp.js';

export interface GlobalOpts {
  project?: string;
  json?: boolean;
  quiet?: boolean;
  logLevel?: string;
}

function handleError(error: unknown): never {
  if (error instanceof CancelledError) {
    process.stderr.write(`${chalk.yellow('•')} ${error.message}\n`);
    process.exit(error.exitCode);
  }
  if (error instanceof VibeError) {
    process.stderr.write(`${chalk.red('✗')} ${error.message}\n`);
    if (error.hint) process.stderr.write(chalk.dim(`  ${error.hint}\n`));
    process.exit(error.exitCode);
  }
  const msg = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${chalk.red('✗')} ${msg}\n`);
  process.exit(1);
}

export async function runCli(argv: string[]): Promise<void> {
  process.on('SIGINT', () => {
    process.exit(6); // cancelled
  });

  const program = new Command();
  program
    .name('vibe')
    .description(PRODUCT_DESCRIPTION)
    .version(VERSION, '-v, --version', 'print the installed version')
    .option('--project <dir>', 'project folder (default: current directory)')
    .option('--json', 'machine-readable output where supported')
    .option('--quiet', 'suppress non-error output')
    .option('--log-level <level>', 'silent | error | warn | info | debug');

  registerInitCommand(program);
  registerUiCommand(program);
  registerDoctorCommand(program);
  registerSetupCommand(program);
  registerUpgradeCommand(program);
  registerRunCommand(program);
  registerNewCompCommand(program);

  // `vibe` with no arguments = `vibe ui` (D16: the UI is the product surface).
  const args = argv.slice(2);
  const effectiveArgv = args.length === 0 ? [...argv, 'ui'] : argv;

  try {
    await program.parseAsync(effectiveArgv);
  } catch (error) {
    handleError(error);
  }
}
