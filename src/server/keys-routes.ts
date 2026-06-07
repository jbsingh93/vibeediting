/**
 * src/server/keys-routes.ts — the API-Keys page backend (D18, doc 07 §7 — NEW build).
 *
 * Reads/writes the PROJECT's .env. Security stance: keys live ONLY in that local file; GET
 * returns masked values (`sk-…last4`), never the raw secret; probes send the key only to its
 * own provider over HTTPS; nothing is ever logged.
 *
 *   GET  /api/keys              → row per known key: set?, masked, descriptions, links
 *   PUT  /api/keys {values}     → parse-preserving .env update (comments/unknown lines kept)
 *   POST /api/keys/test {key}   → cheap server-side probe → { ok, message }
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { projectDir } from './context.js';

export interface KeySpec {
  key: string;
  /** Friendly name shown in the UI row. */
  name: string;
  /** What having this key unlocks (plain language). */
  unlocks: string;
  /** Where to create one. */
  link: string;
  /** Casual cost note (D19 spirit: informative, not scary). */
  costNote: string;
  required: boolean;
}

export const KEY_SPECS: KeySpec[] = [
  {
    key: 'OPENAI_API_KEY',
    name: 'OpenAI',
    unlocks: 'transcription (Whisper word-timing for captions & cuts) and AI thumbnails',
    link: 'https://platform.openai.com/api-keys',
    costNote: 'transcription ≈ $0.006/min · thumbnails a few cents each',
    required: true,
  },
  {
    key: 'GEMINI_API_KEY',
    name: 'Google Gemini',
    unlocks: 'the visual QA council — the AI "eyes" that review every cut before delivery',
    link: 'https://aistudio.google.com/apikey',
    costNote: 'review passes cost cents (flash-lite model)',
    required: true,
  },
  {
    key: 'ELEVENLABS_API_KEY',
    name: 'ElevenLabs',
    unlocks: 'AI voice-over, music and sound effects',
    link: 'https://elevenlabs.io/app/settings/api-keys',
    costNote: 'subscription tiers; a 30s VO is fractions of a cent of quota',
    required: false,
  },
  {
    key: 'RUNWAY_API_SECRET',
    name: 'Runway (optional)',
    unlocks: 'paid AI video generation (Gen-4 / Aleph) for b-roll & VFX shots',
    link: 'https://dev.runwayml.com',
    costNote: 'paid per second of generated video — plans always show the estimate first',
    required: false,
  },
  {
    key: 'FAL_KEY',
    name: 'fal.ai (optional)',
    unlocks: 'paid AI video generation (Seedance) — the budget-friendly mood/texture option',
    link: 'https://fal.ai/dashboard/keys',
    costNote: '≈ $0.04 per second of generated video',
    required: false,
  },
];

function envPath(): string {
  return path.join(projectDir(), '.env');
}

function readEnvText(): string {
  try {
    return fs.readFileSync(envPath(), 'utf8');
  } catch {
    return '';
  }
}

/** Extract the current value of KEY from .env text (last assignment wins, dotenv-style). */
export function envValue(text: string, key: string): string | null {
  let value: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m || m[1] !== key) continue;
    let v = (m[2] ?? '').trim();
    if (
      (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
      (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
    ) {
      v = v.slice(1, -1);
    }
    value = v;
  }
  return value === '' ? null : value;
}

/** Mask a secret for display: first 3 + … + last 4 (never the whole value). */
export function maskValue(v: string): string {
  if (v.length <= 8) return '••••';
  return `${v.slice(0, 3)}…${v.slice(-4)}`;
}

/**
 * Parse-preserving .env update: existing `KEY=` lines are replaced in place (comments and
 * unknown lines untouched); new keys are appended. An empty value REMOVES the assignment.
 */
export function upsertEnvText(text: string, values: Record<string, string>): string {
  const lines = text.length ? text.split(/\r?\n/) : [];
  const pending = new Map(Object.entries(values));
  const out: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=/);
    const key = m?.[1];
    if (key && pending.has(key)) {
      const v = pending.get(key) ?? '';
      pending.delete(key);
      if (v === '') continue; // empty → remove the assignment line
      out.push(`${key}=${v}`);
      continue;
    }
    out.push(line);
  }
  // strip ONE trailing empty line so appends don't accumulate gaps
  while (out.length && out[out.length - 1] === '') out.pop();
  for (const [key, v] of pending) {
    if (v === '') continue;
    out.push(`${key}=${v}`);
  }
  return out.join('\n') + (out.length ? '\n' : '');
}

