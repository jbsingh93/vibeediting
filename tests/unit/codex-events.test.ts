/**
 * CodexAdapter event mapping — fixtures are VERBATIM captures from the R1 spike
 * (codex-cli 0.137.0, 2026-06-06; see DEV-DOCS/notes/R1-codex.md).
 */
import { describe, it, expect } from 'vitest';
import { eventsFromCodexLine } from '../../src/agent/codex-adapter.js';
import type { AgentEvent } from '../../src/agent/events.js';

const lt = () => ({ value: '' });

describe('eventsFromCodexLine (codex JSONL → AgentEvent)', () => {
  it('thread.started → session', () => {
    const evs = eventsFromCodexLine(
      { type: 'thread.started', thread_id: '019e9e67-cf77-7f03-b7b3-bbc49acb57d8' },
      lt(),
    );
    expect(evs).toEqual([{ type: 'session', sessionId: '019e9e67-cf77-7f03-b7b3-bbc49acb57d8' }]);
  });

  it('agent_message item.completed → text, and turn.completed carries it as the done result', () => {
    const last = lt();
    const text = eventsFromCodexLine(
      { type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'pong' } },
      last,
    );
    expect(text).toEqual([{ type: 'text', delta: 'pong' }]);
    const done = eventsFromCodexLine(
      {
        type: 'turn.completed',
        usage: { input_tokens: 10217, cached_input_tokens: 2432, output_tokens: 5 },
      },
      last,
    );
    expect(done).toEqual([{ type: 'done', result: 'pong' }]);
  });

  it('command_execution start/completed → tool start/ok with capability classification', () => {
    const last = lt();
    const start = eventsFromCodexLine(
      {
        type: 'item.started',
        item: {
          id: 'item_1',
          type: 'command_execution',
          command: 'tsx capabilities/ingest/probe.ts --in clip.mp4',
          aggregated_output: '',
          exit_code: null,
          status: 'in_progress',
        },
      },
      last,
    );
    expect(start[0]).toMatchObject({ type: 'tool', id: 'item_1', status: 'start', glyph: '⚙', capability: 'ingest/probe' });

    const okEvs = eventsFromCodexLine(
      {
        type: 'item.completed',
        item: { id: 'item_1', type: 'command_execution', command: 'tsx capabilities/ingest/probe.ts --in clip.mp4', exit_code: 0, status: 'completed' },
      },
      last,
    );
    expect(okEvs[0]).toMatchObject({ type: 'tool', id: 'item_1', status: 'ok' });

    const errEvs = eventsFromCodexLine(
      { type: 'item.completed', item: { id: 'item_2', type: 'command_execution', command: 'whatever', exit_code: 1, status: 'failed' } },
      last,
    );
    expect(errEvs[0]).toMatchObject({ type: 'tool', id: 'item_2', status: 'error' });
  });

  it('file_change → ✎ tool rows (verbatim spike capture)', () => {
    const last = lt();
    const evs = eventsFromCodexLine(
      {
        type: 'item.completed',
        item: {
          id: 'item_1',
          type: 'file_change',
          changes: [{ path: 'C:\\Users\\u\\AppData\\Local\\Temp\\vibe-r1-spike\\hello.txt', kind: 'add' }],
          status: 'completed',
        },
      },
      last,
    );
    expect(evs[0]).toMatchObject({ type: 'tool', status: 'ok', glyph: '✎', detail: 'hello.txt' });
  });

  it('turn.failed → done carrying the error', () => {
    const evs = eventsFromCodexLine({ type: 'turn.failed', error: { message: 'boom' } }, lt());
    const done = evs[0] as Extract<AgentEvent, { type: 'done' }>;
    expect(done.type).toBe('done');
    expect(done.result).toContain('boom');
  });

  it('ignores unknown event types', () => {
    expect(eventsFromCodexLine({ type: 'turn.started' }, lt())).toEqual([]);
    expect(eventsFromCodexLine({ type: 'something.else' }, lt())).toEqual([]);
  });
});
