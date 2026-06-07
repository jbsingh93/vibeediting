/**
 * codex-adapter integration (GATE VT — codex parity, doc 13 §4): a FULL turn through
 * runCodexTurn with a mock codex bin (VIBE_CODEX_BIN → mock-codex.mjs, which emits the codex
 * JSONL event shapes documented in tests/unit/codex-events.test.ts). Zero subscription spend:
 * the real codex CLI is never spawned.
 *
 * Locks: a full turn lands session + tool + text + done events AND chat.jsonl persistence;
 * turn.failed → error classification surfaced through `done`; resume continuity passes
 * `exec resume <thread_id>` on the 2nd turn (argv-log seam); cancel kills the child.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCodexTurn, cancelCodexTurn, isCodexBusy } from '../../src/agent/codex-adapter.js';
import { readChat, readSessionId } from '../../src/agent/chat.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { TurnResult } from '../../src/agent/runner-types.js';
import { makeTempProject, seedManifest, type TempProject } from '../helpers/temp-project.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOCK_CODEX = path.resolve(HERE, '..', 'helpers', 'mock-codex.mjs');

let tmp: TempProject;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  tmp = makeTempProject();
  for (const k of ['VIBE_CODEX_BIN', 'VIBE_MOCK_ARGV_LOG', 'VIBE_MOCK_STDIN_LOG', 'VIBE_CODEX_SCENARIO', 'VIBE_MOCK_SLEEP_MS'])
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
  return runCodexTurn({
    projectDir: tmp.dir,
    project,
    prompt: text,
    onEvent: (e) => events.push(e),
  }).then((result) => ({ events, result }));
}

describe('runCodexTurn with the mock codex bin (zero subscription spend)', () => {
  it('streams session + tool + text + done and persists chat.jsonl', async () => {
    process.env.VIBE_CODEX_BIN = MOCK_CODEX;
    seedManifest(tmp.projectsDir, 'c1', { mode: 'wizard' });

    const { events, result } = await collect('c1', 'probe the clip');

    // thread.started → session (the codex thread id is the resume token)
    expect(events).toContainEqual({ type: 'session', sessionId: '019e9e67-cf77-7f03-b7b3-bbc49acb57d8' });

    // command_execution → tool start/ok with the SAME capability glyphs Claude turns get
    const toolStart = events.find((e) => e.type === 'tool' && e.status === 'start');
    expect(toolStart).toMatchObject({ type: 'tool', status: 'start', glyph: '⚙', capability: 'ingest/probe' });
    expect(events.some((e) => e.type === 'tool' && e.status === 'ok')).toBe(true);
    // file_change → ✎ row
    expect(events.some((e) => e.type === 'tool' && 'glyph' in e && e.glyph === '✎')).toBe(true);

    // agent_message → text; turn.completed → done carrying the last text
    const text = events.find((e) => e.type === 'text');
    expect(text && 'delta' in text && text.delta).toMatch(/Probed the clip/);
    const done = events.find((e) => e.type === 'done');
    expect(done && 'result' in done && done.result).toMatch(/Probed the clip/);

    // the session persisted for multi-turn continuity, and the TurnResult summarizes the turn
    expect(readSessionId(tmp.projectsDir, 'c1', 'codex')).toBe('019e9e67-cf77-7f03-b7b3-bbc49acb57d8');
    expect(result).toMatchObject({ status: 'done', sessionId: '019e9e67-cf77-7f03-b7b3-bbc49acb57d8' });

    // chat.jsonl: user line + replayable events (session is transient, never replayed)
    const entries = readChat(tmp.projectsDir, 'c1');
    expect(entries[0]).toMatchObject({ t: 'user', text: 'probe the clip' });
    const types = entries.filter((e) => e.t === 'event').map((e) => (e.t === 'event' ? e.e.type : ''));
    expect(types).toContain('tool');
    expect(types).toContain('text');
    expect(types).toContain('done');
    expect(types).not.toContain('session');
  });

  it('classifies turn.failed as a done event carrying the error message', async () => {
    process.env.VIBE_CODEX_BIN = MOCK_CODEX;
    process.env.VIBE_CODEX_SCENARIO = 'fail';
    seedManifest(tmp.projectsDir, 'c2', { mode: 'wizard' });

    const { events, result } = await collect('c2', 'do something');

    const done = events.find((e) => e.type === 'done');
    expect(done && 'result' in done && done.result).toMatch(/codex error: model overloaded/i);
    // a failed turn still resolves (the adapter never throws) and is recorded
    expect(result.status).toBe('done');
    const types = readChat(tmp.projectsDir, 'c2')
      .filter((e) => e.t === 'event')
      .map((e) => (e.t === 'event' ? e.e.type : ''));
    expect(types).toContain('done');
  });

  it('passes `exec resume <thread_id>` on the 2nd turn (multi-turn continuity)', async () => {
    process.env.VIBE_CODEX_BIN = MOCK_CODEX;
    const log = path.join(tmp.dir, 'argv.log');
    process.env.VIBE_MOCK_ARGV_LOG = log;
    seedManifest(tmp.projectsDir, 'c3', { mode: 'wizard' });

    await collect('c3', 'turn one'); // saves the thread id
    await collect('c3', 'turn two'); // should resume it

    const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).not.toContain('resume'); // fresh thread
    expect(lines[1]).toContain('resume 019e9e67-cf77-7f03-b7b3-bbc49acb57d8'); // resumed
  });

  it('cancel kills the in-flight child mid-turn', async () => {
    process.env.VIBE_CODEX_BIN = MOCK_CODEX;
    process.env.VIBE_CODEX_SCENARIO = 'sleep';
    process.env.VIBE_MOCK_SLEEP_MS = '60000'; // long enough that only the cancel ends it
    seedManifest(tmp.projectsDir, 'c4', { mode: 'wizard' });

    const events: AgentEvent[] = [];
    const turn = runCodexTurn({
      projectDir: tmp.dir,
      project: 'c4',
      prompt: 'slow please',
      onEvent: (e) => events.push(e),
    });

    // wait until the turn is actually running, then cancel it.
    const deadline = Date.now() + 5_000;
    while (!isCodexBusy('c4') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    expect(isCodexBusy('c4')).toBe(true);
    cancelCodexTurn('c4');

    // the killed child closes → the turn resolves (well under the 60s sleep) and is no longer busy.
    const result = await turn;
    expect(result.status).toBe('done'); // adapter resolves on close even when killed
    expect(isCodexBusy('c4')).toBe(false);
    // the slow scenario never emitted turn.completed, so the safety-net `done` (from close) carries
    // whatever text streamed — the key contract is that we DIDN'T wait the full sleep.
  }, 15_000);

  it('degrades to an offline event when the codex bin is not found', async () => {
    process.env.VIBE_CODEX_BIN = path.join(tmp.dir, 'no-such-codex.exe');
    seedManifest(tmp.projectsDir, 'c5', { mode: 'wizard' });

    const { events, result } = await collect('c5', 'hello');

    expect(events).toContainEqual({ type: 'offline', reason: expect.stringMatching(/codex login|install/i) });
    expect(result.status).toBe('offline');
  });
});
