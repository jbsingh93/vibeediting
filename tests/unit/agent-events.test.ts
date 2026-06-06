import { describe, it, expect, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  parseAgentLine,
  classifyTool,
  eventsFromLine,
  parseQuestions,
  type PendingToolMap,
  type AgentEvent,
} from '../../src/agent/events.js';
import { resolveClaudeBin } from '../../src/agent/claude-adapter.js';

describe('parseAgentLine', () => {
  it('parses a JSON object line', () => {
    expect(parseAgentLine('{"type":"result","result":"ok"}')).toEqual({ type: 'result', result: 'ok' });
  });
  it('returns null for blank / whitespace', () => {
    expect(parseAgentLine('')).toBeNull();
    expect(parseAgentLine('   ')).toBeNull();
  });
  it('returns null for garbage', () => {
    expect(parseAgentLine('not json')).toBeNull();
  });
});

describe('classifyTool (tool_use → glyph + capability)', () => {
  it('maps a Bash capability CLI to its folder glyph + verb', () => {
    const c = classifyTool('Bash', {
      command: 'npx --no-install tsx capabilities/color/grade.ts --in a.mp4 --lut warm-cine',
    });
    expect(c.glyph).toBe('🎨');
    expect(c.capability).toBe('color/grade');
    expect(c.detail).toContain('grade');
  });
  it('maps ingest + perception + motion folders', () => {
    expect(classifyTool('Bash', { command: 'tsx capabilities/ingest/transcribe.ts --in x' }).glyph).toBe('⚙');
    expect(classifyTool('Bash', { command: 'tsx capabilities/perception/gemini-council.ts' }).glyph).toBe('👁');
    expect(classifyTool('Bash', { command: 'tsx capabilities/motion/render.ts' }).glyph).toBe('🎬');
  });
  it('flags paid generation folders with the 💲 glyph', () => {
    expect(classifyTool('Bash', { command: 'tsx capabilities/generate/thumbnail.ts' }).glyph).toBe('💲');
    expect(classifyTool('Bash', { command: 'tsx capabilities/vfx/generate/runway.ts' }).glyph).toBe('💲');
  });
  it('maps npx remotion to the motion glyph', () => {
    expect(classifyTool('Bash', { command: 'npx remotion render Foo out.mp4' }).glyph).toBe('🎬');
  });
  it('maps Write/Edit to ✎ + basename, Read/Grep to 🔍, Task and mcp', () => {
    expect(classifyTool('Write', { file_path: '/a/b/captions.json' })).toMatchObject({
      glyph: '✎',
      detail: 'captions.json',
    });
    expect(classifyTool('Edit', { file_path: 'C:/x/timeline.ts' }).glyph).toBe('✎');
    expect(classifyTool('Read', { file_path: '/x/y.ts' }).glyph).toBe('🔍');
    expect(classifyTool('Task', undefined).glyph).toBe('⛓');
    expect(classifyTool('mcp__playwright__navigate', undefined).glyph).toBe('🔌');
  });
});

describe('parseQuestions (AskUserQuestion bridge)', () => {
  it('parses a well-formed payload', () => {
    const q = parseQuestions({
      questions: [
        {
          question: 'Which format?',
          header: 'Format',
          multiSelect: false,
          options: [{ label: '9:16' }, { label: '16:9', description: 'wide' }],
        },
      ],
    });
    expect(q).toHaveLength(1);
    expect(q![0]).toMatchObject({ question: 'Which format?', header: 'Format', multiSelect: false });
    expect(q![0]!.options).toHaveLength(2);
  });
  it('returns null for empty/garbage payloads', () => {
    expect(parseQuestions(undefined)).toBeNull();
    expect(parseQuestions({})).toBeNull();
    expect(parseQuestions({ questions: [] })).toBeNull();
    expect(parseQuestions({ questions: [{ nope: true }] })).toBeNull();
  });
});

