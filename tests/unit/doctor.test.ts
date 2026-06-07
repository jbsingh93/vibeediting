import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { envKeyChecks, isVibeProject, runDoctor } from '../../src/commands/doctor.js';
import { makeTempProject, type TempProject } from '../helpers/temp-project.js';

let tmp: TempProject;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  tmp = makeTempProject();
  for (const k of ['VIBE_AGENT_BIN', 'VIBE_CODEX_BIN', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'ELEVENLABS_API_KEY'])
    saved[k] = process.env[k];
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  tmp.cleanup();
});

describe('vibe doctor (full report)', () => {
  it('reports the core machine checks with a valid JSON shape', async () => {
    const report = await runDoctor(tmp.dir);
    const ids = report.checks.map((c) => c.id);
    for (const id of ['node', 'platform', 'disk', 'ffmpeg', 'ffprobe', 'claude', 'codex', 'agent', 'git'])
      expect(ids).toContain(id);

    expect(report.platform.os).toBe(process.platform);
    expect(report.projectDir).toBe(tmp.dir);
    expect(report.initialized).toBe(false); // bare temp dir is not a vibe project
    expect(ids.some((id) => id.startsWith('env-'))).toBe(false); // project checks skipped
    expect(report.summary.ok + report.summary.warn + report.summary.fail).toBe(report.checks.length);
    expect(report.ok).toBe(report.summary.fail === 0);
    for (const c of report.checks) expect(['ok', 'warn', 'fail']).toContain(c.status);
  });

  it('node check passes on the running toolchain (engines: >=20)', async () => {
    const node = (await runDoctor(tmp.dir)).checks.find((c) => c.id === 'node');
    expect(node?.status).toBe('ok');
  });

  it('agent rollup FAILS when neither brain resolves, and is ok when one does', async () => {
    process.env.VIBE_AGENT_BIN = path.join(tmp.dir, 'no-claude.exe');
    process.env.VIBE_CODEX_BIN = path.join(tmp.dir, 'no-codex.exe');
    const none = await runDoctor(tmp.dir);
    expect(none.checks.find((c) => c.id === 'agent')?.status).toBe('fail');
    expect(none.ok).toBe(false);

    process.env.VIBE_AGENT_BIN = path.join(tmp.dir, 'mock.mjs');
    fs.writeFileSync(process.env.VIBE_AGENT_BIN, 'process.stdout.write("1.2.3\\n");');
    const one = await runDoctor(tmp.dir);
    expect(one.checks.find((c) => c.id === 'claude')?.status).toBe('ok');
    expect(one.checks.find((c) => c.id === 'claude')?.detail).toContain('1.2.3');
    expect(one.checks.find((c) => c.id === 'agent')?.status).toBe('ok');
  });

  it('project mode: detects an initialized project and adds .env + venv + engine checks', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    fs.writeFileSync(path.join(tmp.dir, 'vibe.config.json'), JSON.stringify({ agent: 'auto' }));
    fs.writeFileSync(path.join(tmp.dir, '.env'), '# keys\nOPENAI_API_KEY=sk-test-123\n');

    expect(isVibeProject(tmp.dir)).toBe(true);
    const report = await runDoctor(tmp.dir);
    expect(report.initialized).toBe(true);

    const byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
    expect(byId['env-OPENAI_API_KEY']?.status).toBe('ok');
    expect(byId['env-GEMINI_API_KEY']?.status).toBe('warn');
    expect(byId['venv']?.status).toBe('warn'); // not provisioned in a bare project
    expect(byId['engine']?.status).toBe('warn'); // capabilities/ not present until V2+
    // values are NEVER echoed into the report
    expect(JSON.stringify(report)).not.toContain('sk-test-123');
  });
});

describe('envKeyChecks', () => {
  it('reads presence from .env text without exposing values', () => {
    delete process.env.RUNWAY_API_SECRET;
    fs.writeFileSync(path.join(tmp.dir, '.env'), 'RUNWAY_API_SECRET=rw-secret\n#FAL_KEY=commented-out\n');
    const checks = envKeyChecks(tmp.dir);
    const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
    expect(byId['env-RUNWAY_API_SECRET']?.status).toBe('ok');
    expect(byId['env-FAL_KEY']?.status).toBe('warn'); // commented lines don't count
    expect(JSON.stringify(checks)).not.toContain('rw-secret');
  });

  it('does NOT count an EMPTY `KEY=` line as set, even with content on following lines', () => {
    // Regression (live-found V5 prep): `\s*` after `=` swallowed the newline and matched the
    // NEXT line's first char, so every empty key except the file's last reported "set".
    for (const k of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'ELEVENLABS_API_KEY', 'RUNWAY_API_SECRET', 'FAL_KEY']) {
      delete process.env[k];
    }
    fs.writeFileSync(
      path.join(tmp.dir, '.env'),
      '# template-style file: every value empty, comments between keys\n' +
        'OPENAI_API_KEY=\n\n# REQUIRED — the visual QA eyes\nGEMINI_API_KEY=\n\n' +
        '# REQUIRED — voice\nELEVENLABS_API_KEY=\nRUNWAY_API_SECRET=\nFAL_KEY=\n',
    );
    const checks = envKeyChecks(tmp.dir);
    for (const c of checks) {
      expect(c.status, `${c.id} must be warn when its value is empty`).toBe('warn');
    }
  });
});
