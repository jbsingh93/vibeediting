/**
 * src/server/ws-hub.ts — tiny pub/sub registry of open WebSocket clients, grouped by channel.
 *
 * @fastify/websocket owns each socket's lifecycle; this hub just remembers which sockets are
 * listening on which channel so the watcher / job runner can broadcast to all of them. Messages
 * are JSON. Dead sockets are pruned on send.
 */
type Channel = 'manifests' | 'jobs' | 'agent';

interface SocketLike {
  send(data: string): void;
  readyState: number;
}

const channels: Record<Channel, Set<SocketLike>> = {
  manifests: new Set(),
  jobs: new Set(),
  agent: new Set(),
};

const OPEN = 1; // ws.OPEN

export function subscribe(channel: Channel, socket: SocketLike): void {
  channels[channel].add(socket);
}

export function unsubscribe(channel: Channel, socket: SocketLike): void {
  channels[channel].delete(socket);
}

/** Broadcast a JSON-serializable message to every live socket on a channel. */
export function broadcast(channel: Channel, message: unknown): void {
  const payload = JSON.stringify(message);
  for (const socket of channels[channel]) {
    if (socket.readyState !== OPEN) {
      channels[channel].delete(socket);
      continue;
    }
    try {
      socket.send(payload);
    } catch {
      channels[channel].delete(socket);
    }
  }
}

export function clientCount(channel: Channel): number {
  return channels[channel].size;
}
