/**
 * lib/agent.ts — the browser side of the native-`claude` agent bridge (D9 / doc 15).
 *
 * Opens a dedicated, bidirectional WebSocket to /ws/agent for one project: the UI sends user text +
 * pre-baked intents; the server streams AgentEvents (text bubbles, tool activity rows, session id,
 * done, offline). We fold those into a single ordered `feed` the middle panel renders — chat bubbles
 * interleaved with the "watch it work" activity stream (doc 11 §2). Degrades to an offline banner when
 * `claude` isn't logged in; every GUI-only action still works.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { ASSETS_RELOAD_EVENT } from './upload';
import type { AgentEvent, AgentQuestion, ChatEntry } from './types';

export type FeedItem =
  | { kind: 'user'; id: number; text: string }
  | { kind: 'assistant'; id: number; text: string }
  | { kind: 'activity'; id: number; toolId: string; glyph: string; label: string; capability?: string; status: 'start' | 'ok' | 'error' }
  | { kind: 'question'; id: number; toolId: string; questions: AgentQuestion[]; answered: boolean } // UIP6.11
  | { kind: 'system'; id: number; text: string };

export interface AgentState {
  feed: FeedItem[];
  working: boolean;
  offline: boolean;
  offlineReason: string | null;
  sessionId: string | null;
  lastCostUsd: number | null;
  connected: boolean;
}

export interface AgentApi extends AgentState {
  send: (text: string) => void;
  approvePlan: () => void;
  requestChanges: (text: string) => void;
  explainActivity: (row: string) => void;
  /** UIP6.11 — answer an AskUserQuestion card: marks it answered + sends the reply as a turn. */
  answerQuestion: (itemId: number, text: string) => void;
  cancel: () => void;
}

