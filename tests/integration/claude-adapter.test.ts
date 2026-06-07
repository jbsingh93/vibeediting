/**
 * The agent-bridge integration suite (GATE V1 core): a FULL turn through runClaudeTurn with
 * the mock agent — streaming, glyph classification, session persistence, chat.jsonl,
 * --resume continuity, the cockpit-contract prepend, question cards, and offline
 * degradation. Zero subscription spend: the real CLI is never spawned here.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runClaudeTurn } from '../../src/agent/claude-adapter.js';
import { readChat, readSessionId } from '../../src/agent/chat.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { TurnResult } from '../../src/agent/runner-types.js';
import { makeTempProject, readManifestRaw, seedManifest, type TempProject } from '../helpers/temp-project.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOCK = path.resolve(HERE, '..', 'helpers', 'mock-agent.mjs');

let tmp: TempProject;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  tmp = makeTempProject();
  for (const k of ['VIBE_AGENT_BIN', 'VIBE_MOCK_ARGV_LOG', 'VIBE_MOCK_STDIN_LOG', 'VIBE_MOCK_COMPLETE_STAGE', 'VIBE_MOCK_SCENARIO'])
    saved[k] = process.env[k];
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  tmp.cleanup();
});

function collect(project: string, text: string): Promise<{ events: AgentEvent[]; result: TurnResult }> {
  const events: AgentEvent[] = [];
  return runClaudeTurn({
    projectDir: tmp.dir,
    project,
    prompt: text,
    onEvent: (e) => events.push(e),
  }).then((result) => ({ events, result }));
}

describe('runClaudeTurn with the mock agent (zero subscription spend)', () => {
  it('streams text + glyph-coded activity + session + done, and the agent edit lands in the manifest', async () => {
    process.env.VIBE_AGENT_BIN = MOCK;
    seedManifest(tmp.projectsDir, 'a1', { mode: 'wizard', stages: { ingest: { status: 'running' } } });

    const { events, result } = await collect('a1', 'make the ingest');

    expect(events).toContainEqual({ type: 'session', sessionId: 'mock-session-1' });
    const text = events.find((e) => e.type === 'text');
    expect(text && 'delta' in text && text.delta).toMatch(/Planning the ingest/);

    const toolStart = events.find((e) => e.type === 'tool' && e.status === 'start');
    expect(toolStart).toMatchObject({ type: 'tool', status: 'start', capability: 'ingest/transcribe', glyph: '⚙' });
    expect(events.some((e) => e.type === 'tool' && e.status === 'ok')).toBe(true);

    const done = events.find((e) => e.type === 'done');
    expect(done && 'result' in done && done.result).toMatch(/Ingest complete/);

    // brain↔body: the mock's manifest edit is on disk (the watcher will push this to the UI)
    expect(readManifestRaw(tmp.projectsDir, 'a1').stages.ingest!.status).toBe('complete');
    // session persisted for multi-turn
    expect(readSessionId(tmp.projectsDir, 'a1', 'claude')).toBe('mock-session-1');
    // and the TurnResult summarizes the turn
    expect(result).toMatchObject({ status: 'done', sessionId: 'mock-session-1' });
    expect(result.result).toMatch(/Ingest complete/);
  });

  it('persists the transcript to chat.jsonl (user msg + events, replayable)', async () => {
    process.env.VIBE_AGENT_BIN = MOCK;
    seedManifest(tmp.projectsDir, 'a4', { mode: 'wizard' });

    await collect('a4', 'make the ingest');

    const entries = readChat(tmp.projectsDir, 'a4');
    expect(entries.length).toBeGreaterThanOrEqual(4); // user + text + 2 tool rows + done
    expect(entries[0]).toMatchObject({ t: 'user', text: 'make the ingest' });
    const types = entries.filter((e) => e.t === 'event').map((e) => (e.t === 'event' ? e.e.type : ''));
    expect(types).toContain('text');
    expect(types).toContain('tool');
    expect(types).toContain('done');
    expect(types).not.toContain('session'); // transient, never replayed
  });

  it('passes --resume on the 2nd turn (multi-turn continuity)', async () => {
    process.env.VIBE_AGENT_BIN = MOCK;
    const log = path.join(tmp.dir, 'argv.log');
    process.env.VIBE_MOCK_ARGV_LOG = log;
    seedManifest(tmp.projectsDir, 'a2', { mode: 'wizard', stages: { ingest: { status: 'running' } } });

    await collect('a2', 'turn one'); // saves session id
    const { events: turn2 } = await collect('a2', 'turn two'); // should --resume

    const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).not.toContain('--resume');
    expect(lines[1]).toContain('--resume mock-session-1');
    expect(turn2.some((e) => e.type === 'text' && 'delta' in e && /Resuming/.test(e.delta))).toBe(true);
  });

  it('prepends the cockpit-contract reminder on agent-mode projects (mechanical, not prose)', async () => {
    process.env.VIBE_AGENT_BIN = MOCK;
    const stdinLog = path.join(tmp.dir, 'stdin.log');
    process.env.VIBE_MOCK_STDIN_LOG = stdinLog;
    seedManifest(tmp.projectsDir, 'a5', {
      mode: 'agent',
      notes: 'Agent-mode project — brief comes from the chat.',
    });

    await collect('a5', 'make me a 9:16 ad');

    // the reminder makes the prompt multi-line → it travels via stdin (the hardening path)
    const body = JSON.parse(fs.readFileSync(stdinLog, 'utf8').trim().split('\n')[0]!) as string;
    expect(body).toContain('[Cockpit contract — NOT yet satisfied on "a5"');
    expect(body).toContain('make me a 9:16 ad');
    // but the transcript records what the USER typed, not the bracketed scaffolding
    const entries = readChat(tmp.projectsDir, 'a5');
    expect(entries[0]).toMatchObject({ t: 'user', text: 'make me a 9:16 ad' });
  });

  it('surfaces AskUserQuestion as a question card and swallows its expected error result', async () => {
    process.env.VIBE_AGENT_BIN = MOCK;
    const scenario = path.join(tmp.dir, 'scenario.json');
    process.env.VIBE_MOCK_SCENARIO = scenario;
    fs.writeFileSync(
      scenario,
      JSON.stringify({
        reply: 'Asked the user.',
        question: { questions: [{ question: 'Which style?', options: [{ label: 'Clean' }, { label: 'Bold' }] }] },
      }),
    );
    seedManifest(tmp.projectsDir, 'a6', { mode: 'wizard' });

    const { events } = await collect('a6', 'start');

    const q = events.find((e) => e.type === 'question');
    expect(q && 'questions' in q && q.questions[0]!.question).toBe('Which style?');
    // the expected headless error tool_result was swallowed — no error row in the feed
    expect(events.some((e) => e.type === 'tool' && e.status === 'error')).toBe(false);
  });

  it('degrades to an offline event when the agent CLI is not found', async () => {
    process.env.VIBE_AGENT_BIN = path.join(tmp.dir, 'no-such-claude.exe');
    seedManifest(tmp.projectsDir, 'a3', { mode: 'wizard' });

    const { events, result } = await collect('a3', 'hello');

    expect(events).toContainEqual({ type: 'offline', reason: expect.stringMatching(/claude login/i) });
    expect(result.status).toBe('offline');
    // an offline turn must not have touched the manifest
    expect(readManifestRaw(tmp.projectsDir, 'a3').stages).toEqual({});
  });

  it('long prompts (>8k) travel via stdin, not argv (Windows argv limit)', async () => {
    process.env.VIBE_AGENT_BIN = MOCK;
    const argvLog = path.join(tmp.dir, 'argv2.log');
    const stdinLog = path.join(tmp.dir, 'stdin2.log');
    process.env.VIBE_MOCK_ARGV_LOG = argvLog;
    process.env.VIBE_MOCK_STDIN_LOG = stdinLog;
    seedManifest(tmp.projectsDir, 'a7', { mode: 'wizard' });

    const big = 'x'.repeat(9000);
    await collect('a7', big);

    expect(fs.readFileSync(argvLog, 'utf8')).not.toContain('xxxxxxxxxx');
    const body = JSON.parse(fs.readFileSync(stdinLog, 'utf8').trim().split('\n')[0]!) as string;
    expect(body).toContain(big);
  });
});
