/**
 * src/server/index.ts — the JBS Vibe Editing cockpit server (Fastify on :7878).
 *
 * Boots a local-only web server against ONE vibe project (context.projectDir()): wraps the
 * manifest/health/provenance reads, runs the job queue, bridges the agent CLIs (AgentRunner,
 * D2), broadcasts file changes over WebSocket, and serves the PREBUILT client (ui-dist/ ships
 * in the npm package — the user never runs Vite).
 *
 * Exports `buildApp` / `startServer` so the test suites can boot it on a random port against a
 * temp project dir (never a real one).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { findUiDist, publicDir, outDir, workDir, deliverDir } from './context.js';
import { openBrowser } from './spawn.js';
import { startWatcher } from './watcher.js';
import { subscribe, unsubscribe, broadcast } from './ws-hub.js';
import { readManifest, approveStage } from './manifest.js';
import { cancelAgentTurn } from '../agent/runner.js';
import { runAgentTurn } from './agent-bridge.js';
import type { AgentEvent } from '../agent/events.js';
import { registerManifestRoutes, planGateStage } from './manifest-routes.js';
import { registerHealthRoutes } from './health-routes.js';
import { registerJobRoutes } from './jobs.js';
import { registerP3Routes } from './p3-routes.js';
import { registerP4Routes } from './p4-routes.js';
import { registerP6Routes } from './p6-routes.js';
import { registerKeysRoutes } from './keys-routes.js';
import { registerBrandRoutes } from './brand-routes.js';
import { registerStylesRoutes } from './styles-routes.js';

const DEFAULT_PORT = Number(process.env.VIBE_UI_PORT) || 7878;

export interface BuildOpts {
  /** serve the prebuilt ui-dist (only if it exists). Tests that use inject leave this off. */
  serveStatic?: boolean;
  /** run the chokidar→WS watcher. */
  watch?: boolean;
}

// Broadcast (server→clients) channels handled by the ws-hub + watcher / job runner.
const WS_CHANNELS = ['manifests', 'jobs'] as const;

