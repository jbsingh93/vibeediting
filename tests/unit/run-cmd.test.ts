/**
 * V3.5 — `vibe run` plumbing: .env loading and capability-script resolution.
 * (The spawn path itself is exercised by the V3.6 scaffold integration test.)
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadEnvFile, resolveCapabilityScript } from '../../src/commands/run.js';
import { UserError } from '../../src/core/errors.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function tmp(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'vibe-run-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

describe('loadEnvFile', () => {
  it('parses KEY=VALUE with quotes/comments and never overrides live env', () => {
    const dir = tmp();
    writeFileSync(
      path.join(dir, '.env'),
      [
        '# comment',
        'OPENAI_API_KEY=sk-test-123',
        "GEMINI_API_KEY='quoted-value'",
        'ELEVENLABS_API_KEY="double quoted"',
        'EMPTY=',
        'export EXPORTED=yes',
        'not a valid line!!!',
      ].join('\n'),
    );
    const env = loadEnvFile(dir, { ALREADY: 'set', OPENAI_API_KEY: 'live-wins' });
    expect(env.OPENAI_API_KEY).toBe('live-wins'); // real env wins
    expect(env.GEMINI_API_KEY).toBe('quoted-value');
    expect(env.ELEVENLABS_API_KEY).toBe('double quoted');
    expect(env.EXPORTED).toBe('yes');
    expect(env.EMPTY).toBe('');
    expect(env.ALREADY).toBe('set');
  });

  it('returns the base env untouched when .env is absent', () => {
    const env = loadEnvFile(tmp(), { A: '1' });
    expect(env).toEqual({ A: '1' });
  });
});

describe('resolveCapabilityScript', () => {
  it('resolves bare, .ts-suffixed, capabilities/-prefixed and .py paths', () => {
    const dir = tmp();
    mkdirSync(path.join(dir, 'capabilities', 'ingest'), { recursive: true });
    writeFileSync(path.join(dir, 'capabilities', 'ingest', 'probe.ts'), '// x');
    writeFileSync(path.join(dir, 'capabilities', 'ingest', 'vad-cut.py'), '# x');

    const expectTs = path.join(dir, 'capabilities', 'ingest', 'probe.ts');
    expect(resolveCapabilityScript(dir, 'ingest/probe')).toBe(expectTs);
    expect(resolveCapabilityScript(dir, 'ingest/probe.ts')).toBe(expectTs);
    expect(resolveCapabilityScript(dir, 'capabilities/ingest/probe')).toBe(expectTs);
    expect(resolveCapabilityScript(dir, 'ingest\\probe')).toBe(expectTs);
    expect(resolveCapabilityScript(dir, 'ingest/vad-cut')).toBe(path.join(dir, 'capabilities', 'ingest', 'vad-cut.py'));
  });

  it('rejects traversal and unknown capabilities with typed user errors', () => {
    const dir = tmp();
    mkdirSync(path.join(dir, 'capabilities'), { recursive: true });
    expect(() => resolveCapabilityScript(dir, '../secrets')).toThrowError(UserError);
    expect(() => resolveCapabilityScript(dir, 'nope/missing')).toThrowError(UserError);
  });
});
