/**
 * VT.2 — `vibe setup` flag plumbing (doc 13 §4). registerSetupCommand routes --ffmpeg/--venv/
 * --browser to their provisioners with the resolved projectDir, and refuses a no-flag invocation
 * with a typed UserError. The provisioners are injected (a test seam mirroring how doctor/init keep
 * their side effects behind a boundary) so nothing touches the network or filesystem here.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerSetupCommand, type SetupDeps } from '../../src/commands/setup.js';
import { UserError } from '../../src/core/errors.js';

interface Calls {
  ffmpeg: string[];
  venv: string[];
  browser: string[];
}

function buildProgram(): { program: Command; calls: Calls } {
  const calls: Calls = { ffmpeg: [], venv: [], browser: [] };
  const deps: SetupDeps = {
    ffmpeg: async (dir) => {
      calls.ffmpeg.push(dir);
    },
    venv: (dir) => {
      calls.venv.push(dir);
    },
    browser: (dir) => {
      calls.browser.push(dir);
    },
  };
  const program = new Command();
  program.exitOverride(); // throw instead of process.exit on commander-level errors
  program.option('--project <dir>', 'project folder');
  registerSetupCommand(program, deps);
  return { program, calls };
}

let env: { program: Command; calls: Calls };
beforeEach(() => {
  env = buildProgram();
});

describe('vibe setup flag plumbing', () => {
  it('--ffmpeg routes ONLY to the ffmpeg provisioner with the resolved projectDir', async () => {
    await env.program.parseAsync(['node', 'vibe', '--project', '/tmp/proj', 'setup', '--ffmpeg']);
    expect(env.calls.ffmpeg).toHaveLength(1);
    expect(env.calls.ffmpeg[0]).toContain('proj'); // path.resolve applied; cross-platform-safe substring
    expect(env.calls.venv).toHaveLength(0);
    expect(env.calls.browser).toHaveLength(0);
  });

  it('--venv routes ONLY to the venv provisioner', async () => {
    await env.program.parseAsync(['node', 'vibe', '--project', '/tmp/proj', 'setup', '--venv']);
    expect(env.calls.venv).toHaveLength(1);
    expect(env.calls.ffmpeg).toHaveLength(0);
    expect(env.calls.browser).toHaveLength(0);
  });

  it('--ffmpeg --venv together route to BOTH provisioners', async () => {
    await env.program.parseAsync(['node', 'vibe', '--project', '/tmp/proj', 'setup', '--ffmpeg', '--venv']);
    expect(env.calls.ffmpeg).toHaveLength(1);
    expect(env.calls.venv).toHaveLength(1);
    expect(env.calls.browser).toHaveLength(0);
  });

  it('no flags → a typed UserError (exit 1) with an actionable hint, no provisioner called', async () => {
    let caught: unknown;
    try {
      await env.program.parseAsync(['node', 'vibe', 'setup']);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UserError);
    expect((caught as UserError).exitCode).toBe(1);
    expect((caught as UserError).hint).toMatch(/--ffmpeg.*--venv.*--browser/i);
    expect(env.calls.ffmpeg).toHaveLength(0);
    expect(env.calls.venv).toHaveLength(0);
    expect(env.calls.browser).toHaveLength(0);
  });
});