/** Handle one inbound /ws/agent message (user text / pre-baked intent / cancel). */
async function handleAgentMessage(raw: string, send: (e: AgentEvent) => void): Promise<void> {
  let msg: {
    type?: string;
    project?: string;
    text?: string;
    intent?: string;
    payload?: Record<string, unknown>;
  };
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  const project = msg.project;
  if (!project || typeof project !== 'string') {
    send({ type: 'offline', reason: 'no project on agent message' });
    return;
  }
  if (msg.type === 'cancel') {
    cancelAgentTurn(project);
    return;
  }
  if (msg.type === 'user' && typeof msg.text === 'string') {
    await runAgentTurn(project, msg.text, send);
    return;
  }
  if (msg.type === 'intent') {
    if (msg.intent === 'approve_plan') {
      // GUI-truth first: approve the plan gate on the manifest (works even if the agent is
      // offline), then tell the agent to proceed. The manifest write flows through the watcher.
      try {
        approveStage(project, planGateStage(readManifest(project)));
      } catch (e) {
        send({
          type: 'text',
          delta: `Could not approve the plan gate: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
      await runAgentTurn(project, 'Plan approved — proceed with the next stage.', send);
      return;
    }
    if (msg.intent === 'request_changes') {
      await runAgentTurn(project, String(msg.payload?.text ?? ''), send);
      return;
    }
    if (msg.intent === 'explain_activity') {
      await runAgentTurn(
        project,
        `Explain what you just did in this step: ${String(msg.payload?.row ?? '')}`,
        send,
      );
      return;
    }
  }
}

export async function buildApp(opts: BuildOpts = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(fastifyWebsocket);

  await app.register(async (instance) => {
    // broadcast channels — clients connect, the hub pushes to them.
    for (const channel of WS_CHANNELS) {
      instance.get(`/ws/${channel}`, { websocket: true }, (socket) => {
        subscribe(channel, socket);
        socket.on('close', () => unsubscribe(channel, socket));
        socket.on('error', () => unsubscribe(channel, socket));
      });
    }
    // agent channel — bidirectional: the UI sends user text / intents, the server streams
    // AgentEvents back to THAT socket. Backed by the user's own agent CLI (D2).
    instance.get('/ws/agent', { websocket: true }, (socket) => {
      const send = (e: AgentEvent): void => {
        if (socket.readyState !== 1) return;
        try {
          socket.send(JSON.stringify(e));
        } catch {
          /* socket gone */
        }
      };
      socket.on('message', (data: Buffer | string) => {
        void handleAgentMessage(typeof data === 'string' ? data : data.toString(), send);
      });
    });
  });

  registerManifestRoutes(app);
  registerHealthRoutes(app);
  registerJobRoutes(app);
  registerP3Routes(app);
  registerP4Routes(app);
  await registerP6Routes(app);
  registerKeysRoutes(app);
  registerBrandRoutes(app);
  registerStylesRoutes(app);

  // Read-only static serve of the disposable out/work tree (storyboard frames).
  const work = workDir();
  fs.mkdirSync(work, { recursive: true });
  await app.register(fastifyStatic, { root: work, prefix: '/work/', decorateReply: false });

  // Read-only serve of the deliverables tree + the whole out/ tree so the Preview tab's
  // Renders section can play drafts in the browser. Serve-only.
  const deliverRoot = deliverDir();
  fs.mkdirSync(deliverRoot, { recursive: true });
  await app.register(fastifyStatic, { root: deliverRoot, prefix: '/deliver/', decorateReply: false });
  await app.register(fastifyStatic, { root: outDir(), prefix: '/out/', decorateReply: false });

  const dist = findUiDist();
  if (opts.serveStatic && dist) {
    // Two roots, first match wins: the prebuilt app, then the project public/ so the inline
    // Player's staticFile() URLs (e.g. /my-ad/vo-30s.mp3) resolve like in a render.
    const pub = publicDir();
    fs.mkdirSync(pub, { recursive: true });
    await app.register(fastifyStatic, { root: [dist, pub], prefix: '/' });
    // SPA fallback: any non-API/non-WS NAVIGATION GET serves index.html. A missing asset
    // request (e.g. the Player asking for a gitignored mp4 that isn't on disk) must stay a
    // REAL 404 — serving HTML to a <video> makes the browser throw a decode error.
    app.setNotFoundHandler((req, reply) => {
      const wantsHtml = String(req.headers.accept ?? '').includes('text/html');
      const looksLikeFile = /\.[a-z0-9]{2,5}$/i.test(req.url.split('?')[0] ?? '');
      if (
        req.method === 'GET' &&
        wantsHtml &&
        !looksLikeFile &&
        !req.url.startsWith('/api') &&
        !req.url.startsWith('/ws') &&
        !req.url.startsWith('/work')
      ) {
        return reply.type('text/html').send(fs.readFileSync(path.join(dist, 'index.html')));
      }
      return reply.code(404).send({ error: 'not found' });
    });
  }

  if (opts.watch) {
    const watcher = startWatcher();
    app.addHook('onClose', async () => {
      await watcher.close();
    });
  }

  return app;
}

/** Listen, incrementing the port if the preferred one is taken. */
export async function startServer(
  opts: BuildOpts & { port?: number } = {},
): Promise<{ app: FastifyInstance; port: number }> {
  const app = await buildApp(opts);
  const start = opts.port ?? DEFAULT_PORT;
  // port 0 = let the OS pick an ephemeral port (used by tests).
  const attempts = start === 0 ? 1 : 25;
  for (let i = 0; i < attempts; i++) {
    const port = start === 0 ? 0 : start + i;
    try {
      await app.listen({ port, host: '127.0.0.1' });
      const addr = app.server.address();
      const actual = typeof addr === 'object' && addr ? addr.port : port;
      return { app, port: actual };
    } catch (e) {
      if (e && typeof e === 'object' && (e as { code?: string }).code === 'EADDRINUSE') continue;
      throw e;
    }
  }
  throw new Error(`no free port in ${start}..${start + 24}`);
}

export { openBrowser, broadcast };