describe('eventsFromLine', () => {
  const pending = (): PendingToolMap => new Map();

  it('system/init → a session event', () => {
    const evs = eventsFromLine({ type: 'system', subtype: 'init', session_id: 'sid-1' }, pending());
    expect(evs).toEqual([{ type: 'session', sessionId: 'sid-1' }]);
  });

  it('assistant text → text event; tool_use → tool start and is remembered', () => {
    const map = pending();
    const evs = eventsFromLine(
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Hi' },
            { type: 'tool_use', id: 'tu_9', name: 'Bash', input: { command: 'tsx capabilities/color/grade.ts' } },
          ],
        },
      },
      map,
    );
    expect(evs[0]).toEqual({ type: 'text', delta: 'Hi' });
    const tool = evs[1] as Extract<AgentEvent, { type: 'tool' }>;
    expect(tool).toMatchObject({
      type: 'tool',
      id: 'tu_9',
      name: 'Bash',
      status: 'start',
      glyph: '🎨',
      capability: 'color/grade',
    });
    expect(map.get('tu_9')?.glyph).toBe('🎨');
  });

  it('tool_result resolves the remembered row by id (ok / error)', () => {
    const map = pending();
    eventsFromLine(
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'tu_1', name: 'Bash', input: { command: 'tsx capabilities/ingest/x.ts' } }],
        },
      },
      map,
    );
    const ok = eventsFromLine(
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu_1', is_error: false }] } },
      map,
    );
    expect(ok[0]).toMatchObject({ type: 'tool', id: 'tu_1', status: 'ok', glyph: '⚙', capability: 'ingest/x' });
    expect(map.has('tu_1')).toBe(false); // consumed

    const map2 = pending();
    eventsFromLine(
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'tu_2', name: 'Bash', input: { command: 'tsx capabilities/audio/x.ts' } }],
        },
      },
      map2,
    );
    const err = eventsFromLine(
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu_2', is_error: true }] } },
      map2,
    );
    expect(err[0]).toMatchObject({ status: 'error' });
  });

  it('AskUserQuestion → question card; its expected headless error result is swallowed', () => {
    const map = pending();
    const ask = eventsFromLine(
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tu_q',
              name: 'AskUserQuestion',
              input: { questions: [{ question: 'Style?', options: [{ label: 'A' }, { label: 'B' }] }] },
            },
          ],
        },
      },
      map,
    );
    expect(ask[0]).toMatchObject({ type: 'question', id: 'tu_q' });
    // the EXPECTED error result is swallowed — no tool row appears
    const res = eventsFromLine(
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu_q', is_error: true }] } },
      map,
    );
    expect(res).toEqual([]);
    expect(map.has('tu_q')).toBe(false);
  });

  it('result → session + done with cost/turns (and the older cost_usd field)', () => {
    const evs = eventsFromLine(
      { type: 'result', session_id: 'sid-2', result: 'done', total_cost_usd: 0, num_turns: 3 },
      pending(),
    );
    expect(evs).toContainEqual({ type: 'session', sessionId: 'sid-2' });
    expect(evs).toContainEqual({ type: 'done', result: 'done', costUsd: 0, numTurns: 3 });

    const old = eventsFromLine({ type: 'result', result: 'x', cost_usd: 0.5 }, pending());
    const done = old.find((e) => e.type === 'done') as Extract<AgentEvent, { type: 'done' }>;
    expect(done.costUsd).toBe(0.5);
  });
});

describe('resolveClaudeBin (VIBE_AGENT_BIN seam / offline detection)', () => {
  const prev = process.env.VIBE_AGENT_BIN;
  afterEach(() => {
    if (prev === undefined) delete process.env.VIBE_AGENT_BIN;
    else process.env.VIBE_AGENT_BIN = prev;
  });

  it('returns null when VIBE_AGENT_BIN points at a missing file (→ offline)', () => {
    process.env.VIBE_AGENT_BIN = 'C:/definitely/not/here/claude.exe';
    expect(resolveClaudeBin()).toBeNull();
  });

  it('returns the override when it exists', () => {
    const p = fileURLToPath(import.meta.url); // this very test file exists
    process.env.VIBE_AGENT_BIN = p;
    expect(resolveClaudeBin()).toBe(p);
  });
});
