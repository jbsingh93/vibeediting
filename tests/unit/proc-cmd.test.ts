/**
 * Windows .cmd spawn hardening — regression for the live-found V3 bug: a `.cmd` in a
 * SPACED path that does NOT resolve to a sibling .exe (npm.cmd-style) must survive the
 * `cmd /d /s /c` wrapper (outer-quote rule). Windows-only by nature.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { captureCommand, launchSpec } from '../../src/core/proc.js';

const WIN = process.platform === 'win32';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe.skipIf(!WIN)('launchSpec .cmd fallback (Windows)', () => {
  it('runs a .cmd living in a path with spaces and passes args through', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vibe proc spaced '));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const cmd = path.join(dir, 'echo me.cmd');
    // No sibling .exe → forces the cmd.exe /d /s /c wrapper path.
    writeFileSync(cmd, '@echo OK %1 %2\r\n');

    const r = await captureCommand(cmd, ['first', 'second arg']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('OK first');
    expect(r.stdout).toContain('second arg');
  });

  it('wraps the whole command line in outer quotes (the /s /c rule)', () => {
    const spec = launchSpec('C:\\Program Files\\fake\\tool.cmd', ['a b']);
    expect(spec.args[spec.args.length - 1]).toMatch(/^".*"$/);
    expect(spec.windowsVerbatimArguments).toBe(true);
  });
});
