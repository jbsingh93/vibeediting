/**
 * agent-bridge.test.ts — the agent-feed watcher registry (VT.4 F18). Server-started turns (distill /
 * Save-as-Template) have no initiating /ws/agent socket, so their events must be broadcast to the
 * sockets that announced they're VIEWING the project — otherwise the "watch the agent feed" hint
 * shows nothing until a reload.
 */
import { describe, it, expect } from 'vitest';
import type { AgentEvent } from '../../src/agent/events.js';
import { registerAgentWatcher, unregisterAgentWatcher, broadcastAgentEvent } from '../../src/server/agent-bridge.js';

function sink() {
  const got: AgentEvent[] = [];
  return { fn: (e: AgentEvent) => got.push(e), got };
}

describe('agent-feed watcher registry (F18)', () => {
  it('broadcasts to every socket watching the project', () => {
    const a = sink();
    const b = sink();
    registerAgentWatcher('p1', a.fn);
    registerAgentWatcher('p1', b.fn);
    broadcastAgentEvent('p1', { type: 'text', delta: 'hi' });
    expect(a.got).toEqual([{ type: 'text', delta: 'hi' }]);
    expect(b.got).toEqual([{ type: 'text', delta: 'hi' }]);
    unregisterAgentWatcher('p1', a.fn);
    unregisterAgentWatcher('p1', b.fn);
  });

  it('never leaks one project\'s turn into another project\'s feed', () => {
    const p1 = sink();
    const p2 = sink();
    registerAgentWatcher('p1', p1.fn);
    registerAgentWatcher('p2', p2.fn);
    broadcastAgentEvent('p1', { type: 'done', result: 'p1 only' });
    expect(p1.got).toHaveLength(1);
    expect(p2.got).toHaveLength(0);
    unregisterAgentWatcher('p1', p1.fn);
    unregisterAgentWatcher('p2', p2.fn);
  });

  it('stops sending after unregister (socket closed)', () => {
    const a = sink();
    registerAgentWatcher('p3', a.fn);
    unregisterAgentWatcher('p3', a.fn);
    broadcastAgentEvent('p3', { type: 'text', delta: 'gone' });
    expect(a.got).toHaveLength(0);
  });

  it('a throwing watcher never breaks the broadcast to the others', () => {
    const bad = (): void => {
      throw new Error('socket gone');
    };
    const good = sink();
    registerAgentWatcher('p4', bad);
    registerAgentWatcher('p4', good.fn);
    expect(() => broadcastAgentEvent('p4', { type: 'text', delta: 'x' })).not.toThrow();
    expect(good.got).toHaveLength(1);
    unregisterAgentWatcher('p4', bad);
    unregisterAgentWatcher('p4', good.fn);
  });

  it('broadcast to a project with no watchers is a no-op', () => {
    expect(() => broadcastAgentEvent('nobody', { type: 'done', result: 'x' })).not.toThrow();
  });
});