function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws/agent`;
}

// UIP6.12 — the agent generates artifacts (VO/music/SFX/graphics) with its OWN Bash/Write tools,
// which the UI's job runner never sees. Nudge the asset grid (debounced) whenever such a tool
// lands, and once more when the turn ends — the Assets panel stays honest while the agent works.
let assetsNudge: ReturnType<typeof setTimeout> | null = null;
function nudgeAssetsReload(): void {
  if (assetsNudge) clearTimeout(assetsNudge);
  assetsNudge = setTimeout(() => {
    assetsNudge = null;
    window.dispatchEvent(new CustomEvent(ASSETS_RELOAD_EVENT));
  }, 800);
}
const ARTIFACT_TOOLS = new Set(['Bash', 'Write', 'Edit', 'MultiEdit']);

/** UIP6.13 — the agent's in-flight activity (the newest still-running row), for the progress
 *  strip's "what is it doing right now" indicator. Pure → unit-tested. */
export function currentActivity(feed: FeedItem[]): string | null {
  for (let i = feed.length - 1; i >= 0; i--) {
    const it = feed[i];
    if (it && it.kind === 'activity' && it.status === 'start') return it.capability ?? it.label;
  }
  return null;
}

/** Does an activity look like a render/encode (the long ones worth calling out)? Pure. */
export function isRenderActivity(activity: string | null): boolean {
  return !!activity && /render|remotion|deliver\/|loudnorm|ffmpeg/i.test(activity);
}

/**
 * UIP6.14 — fold a persisted transcript (projects/<p>/chat.jsonl) back into the feed the panel
 * renders. Mirrors apply()'s live folding: text deltas coalesce into the last assistant bubble,
 * tool results update their start rows, a user entry marks earlier question cards answered.
 * Pure → unit-tested.
 */
export function foldChat(entries: ChatEntry[]): FeedItem[] {
  const feed: FeedItem[] = [];
  let id = 0;
  for (const en of entries) {
    if (en.t === 'user') {
      for (const it of feed) if (it.kind === 'question') it.answered = true;
      feed.push({ kind: 'user', id: ++id, text: en.text });
      continue;
    }
    const e = en.e;
    if (!e || typeof e !== 'object') continue;
    switch (e.type) {
      case 'text': {
        const last = feed[feed.length - 1];
        if (last && last.kind === 'assistant') last.text += e.delta;
        else feed.push({ kind: 'assistant', id: ++id, text: e.delta });
        break;
      }
      case 'tool': {
        if (e.status === 'start') {
          feed.push({
            kind: 'activity',
            id: ++id,
            toolId: e.id,
            glyph: e.glyph ?? '·',
            label: e.detail ?? e.name ?? e.capability ?? 'working',
            capability: e.capability,
            status: 'start',
          });
        } else {
          for (let i = feed.length - 1; i >= 0; i--) {
            const it = feed[i];
            if (it && it.kind === 'activity' && it.toolId === e.id && it.status === 'start') {
              it.status = e.status;
              break;
            }
          }
        }
        break;
      }
      case 'question':
        feed.push({ kind: 'question', id: ++id, toolId: e.id, questions: e.questions, answered: false });
        break;
      default:
        break; // done — no feed item; session/offline are never persisted
    }
  }
  return feed;
}

export function useAgent(project: string): AgentApi {
  const [state, setState] = useState<AgentState>({
    feed: [],
    working: false,
    offline: false,
    offlineReason: null,
    sessionId: null,
    lastCostUsd: null,
    connected: false,
  });
  const socketRef = useRef<WebSocket | null>(null);
  const idRef = useRef(0);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);
  const nextId = () => ++idRef.current;

  const apply = useCallback((evt: AgentEvent) => {
    setState((prev) => {
      const feed = prev.feed.slice();
      switch (evt.type) {
        case 'text': {
          const last = feed[feed.length - 1];
          if (last && last.kind === 'assistant') feed[feed.length - 1] = { ...last, text: last.text + evt.delta };
          else feed.push({ kind: 'assistant', id: nextId(), text: evt.delta });
          return { ...prev, feed };
        }
        case 'tool': {
          if (evt.status === 'start') {
            feed.push({
              kind: 'activity',
              id: nextId(),
              toolId: evt.id,
              glyph: evt.glyph ?? '·',
              label: evt.detail ?? evt.name ?? evt.capability ?? 'working',
              capability: evt.capability,
              status: 'start',
            });
          } else {
            // update the matching activity row by toolId (latest first)
            for (let i = feed.length - 1; i >= 0; i--) {
              const it = feed[i];
              if (it && it.kind === 'activity' && it.toolId === evt.id && it.status === 'start') {
                feed[i] = { ...it, status: evt.status };
                break;
              }
            }
          }
          return { ...prev, feed };
        }
        case 'question':
          feed.push({ kind: 'question', id: nextId(), toolId: evt.id, questions: evt.questions, answered: false });
          return { ...prev, feed };
        case 'session':
          return { ...prev, sessionId: evt.sessionId };
        case 'done':
          return { ...prev, working: false, lastCostUsd: evt.costUsd ?? prev.lastCostUsd };
        case 'offline':
          return {
            ...prev,
            working: false,
            offline: true,
            offlineReason: evt.reason,
            feed: [...feed, { kind: 'system', id: nextId(), text: evt.reason }],
          };
        default:
          return prev;
      }
    });
  }, []);

  // UIP6.14 — replay the persisted transcript on mount (the feed survives refresh/close), and
  // while a turn is STILL RUNNING server-side (refresh mid-turn) poll the transcript until it
  // ends — the rebuild is idempotent (user messages are persisted before the turn starts).
  useEffect(() => {
    let alive = true;
    // switching projects: never show the previous project's feed while the transcript loads
    setState((p) => ({ ...p, feed: [], working: false }));
    const load = async (): Promise<boolean> => {
      try {
        const r = await api.chat(project);
        if (!alive) return false;
        const feed = foldChat(r.entries);
        const maxId = feed.reduce((m, it) => Math.max(m, it.id), 0);
        idRef.current = Math.max(idRef.current, maxId);
        setState((p) => {
          // never shrink a LIVE feed with a stale snapshot (e.g. the wizard kickoff raced the
          // fetch) — the transcript only replaces the view once it has caught up
          if (feed.length < p.feed.length) return { ...p, working: p.working || r.busy };
          return { ...p, feed, working: r.busy }; // isBusy() is the server truth for in-flight turns
        });
        return r.busy;
      } catch {
        return false; // no transcript / server hiccup — the live WS path still works
      }
    };
    void (async () => {
      let busy = await load();
      while (alive && busy) {
        await new Promise((res) => setTimeout(res, 2500));
        if (!alive) break;
        busy = await load();
      }
    })();
    return () => {
      alive = false;
    };
  }, [project]);

  // connect (with reconnect while mounted)
  useEffect(() => {
    aliveRef.current = true;
    const connect = () => {
      if (!aliveRef.current) return;
      const sock = new WebSocket(wsUrl());
      socketRef.current = sock;
      sock.onopen = () => aliveRef.current && setState((p) => ({ ...p, connected: true }));
      sock.onmessage = (ev) => {
        try {
          const evt = JSON.parse(ev.data) as AgentEvent;
          apply(evt);
          // UIP6.12 — generated artifacts appear in Assets while the agent works (debounced)
          if ((evt.type === 'tool' && evt.status === 'ok' && ARTIFACT_TOOLS.has(evt.name)) || evt.type === 'done') {
            nudgeAssetsReload();
          }
        } catch {
          /* ignore non-JSON frames */
        }
      };
      sock.onclose = () => {
        setState((p) => ({ ...p, connected: false }));
        socketRef.current = null;
        if (aliveRef.current && !reconnectRef.current) {
          reconnectRef.current = setTimeout(() => {
            reconnectRef.current = null;
            connect();
          }, 1000);
        }
      };
      sock.onerror = () => sock.close();
    };
    connect();
    return () => {
      aliveRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [apply]);

  const post = useCallback((payload: Record<string, unknown>) => {
    const sock = socketRef.current;
    if (!sock || sock.readyState !== WebSocket.OPEN) return false;
    sock.send(JSON.stringify({ ...payload, project }));
    return true;
  }, [project]);

  const send = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      setState((p) => ({ ...p, working: true, feed: [...p.feed, { kind: 'user', id: nextId(), text: t }] }));
      post({ type: 'user', text: t });
    },
    [post],
  );

  const approvePlan = useCallback(() => {
    setState((p) => ({ ...p, working: true }));
    post({ type: 'intent', intent: 'approve_plan' });
  }, [post]);

  const requestChanges = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      setState((p) => ({ ...p, working: true, feed: [...p.feed, { kind: 'user', id: nextId(), text: t }] }));
      post({ type: 'intent', intent: 'request_changes', payload: { text: t } });
    },
    [post],
  );

  const explainActivity = useCallback(
    (row: string) => {
      setState((p) => ({ ...p, working: true }));
      post({ type: 'intent', intent: 'explain_activity', payload: { row } });
    },
    [post],
  );

  const answerQuestion = useCallback(
    (itemId: number, text: string) => {
      const t = text.trim();
      if (!t) return;
      setState((p) => ({
        ...p,
        working: true,
        feed: [
          ...p.feed.map((it) => (it.kind === 'question' && it.id === itemId ? { ...it, answered: true } : it)),
          { kind: 'user' as const, id: nextId(), text: t },
        ],
      }));
      post({ type: 'user', text: t });
    },
    [post],
  );

  const cancel = useCallback(() => {
    post({ type: 'cancel' });
    setState((p) => ({ ...p, working: false }));
  }, [post]);

  return { ...state, send, approvePlan, requestChanges, explainActivity, answerQuestion, cancel };
}