/** A value a user pasted: single line, no control chars, sane length. */
function sanitizeKeyValue(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (t.length > 512) return null;
  if (/[\r\n\0]/.test(t)) return null;
  return t;
}

// ── per-provider probes (cheap GETs; the key goes ONLY to its own provider) ──────
type ProbeResult = { ok: boolean; message: string };

async function probeFetch(
  url: string,
  init: RequestInit,
  okMessage: string,
): Promise<ProbeResult> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8_000);
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    clearTimeout(t);
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'the provider rejected this key — check it was pasted completely' };
    }
    if (res.ok) return { ok: true, message: okMessage };
    return { ok: false, message: `unexpected provider response (HTTP ${res.status})` };
  } catch (e) {
    const detail = e instanceof Error && e.name === 'AbortError' ? 'timed out' : 'network error';
    return { ok: false, message: `could not reach the provider (${detail}) — check your connection` };
  }
}

export async function probeKey(key: string, value: string): Promise<ProbeResult> {
  switch (key) {
    case 'OPENAI_API_KEY':
      return probeFetch(
        'https://api.openai.com/v1/models',
        { headers: { Authorization: `Bearer ${value}` } },
        'key works — Whisper & thumbnails are unlocked',
      );
    case 'GEMINI_API_KEY':
      return probeFetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(value)}&pageSize=1`,
        {},
        'key works — visual QA is unlocked',
      );
    case 'ELEVENLABS_API_KEY':
      return probeFetch(
        'https://api.elevenlabs.io/v1/user',
        { headers: { 'xi-api-key': value } },
        'key works — voice, music & SFX are unlocked',
      );
    case 'RUNWAY_API_SECRET':
      return probeFetch(
        'https://api.dev.runwayml.com/v1/organization',
        { headers: { Authorization: `Bearer ${value}`, 'X-Runway-Version': '2024-11-06' } },
        'key works — Runway generation is unlocked',
      );
    case 'FAL_KEY': {
      // fal has no dedicated key-check endpoint; an authenticated request to a non-existent
      // queue item returns 4xx-but-not-401 when the key is accepted (401 when it isn't).
      const r = await probeFetch(
        'https://queue.fal.run/fal-ai/flux/requests/00000000-0000-0000-0000-000000000000/status',
        { headers: { Authorization: `Key ${value}` } },
        'key works — Seedance generation is unlocked',
      );
      if (!r.ok && r.message.startsWith('unexpected provider response')) {
        return { ok: true, message: 'key accepted by fal.ai' };
      }
      return r;
    }
    default:
      return { ok: false, message: `unknown key "${key}"` };
  }
}

export function registerKeysRoutes(app: FastifyInstance): void {
  app.get('/api/keys', async () => {
    const text = readEnvText();
    return {
      keys: KEY_SPECS.map((spec) => {
        const v = envValue(text, spec.key);
        return {
          ...spec,
          set: v !== null,
          masked: v !== null ? maskValue(v) : null,
        };
      }),
    };
  });

  app.put('/api/keys', async (req, reply) => {
    const body = (req.body ?? {}) as { values?: Record<string, unknown> };
    if (!body.values || typeof body.values !== 'object') {
      return reply.code(400).send({ error: 'body must be { values: { KEY: "value", … } }' });
    }
    const known = new Set(KEY_SPECS.map((s) => s.key));
    const clean: Record<string, string> = {};
    for (const [key, raw] of Object.entries(body.values)) {
      if (!known.has(key)) return reply.code(400).send({ error: `unknown key "${key}"` });
      const v = sanitizeKeyValue(raw);
      if (v === null) return reply.code(400).send({ error: `invalid value for ${key}` });
      clean[key] = v;
    }
    const next = upsertEnvText(readEnvText(), clean);
    fs.writeFileSync(envPath(), next, 'utf8');
    // Updated keys take effect for capability spawns immediately (they read the project .env);
    // mirror into THIS process's env so doctor/health reflect the change without a restart.
    for (const [key, v] of Object.entries(clean)) {
      if (v === '') delete process.env[key];
      else process.env[key] = v;
    }
    return { saved: Object.keys(clean) };
  });

  app.post('/api/keys/test', async (req, reply) => {
    const body = (req.body ?? {}) as { key?: string };
    const spec = KEY_SPECS.find((s) => s.key === body.key);
    if (!spec) return reply.code(400).send({ error: `unknown key "${String(body.key)}"` });
    const value = envValue(readEnvText(), spec.key) ?? process.env[spec.key] ?? null;
    if (!value) return reply.code(400).send({ error: `${spec.key} is not set yet` });
    return probeKey(spec.key, value);
  });
}
