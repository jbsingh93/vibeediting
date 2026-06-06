/**
 * Shared helper for not-yet-implemented commands (pre-alpha skeleton, phase V0).
 * Each stub names the phase that delivers it so early adopters/devs know the plan.
 */
import chalk from 'chalk';

export function notImplemented(command: string, phase: string, what: string): void {
  process.stderr.write(
    `${chalk.yellow('•')} ${chalk.bold(`vibe ${command}`)} is not implemented yet — ${what} lands in phase ${phase}.\n`,
  );
  process.exitCode = 1;
}
