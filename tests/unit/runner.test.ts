import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAgentPreference, selectRunner, detectAgents } from '../../src/agent/runner.js';
import { makeTempProject, type TempProject } from '../helpers/temp-project.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOCK = path.resolve(HERE, '..', 'helpers', 'mock-agent.mjs');

let tmp: TempProject;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  tmp = makeTempProject();
  for (const k of ['VIBE_AGENT_BIN', 'VIBE_CODEX_BIN']) saved[k] = process.env[k];
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  tmp.cleanup();
});

describe('readAgentPreference (vibe.config.json)', () => {
  it('defaults to auto when config is missing or malformed', () => {
    expect(readAgentPreference(tmp.dir)).toBe('auto');
    fs.writeFileSync(path.join(tmp.dir, 'vibe.config.json'), '{broken');
    expect(readAgentPreference(tmp.dir)).toBe('auto');
  });
  it('honors explicit claude/codex/auto; rejects unknown values', () => {
    const cfg = path.join(tmp.dir, 'vibe.config.json');
    fs.writeFileSync(cfg, JSON.stringify({ agent: 'codex' }));
    expect(readAgentPreference(tmp.dir)).toBe('codex');
    fs.writeFileSync(cfg, JSON.stringify({ agent: 'claude' }));
    expect(readAgentPreference(tmp.dir)).toBe('claude');
    fs.writeFileSync(cfg, JSON.stringify({ agent: 'gpt-99' }));
    expect(readAgentPreference(tmp.dir)).toBe('auto');
  });
});

describe('selectRunner', () => {
  it('auto picks claude when the claude seam resolves', async () => {
    process.env.VIBE_AGENT_BIN = MOCK; // exists → claude "found" (mock runs under node)
    process.env.VIBE_CODEX_BIN = path.join(tmp.dir, 'no-such-codex.exe'); // → not found
    const sel = await selectRunner(tmp.dir);
    expect(sel.preference).toBe('auto');
    expect(sel.runner?.id).toBe('claude');
  });

  it('auto falls back to codex when claude is missing but codex resolves', async () => {
    process.env.VIBE_AGENT_BIN = path.join(tmp.dir, 'no-such-claude.exe');
    process.env.VIBE_CODEX_BIN = MOCK; // exists + exits 0 on --version
    const sel = await selectRunner(tmp.dir);
    expect(sel.runner?.id).toBe('codex');
  });

  it('auto yields null when neither brain is found (UI shows offline + install help)', async () => {
    process.env.VIBE_AGENT_BIN = path.join(tmp.dir, 'no-such-claude.exe');
    process.env.VIBE_CODEX_BIN = path.join(tmp.dir, 'no-such-codex.exe');
    const sel = await selectRunner(tmp.dir);
    expect(sel.runner).toBeNull();
    expect(sel.detections.every((d) => !d.found)).toBe(true);
  });

  it('an explicit preference is honored even when undetected (turn degrades to offline)', async () => {
    process.env.VIBE_AGENT_BIN = path.join(tmp.dir, 'no-such-claude.exe');
    process.env.VIBE_CODEX_BIN = path.join(tmp.dir, 'no-such-codex.exe');
    fs.writeFileSync(path.join(tmp.dir, 'vibe.config.json'), JSON.stringify({ agent: 'claude' }));
    const sel = await selectRunner(tmp.dir);
    expect(sel.preference).toBe('claude');
    expect(sel.runner?.id).toBe('claude');
  });

  it('detectAgents reports both brains with found flags', async () => {
    process.env.VIBE_AGENT_BIN = MOCK;
    process.env.VIBE_CODEX_BIN = path.join(tmp.dir, 'no-such-codex.exe');
    const detections = await detectAgents();
    expect(detections.map((d) => d.id).sort()).toEqual(['claude', 'codex']);
    expect(detections.find((d) => d.id === 'claude')?.found).toBe(true);
    expect(detections.find((d) => d.id === 'codex')?.found).toBe(false);
  });
});
