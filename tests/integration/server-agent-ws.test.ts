/**
 * server-agent-ws.test.ts — the bidirectional /ws/agent channel (index.ts handleAgentMessage →
 * agent-bridge → AgentRunner). Boots a REAL socket via startServer({port:0}) and drives the mock
 * agent. Locks: a {type:'user'} turn streams session + text + done, persists chat.jsonl, a 2nd turn
 * passes --resume, and a {type:'cancel'} message doesn't crash.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { WebSocket as WsClient, type MessageEvent as WsMessageEvent } from 'ws';
import { startServer } from '../../src/server/index.js';
import { isAgentBusy } from '../../src/agent/runner.js';
import type { AgentEvent } from '../../src/agent/events.js';
import { makeTempVibeProject, MOCK_AGENT, type TempVibeProject } from '../helpers/temp-vibe-project.js';

// Node 20 has no global WebSocket (it landed in Node 21) — use the `ws` client, whose
// addEventListener/MessageEvent surface matches the WHATWG API this test drives.
const WebSocketImpl = (globalThis.WebSocket ?? WsClient) as unknown as typeof WsClient;

let app: FastifyInstance;
let port: number;
let tmp: TempVibeProject;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  tmp = makeTempVibeProject();
  tmp.useClaudeAgent(); // agent:'claude' → VIBE_AGENT_BIN drives the turn through the mock
  for (const k of ['VIBE_AGENT_BIN', 'VIBE_MOCK_ARGV_LOG', 'VIBE_MOCK_COMPLETE_STAGE', 'VIBE_MOCK_SLEEP_MS'])
    saved[k] = process.env[k];
  process.env.VIBE_AGENT_BIN = MOCK_AGENT;
  ({ app, port } = await startServer({ port: 0 }));
});
afterEach(async () => {
  await app.close();
  tmp.cleanup();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** Open a /ws/agent socket, send the message, collect events until `done` (or timeout). */
function runTurn(
  message: Record<string, unknown>,
  timeoutMs = 10_000,
): Promise<{ events: AgentEvent[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocketImpl(`ws://127.0.0.1:${port}/ws/agent`);
    const events: AgentEvent[] = [];
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      reject(new Error(`ws turn timed out after ${timeoutMs}ms (events: ${events.map((e) => e.type).join(',')})`));
    }, timeoutMs);

    ws.addEventListener('open', () => ws.send(JSON.stringify(message)));
    ws.addEventListener('message', (ev: WsMessageEvent) => {
      const data = typeof ev.data === 'string' ? ev.data : String(ev.data);
      let e: AgentEvent;
      try {
        e = JSON.parse(data) as AgentEvent;
      } catch {
        return;
      }
      events.push(e);
      if (e.type === 'done' || e.type === 'offline') {
        clearTimeout(timer);
        ws.close();
        resolve({ events });
      }
    });
    ws.addEventListener('error', () => {
      // surfaced via the timeout if no events ever arrive
    });
  });
}

