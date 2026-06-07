/**
 * Ported from the parent p6-pure.test.ts agent-activity-indicator + persistent-chat folding.
 * Only the PURE client functions are exercised (currentActivity / isRenderActivity / foldChat);
 * the WS hook, NDJSON persistence (appendChat/readChat) and event parsing are server-side and
 * owned by tests/unit.
 */
import { describe, it, expect } from 'vitest';
import { currentActivity, isRenderActivity, foldChat, type FeedItem } from '../agent';
import type { ChatEntry } from '../types';

describe('agent activity indicator', () => {
  const act = (status: 'start' | 'ok', capability?: string, label = 'x'): FeedItem => ({
    kind: 'activity',
    id: Math.random(),
    toolId: 't',
    glyph: '⚙',
    label,
    capability,
    status,
  });
  it('currentActivity = the newest still-running row; null when everything landed', () => {
    expect(currentActivity([act('ok', 'ingest/probe'), act('start', 'deliver/render-preset')])).toBe('deliver/render-preset');
    expect(currentActivity([act('ok', 'ingest/probe')])).toBeNull();
    expect(currentActivity([])).toBeNull();
  });
  it('isRenderActivity flags renders/encodes only', () => {
    expect(isRenderActivity('deliver/render-preset')).toBe(true);
    expect(isRenderActivity('remotion')).toBe(true);
    expect(isRenderActivity('npx remotion render YtIntro out/x.mp4')).toBe(true);
    expect(isRenderActivity('ingest/transcribe')).toBe(false);
    expect(isRenderActivity(null)).toBe(false);
  });
});

describe('foldChat (UIP6.14)', () => {
  it('rebuilds the live feed: text coalesces, tool results update rows, user answers questions', () => {
    const entries: ChatEntry[] = [
      { ts: '1', t: 'user', text: 'lav en intro' },
      { ts: '2', t: 'event', e: { type: 'text', delta: 'Planlægger' } },
      { ts: '3', t: 'event', e: { type: 'text', delta: ' …' } },
      { ts: '4', t: 'event', e: { type: 'tool', id: 'tu1', name: 'Bash', status: 'start', capability: 'ingest/transcribe', glyph: '⚙', detail: 'transcribe' } },
      { ts: '5', t: 'event', e: { type: 'tool', id: 'tu1', name: 'Bash', status: 'ok' } },
      { ts: '6', t: 'event', e: { type: 'question', id: 'q1', questions: [{ question: 'Stil?', options: [{ label: 'A' }] }] } },
      { ts: '7', t: 'user', text: 'My answers:\n- Stil: A' },
      { ts: '8', t: 'event', e: { type: 'text', delta: 'Tak — kører.' } },
      { ts: '9', t: 'event', e: { type: 'done', result: 'x' } },
    ];
    const feed = foldChat(entries);
    expect(feed.map((f) => f.kind)).toEqual(['user', 'assistant', 'activity', 'question', 'user', 'assistant']);
    const assistant = feed[1]!;
    if (assistant.kind === 'assistant') expect(assistant.text).toBe('Planlægger …');
    const row = feed[2]!;
    if (row.kind === 'activity') expect(row.status).toBe('ok');
    const q = feed[3]!;
    if (q.kind === 'question') expect(q.answered).toBe(true); // the later user reply answered it
    // ids are unique and ascending
    expect(new Set(feed.map((f) => f.id)).size).toBe(feed.length);
  });
});
