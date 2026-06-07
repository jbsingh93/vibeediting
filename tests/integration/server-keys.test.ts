/**
 * server-keys.test.ts — the API-Keys page backend (keys-routes.ts). Locks the security stance:
 * GET returns masked values only, PUT preserves comments and removes-on-empty, validation rejects
 * unknown/multiline values, and POST /test sends the key ONLY to its own provider (fetch stubbed).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/index.js';
import { maskValue } from '../../src/server/keys-routes.js';
import { makeTempVibeProject, type TempVibeProject } from '../helpers/temp-vibe-project.js';

let app: FastifyInstance;
let tmp: TempVibeProject;
const savedOpenAi = { v: process.env.OPENAI_API_KEY };

beforeEach(async () => {
  tmp = makeTempVibeProject();
  app = await buildApp();
});
afterEach(async () => {
  await app.close();
  tmp.cleanup();
  vi.unstubAllGlobals();
  // PUT mirrors into process.env — restore so other files don't see a leaked key.
  if (savedOpenAi.v === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = savedOpenAi.v;
});

function envText(): string {
  return fs.readFileSync(path.join(tmp.dir, '.env'), 'utf8');
}

describe('GET /api/keys', () => {
  it('returns the 5 specs all unset on a fresh project', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/keys' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { keys: Array<{ key: string; set: boolean; masked: string | null }> };
    expect(body.keys).toHaveLength(5);
    expect(body.keys.every((k) => k.set === false)).toBe(true);
    expect(body.keys.every((k) => k.masked === null)).toBe(true);
    expect(body.keys[0]!.key).toBe('OPENAI_API_KEY');
  });
});

describe('PUT /api/keys', () => {
  it('writes a key, preserves the comment line, GET shows masked', async () => {
    const value = 'sk-test12345678';
    const res = await app.inject({
      method: 'PUT',
      url: '/api/keys',
      payload: { values: { OPENAI_API_KEY: value } },
    });
    expect(res.statusCode).toBe(200);

    const text = envText();
    expect(text).toContain('# vibe project secrets'); // comment PRESERVED
    expect(text).toContain('VIBE_TEST_PRESENCE=1'); // existing unknown line preserved
    expect(text).toContain(`OPENAI_API_KEY=${value}`);

    const got = await app.inject({ method: 'GET', url: '/api/keys' });
    const row = (got.json() as { keys: Array<{ key: string; set: boolean; masked: string }> }).keys.find(
      (k) => k.key === 'OPENAI_API_KEY',
    );
    expect(row?.set).toBe(true);
    expect(row?.masked).toBe(maskValue(value)); // exact masking (sk-…5678)
    expect(row?.masked).toBe('sk-…5678');
  });

  it('removes the line when the value is empty', async () => {
    await app.inject({ method: 'PUT', url: '/api/keys', payload: { values: { OPENAI_API_KEY: 'sk-aaaa1111' } } });
    expect(envText()).toContain('OPENAI_API_KEY=');
    await app.inject({ method: 'PUT', url: '/api/keys', payload: { values: { OPENAI_API_KEY: '' } } });
    expect(envText()).not.toContain('OPENAI_API_KEY=');
    // comment + presence line survive the removal
    expect(envText()).toContain('# vibe project secrets');
    expect(envText()).toContain('VIBE_TEST_PRESENCE=1');
  });

  it('400s an unknown key', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/keys',
      payload: { values: { NOT_A_KEY: 'x' } },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toMatch(/unknown key/i);
  });

  it('400s a multiline value', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/keys',
      payload: { values: { OPENAI_API_KEY: 'sk-line1\nsk-line2' } },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toMatch(/invalid value/i);
  });
});

describe('POST /api/keys/test', () => {
  it('400s an unknown key', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/keys/test', payload: { key: 'NOPE' } });
    expect(res.statusCode).toBe(400);
  });

  it('400s a key that is not set', async () => {
    delete process.env.OPENAI_API_KEY;
    const res = await app.inject({
      method: 'POST',
      url: '/api/keys/test',
      payload: { key: 'OPENAI_API_KEY' },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toMatch(/not set/i);
  });

  it('probes a set key, sending it ONLY to its provider (200 → ok:true)', async () => {
    await app.inject({ method: 'PUT', url: '/api/keys', payload: { values: { OPENAI_API_KEY: 'sk-good12345678' } } });

    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.inject({ method: 'POST', url: '/api/keys/test', payload: { key: 'OPENAI_API_KEY' } });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { ok: boolean }).ok).toBe(true);

    // the key went only to api.openai.com, in the Authorization header
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain('api.openai.com');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-good12345678');
  });

  it('reports the rejection message on a 401', async () => {
    await app.inject({ method: 'PUT', url: '/api/keys', payload: { values: { OPENAI_API_KEY: 'sk-bad123456789' } } });

    const fetchMock = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.inject({ method: 'POST', url: '/api/keys/test', payload: { key: 'OPENAI_API_KEY' } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; message: string };
    expect(body.ok).toBe(false);
    expect(body.message).toMatch(/rejected this key/i);
  });

  it('surfaces a provider 500 as a non-fatal failure (no crash, no value leak)', async () => {
    const value = 'sk-fivehundred12';
    await app.inject({ method: 'PUT', url: '/api/keys', payload: { values: { OPENAI_API_KEY: value } } });

    const fetchMock = vi.fn(async () => new Response('server error', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.inject({ method: 'POST', url: '/api/keys/test', payload: { key: 'OPENAI_API_KEY' } });
    expect(res.statusCode).toBe(200); // the route never 5xx's on a probe failure
    const body = res.json() as { ok: boolean; message: string };
    expect(body.ok).toBe(false);
    expect(body.message).toMatch(/unexpected provider response \(http 500\)/i);
    // the secret is NEVER echoed back to the client
    expect(JSON.stringify(body)).not.toContain(value);
  });

  it('surfaces a network refusal as a "could not reach the provider" failure', async () => {
    const value = 'sk-netrefused123';
    await app.inject({ method: 'PUT', url: '/api/keys', payload: { values: { OPENAI_API_KEY: value } } });

    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed'); // undici's shape for ECONNREFUSED / DNS failure
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.inject({ method: 'POST', url: '/api/keys/test', payload: { key: 'OPENAI_API_KEY' } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; message: string };
    expect(body.ok).toBe(false);
    expect(body.message).toMatch(/could not reach the provider \(network error\)/i);
    expect(JSON.stringify(body)).not.toContain(value);
  });

  it('surfaces an aborted (timed-out) probe as a "timed out" failure', async () => {
    const value = 'sk-timeout12345';
    await app.inject({ method: 'PUT', url: '/api/keys', payload: { values: { OPENAI_API_KEY: value } } });

    const fetchMock = vi.fn(async () => {
      // the probe wraps fetch in an 8s AbortController; on timeout undici throws an AbortError.
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.inject({ method: 'POST', url: '/api/keys/test', payload: { key: 'OPENAI_API_KEY' } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; message: string };
    expect(body.ok).toBe(false);
    expect(body.message).toMatch(/could not reach the provider \(timed out\)/i);
    expect(JSON.stringify(body)).not.toContain(value);
  });
});

describe('PUT /api/keys (rotation)', () => {
  it('rotates an existing key in place, preserving comments + unknown lines', async () => {
    await app.inject({ method: 'PUT', url: '/api/keys', payload: { values: { OPENAI_API_KEY: 'sk-original1234' } } });
    expect(envText()).toContain('OPENAI_API_KEY=sk-original1234');

    // overwrite with a new value (the rotation)
    const res = await app.inject({
      method: 'PUT',
      url: '/api/keys',
      payload: { values: { OPENAI_API_KEY: 'sk-rotated56789' } },
    });
    expect(res.statusCode).toBe(200);

    const text = envText();
    expect(text).toContain('OPENAI_API_KEY=sk-rotated56789'); // new value in place
    expect(text).not.toContain('sk-original1234'); // old value gone (no duplicate line)
    expect(text.match(/OPENAI_API_KEY=/g)).toHaveLength(1); // exactly one assignment
    expect(text).toContain('# vibe project secrets'); // comment preserved
    expect(text).toContain('VIBE_TEST_PRESENCE=1'); // unknown line preserved

    // GET reflects the rotated value's mask
    const got = await app.inject({ method: 'GET', url: '/api/keys' });
    const row = (got.json() as { keys: Array<{ key: string; masked: string }> }).keys.find(
      (k) => k.key === 'OPENAI_API_KEY',
    );
    expect(row?.masked).toBe(maskValue('sk-rotated56789'));
  });
});