describe('/ws/agent', () => {
  it('streams session + text + done and persists chat.jsonl', async () => {
    tmp.seedManifest('p1', { mode: 'wizard', running: ['ingest'] });

    const { events } = await runTurn({ type: 'user', project: 'p1', text: 'hello' });

    expect(events.some((e) => e.type === 'session')).toBe(true);
    expect(events.some((e) => e.type === 'text')).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(true);

    // chat.jsonl has the user line + replayable events
    const chatPath = path.join(tmp.projectsDir, 'p1', 'chat.jsonl');
    const lines = fs.readFileSync(chatPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.some((e) => e.t === 'user' && e.text === 'hello')).toBe(true);
    expect(lines.some((e) => e.t === 'event' && e.e.type === 'text')).toBe(true);
  });

  it('passes --resume on the second turn', async () => {
    const log = path.join(tmp.dir, 'argv.log');
    process.env.VIBE_MOCK_ARGV_LOG = log;
    tmp.seedManifest('p2', { mode: 'wizard', running: ['ingest'] });

    await runTurn({ type: 'user', project: 'p2', text: 'turn one' });
    await runTurn({ type: 'user', project: 'p2', text: 'turn two' });

    const logged = fs.readFileSync(log, 'utf8');
    expect(logged).toContain('--resume');
  });

  it('a cancel message does not crash the socket', async () => {
    tmp.seedManifest('p3', { mode: 'wizard' });
    // cancel with no in-flight turn is a no-op; the socket should stay healthy enough to then run.
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocketImpl(`ws://127.0.0.1:${port}/ws/agent`);
      const timer = setTimeout(() => reject(new Error('cancel turn timed out')), 8_000);
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ type: 'cancel', project: 'p3' }));
        // then a real turn proves the server is still alive
        ws.send(JSON.stringify({ type: 'user', project: 'p3', text: 'after cancel' }));
      });
      ws.addEventListener('message', (ev: WsMessageEvent) => {
        const e = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)) as AgentEvent;
        if (e.type === 'done' || e.type === 'offline') {
          clearTimeout(timer);
          ws.close();
          resolve();
        }
      });
    });
  });

  it('cancels an ACTIVE turn → child terminated, done lands, composer can start a new turn', async () => {
    process.env.VIBE_MOCK_SLEEP_MS = '60000'; // the slow turn hangs until cancel kills the child
    tmp.seedManifest('p4', { mode: 'wizard' });

    const events: AgentEvent[] = [];
    const ws = new WebSocketImpl(`ws://127.0.0.1:${port}/ws/agent`);
    const opened = new Promise<void>((res) => ws.addEventListener('open', () => res()));
    ws.addEventListener('message', (ev: WsMessageEvent) => {
      try {
        events.push(JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)) as AgentEvent);
      } catch {
        /* ignore non-JSON */
      }
    });
    await opened;
    ws.send(JSON.stringify({ type: 'user', project: 'p4', text: 'do the slow thing' }));

    // wait until the server-side adapter actually has the turn in flight, then cancel it.
    const deadline = Date.now() + 6_000;
    while (!isAgentBusy('p4') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
    expect(isAgentBusy('p4')).toBe(true);
    ws.send(JSON.stringify({ type: 'cancel', project: 'p4' }));

    // the killed child closes → a `done` is emitted (well under the 60s sleep) and the turn ends.
    const doneBy = Date.now() + 8_000;
    while (!events.some((e) => e.type === 'done') && Date.now() < doneBy) await new Promise((r) => setTimeout(r, 25));
    expect(events.some((e) => e.type === 'done')).toBe(true);
    expect(isAgentBusy('p4')).toBe(false); // no longer busy → composer can start a new turn

    // a cancelled turn persists its `done` to chat.jsonl (replayable, not lost)
    const chatPath = path.join(tmp.projectsDir, 'p4', 'chat.jsonl');
    const lines = fs.readFileSync(chatPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.some((e) => e.t === 'event' && e.e.type === 'done')).toBe(true);

    // composer recovers: a NORMAL (fast) turn on the same project runs to completion.
    delete process.env.VIBE_MOCK_SLEEP_MS;
    const second = await runTurn({ type: 'user', project: 'p4', text: 'recover' });
    expect(second.events.some((e) => e.type === 'done')).toBe(true);

    ws.close();
  }, 25_000);

  it('a second WS connection after a turn sees the chat replay intact', async () => {
    tmp.seedManifest('p5', { mode: 'wizard', running: ['ingest'] });

    // first connection: run a full turn (persisted to chat.jsonl)
    const first = await runTurn({ type: 'user', project: 'p5', text: 'first turn' });
    expect(first.events.some((e) => e.type === 'done')).toBe(true);

    // `done` is forwarded the instant the adapter parses the result line — the child process
    // closes (and inflight clears) a tick later. Settle before asserting busy:false.
    const settle = Date.now() + 3_000;
    while (isAgentBusy('p5') && Date.now() < settle) await new Promise((r) => setTimeout(r, 25));

    // a NEW socket connecting later is the "reconnect" — the durable transcript is the replay
    // source (the cockpit reads it via GET /api/projects/:id/chat; the WS channel is for new turns).
    const replay = await app.inject({ method: 'GET', url: '/api/projects/p5/chat' });
    expect(replay.statusCode).toBe(200);
    const body = replay.json() as { busy: boolean; entries: Array<{ t: string; text?: string; e?: AgentEvent }> };
    expect(body.busy).toBe(false); // the turn finished
    expect(body.entries.some((e) => e.t === 'user' && e.text === 'first turn')).toBe(true);
    expect(body.entries.some((e) => e.t === 'event' && e.e?.type === 'done')).toBe(true);

    // and the reconnected socket can run another turn that ALSO lands in the same transcript
    const second = await runTurn({ type: 'user', project: 'p5', text: 'second turn' });
    expect(second.events.some((e) => e.type === 'done')).toBe(true);
    const after = (await app.inject({ method: 'GET', url: '/api/projects/p5/chat' })).json() as {
      entries: Array<{ t: string; text?: string }>;
    };
    expect(after.entries.filter((e) => e.t === 'user').map((e) => e.text)).toEqual(['first turn', 'second turn']);
  });
});
