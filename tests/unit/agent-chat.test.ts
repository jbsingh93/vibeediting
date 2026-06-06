import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  appendChat,
  readChat,
  readSessionId,
  saveSessionId,
  shouldPersistEvent,
} from '../../src/agent/chat.js';
import { cockpitReminder, readCockpitState } from '../../src/agent/cockpit.js';
import { makeTempProject, seedManifest, type TempProject } from '../helpers/temp-project.js';

let tmp: TempProject;
beforeEach(() => {
  tmp = makeTempProject();
});
afterEach(() => {
  tmp.cleanup();
});

describe('chat.jsonl persistence', () => {
  it('appends user + event entries and replays them in order', () => {
    appendChat(tmp.projectsDir, 'p1', { t: 'user', text: 'hello' });
    appendChat(tmp.projectsDir, 'p1', { t: 'event', e: { type: 'text', delta: 'hi back' } });
    const entries = readChat(tmp.projectsDir, 'p1');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ t: 'user', text: 'hello' });
    expect(entries[1]).toMatchObject({ t: 'event', e: { type: 'text', delta: 'hi back' } });
    expect(typeof entries[0]!.ts).toBe('string');
  });

  it('skips corrupt lines (NDJSON discipline) and honors the limit', () => {
    appendChat(tmp.projectsDir, 'p2', { t: 'user', text: 'one' });
    fs.appendFileSync(path.join(tmp.projectsDir, 'p2', 'chat.jsonl'), 'GARBAGE LINE\n');
    appendChat(tmp.projectsDir, 'p2', { t: 'user', text: 'two' });
    expect(readChat(tmp.projectsDir, 'p2')).toHaveLength(2);
    expect(readChat(tmp.projectsDir, 'p2', 1)).toHaveLength(1);
  });

  it('returns [] for a project with no transcript', () => {
    expect(readChat(tmp.projectsDir, 'nope')).toEqual([]);
  });

  it('shouldPersistEvent keeps history events, drops transient ones', () => {
    expect(shouldPersistEvent({ type: 'text', delta: 'x' })).toBe(true);
    expect(shouldPersistEvent({ type: 'done', result: '' })).toBe(true);
    expect(shouldPersistEvent({ type: 'session', sessionId: 's' })).toBe(false);
    expect(shouldPersistEvent({ type: 'offline', reason: 'r' })).toBe(false);
  });
});

describe('session sidecar (projects/<p>/agent.json)', () => {
  it('round-trips a session id', () => {
    expect(readSessionId(tmp.projectsDir, 'p1')).toBeNull();
    saveSessionId(tmp.projectsDir, 'p1', 'sid-123');
    expect(readSessionId(tmp.projectsDir, 'p1')).toBe('sid-123');
  });

  it('returns null for malformed sidecars', () => {
    const dir = path.join(tmp.projectsDir, 'p3');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'agent.json'), '{not json');
    expect(readSessionId(tmp.projectsDir, 'p3')).toBeNull();
  });
});

describe('cockpit contract', () => {
  it('reminder lists exactly what is missing; null when compliant', () => {
    const all = cockpitReminder('p', { briefMissing: true, planMissing: true, stagesMissing: true });
    expect(all).toContain('brief.md');
    expect(all).toContain('manifest.notes');
    expect(all).toContain('record stages');
    const none = cockpitReminder('p', { briefMissing: false, planMissing: false, stagesMissing: false });
    expect(none).toBeNull();
    const one = cockpitReminder('p', { briefMissing: true, planMissing: false, stagesMissing: false });
    expect(one).toContain('brief.md');
    expect(one).not.toContain('record stages');
  });

  it('readCockpitState: null for wizard projects / missing manifests, state for agent-mode', () => {
    expect(readCockpitState(tmp.projectsDir, 'absent')).toBeNull();
    seedManifest(tmp.projectsDir, 'wiz', { mode: 'wizard' });
    expect(readCockpitState(tmp.projectsDir, 'wiz')).toBeNull();

    seedManifest(tmp.projectsDir, 'ag', { mode: 'agent', notes: 'Agent-mode project — brief comes from the chat.' });
    const state = readCockpitState(tmp.projectsDir, 'ag');
    expect(state).toEqual({ briefMissing: true, planMissing: true, stagesMissing: true });
  });

  it('readCockpitState reflects compliance (brief + notes + stages present)', () => {
    seedManifest(tmp.projectsDir, 'ok', {
      mode: 'agent',
      notes: '# Plan\n3 scenes · 24.0s',
      stages: { ingest: { status: 'complete' } },
    });
    fs.writeFileSync(path.join(tmp.projectsDir, 'ok', 'brief.md'), '# Brief\nA real brief.');
    expect(readCockpitState(tmp.projectsDir, 'ok')).toEqual({
      briefMissing: false,
      planMissing: false,
      stagesMissing: false,
    });
  });

  it('a malformed manifest never blocks the chat (returns null)', () => {
    const dir = path.join(tmp.projectsDir, 'bad');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'manifest.json'), '{broken');
    expect(readCockpitState(tmp.projectsDir, 'bad')).toBeNull();
  });
});
