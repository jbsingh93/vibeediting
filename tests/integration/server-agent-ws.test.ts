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
  for (const k of ['VIBE_AGENT_BIN', 'VIBE_MOCK_ARGV_LOG', 'VIBE_MOCK_COMPLETE_STAGE']) saved[k] = process.env[k];
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
});
