/**
 * src/server/brand-routes.ts — the Brand page backend (D9, doc 07 §6 — NEW build).
 *
 * brand/brand.json is THE config boundary: BrandContext (components), the council's brand
 * lens, sanitize brandWords and the ElevenLabs voice ID all read it. The UI form edits it
 * here with brief-style optimistic concurrency (sha256 + 409); the agent edits the same file
 * directly with Write — the chokidar watcher broadcasts a `brand` event either way, so the
 * page live-reloads.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { projectDir } from './context.js';

function brandPath(): string {
  return path.join(projectDir(), 'brand', 'brand.json');
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The prompt the "Let the agent set this up" button sends through the cockpit (D9). */
export const BRAND_AGENT_PROMPT =
  'Help me set up my brand. Interview me about my brand one topic at a time (name, ' +
  'colors, tone of voice, sell style, language, voice-over preference, words to avoid), ' +
  'then write the result into brand/brand.json (keep its existing shape and _comment keys) ' +
  'and summarize what you set.';

export function registerBrandRoutes(app: FastifyInstance): void {
  app.get('/api/brand', async () => {
    const p = brandPath();
    if (!fs.existsSync(p)) {
      return { exists: false, brand: null, sha256: null, agentPrompt: BRAND_AGENT_PROMPT };
    }
    const raw = fs.readFileSync(p, 'utf8');
    let brand: unknown = null;
    try {
      brand = JSON.parse(raw);
    } catch {
      /* malformed → the UI shows an honest error state with the sha so a save can still fix it */
    }
    return { exists: true, brand, sha256: sha256(raw), agentPrompt: BRAND_AGENT_PROMPT };
  });

  app.put('/api/brand', async (req, reply) => {
    const body = (req.body ?? {}) as { brand?: unknown; expectSha?: string };
    if (!body.brand || typeof body.brand !== 'object' || Array.isArray(body.brand)) {
      return reply.code(400).send({ error: 'body must be { brand: { … }, expectSha? }' });
    }
    const p = brandPath();
    const current = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    // Optimistic concurrency (the agent may have rewritten brand.json since the form loaded).
    if (body.expectSha && current !== null && sha256(current) !== body.expectSha) {
      return reply
        .code(409)
        .send({ error: 'brand.json changed since you loaded it', sha256: sha256(current) });
    }
    const text = JSON.stringify(body.brand, null, 2) + '\n';
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text, 'utf8');
    return { saved: true, sha256: sha256(text) };
  });
}
