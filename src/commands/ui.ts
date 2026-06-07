/**
 * `vibe ui` — start the cockpit web server in the current project (D16: the UI is the
 * product surface; `vibe` with no args lands here). Serves the prebuilt client from the
 * package's ui-dist/ against the project in --project/cwd, then opens the browser.
 */
import * as path from 'node:path';
import type { Command } from 'commander';
import chalk from 'chalk';
import { UserError } from '../core/errors.js';
import { isVibeProject } from './doctor.js';

export function registerUiCommand(program: Command): void {
  program
    .command('ui')
    .description('start the JBS Vibe Editing web UI in the current project')
    .option('--port <port>', 'UI port (default 7878, env VIBE_UI_PORT)')
    .option('--no-open', 'do not auto-open the browser')
    .action(async (opts: { port?: string; open?: boolean }, cmd: Command) => {
      const globals = cmd.optsWithGlobals() as { project?: string; quiet?: boolean };
      const dir = path.resolve(globals.project ?? process.cwd());
      if (!isVibeProject(dir)) {
        throw new UserError(
          `${dir} is not a vibe project (no vibe.config.json / .vibe/state.json)`,
          'run `vibe init <name>` to create one, or pass --project <dir>',
        );
      }

      // The server stack is imported lazily so `vibe --version` & friends stay instant.
      const { setProjectDir, readVibeConfig, findUiDist } = await import('../server/context.js');
      const { startServer, openBrowser } = await import('../server/index.js');

      setProjectDir(dir);
      const cfg = readVibeConfig(dir);
      const port =
        (opts.port ? Number(opts.port) : undefined) ??
        (process.env.VIBE_UI_PORT ? Number(process.env.VIBE_UI_PORT) : undefined) ??
        cfg.uiPort ??
        7878;
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new UserError(`invalid port "${opts.port}"`, 'pass --port 1024-65535');
      }

      if (!findUiDist() && !globals.quiet) {
        process.stderr.write(
          chalk.yellow('• ui-dist/ not found — serving the API only (build the client with `npm run ui:build`)\n'),
        );
      }

      // VIBE_UI_NO_WATCH lets a secondary server (tests) skip the chokidar watcher so two
      // servers never attach watchers to the same projects dir (Windows rename EPERM).
      const watch = !process.env.VIBE_UI_NO_WATCH;
      const { app, port: actual } = await startServer({ serveStatic: true, watch, port });

      const url = `http://localhost:${actual}`;
      if (!globals.quiet) {
        process.stdout.write(`\n  JBS Vibe Editing  →  ${chalk.cyan(url)}\n  (Ctrl+C to stop)\n\n`);
      }
      if (opts.open !== false && !process.env.VIBE_UI_NO_OPEN) openBrowser(url);

      // Graceful shutdown on SIGINT/SIGTERM (SIGINT exits 6 via the root handler).
      const close = (): void => {
        void app.close();
      };
      process.once('SIGTERM', close);
    });
}
