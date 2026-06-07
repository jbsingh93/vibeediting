/**
 * Minimal WS client with auto-reconnect. One connection per channel, shared across subscribers.
 * Used by the live stage strip + gallery to update without a page reload.
 */
type Listener<T> = (msg: T) => void;

interface ChannelState {
  socket: WebSocket | null;
  listeners: Set<Listener<unknown>>;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  connected: boolean;
}

const channels = new Map<string, ChannelState>();

function wsUrl(channel: string): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws/${channel}`;
}

function ensureChannel(channel: string): ChannelState {
  let state = channels.get(channel);
  if (!state) {
    state = { socket: null, listeners: new Set(), reconnectTimer: null, connected: false };
    channels.set(channel, state);
  }
  if (!state.socket) connect(channel, state);
  return state;
}

function connect(channel: string, state: ChannelState): void {
  const socket = new WebSocket(wsUrl(channel));
  state.socket = socket;
  socket.onopen = () => {
    state.connected = true;
  };
  socket.onmessage = (ev) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(ev.data);
    } catch {
      return;
    }
    for (const l of state.listeners) l(parsed);
  };
  socket.onclose = () => {
    state.connected = false;
    state.socket = null;
    // reconnect only while someone is listening
    if (state.listeners.size > 0 && !state.reconnectTimer) {
      state.reconnectTimer = setTimeout(() => {
        state.reconnectTimer = null;
        connect(channel, state);
      }, 1000);
    }
  };
  socket.onerror = () => socket.close();
}

/** Subscribe to a channel; returns an unsubscribe fn. */
export function subscribe<T>(channel: string, listener: Listener<T>): () => void {
  const state = ensureChannel(channel);
  state.listeners.add(listener as Listener<unknown>);
  return () => {
    state.listeners.delete(listener as Listener<unknown>);
    if (state.listeners.size === 0 && state.socket) {
      state.socket.close();
      state.socket = null;
    }
  };
}
