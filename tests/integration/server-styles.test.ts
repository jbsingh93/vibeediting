/**
 * server-styles.test.ts — dynamic wizard styles + Save-as-Template (styles-routes.ts).
 * Locks: 7 builtins with ali-abdaal first (D23), template skills discovered via vibe-style
 * frontmatter (with parsed formats), malformed frontmatter ignored, and POST /distill validation +
 * the fire-and-return turn that lands the distiller prompt in chat.jsonl (mock agent).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/index.js';
import { readChat } from '../../src/agent/chat.js';
import { makeTempVibeProject, MOCK_AGENT, type TempVibeProject } from '../helpers/temp-vibe-project.js';

let app: FastifyInstance;
let tmp: TempVibeProject;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  tmp = makeTempVibeProject();
  for (const k of ['VIBE_AGENT_BIN', 'VIBE_MOCK_COMPLETE_STAGE', 'VIBE_MOCK_SCENARIO']) saved[k] = process.env[k];
  app = await buildApp();
});
afterEach(async () => {
  await app.close();
  tmp.cleanup();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function writeSkill(slug: string, frontmatter: string): void {
  const dir = path.join(tmp.dir, '.claude', 'skills', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), frontmatter, 'utf8');
}

describe('GET /api/styles', () => {
  it('returns the 7 builtins with ali-abdaal first (D23 default-first contract)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/styles' });
    expect(res.statusCode).toBe(200);
    const styles = (res.json() as { styles: Array<{ id: string; source: string }> }).styles;
    const builtins = styles.filter((s) => s.source === 'builtin');
    expect(builtins).toHaveLength(7);
    expect(builtins[0]!.id).toBe('ali-abdaal');
  });

  it('discovers a template skill with vibe-style frontmatter (parsed formats)', async () => {
    writeSkill(
      'my-style',
      [
        '---',
        'vibe-style: true',
        'vibe-style-label: My Style',
        'vibe-style-hint: punchy cuts',
        'vibe-style-formats: ["9:16", "1:1"]',
        '---',
        '# My Style',
      ].join('\n'),
    );
    const res = await app.inject({ method: 'GET', url: '/api/styles' });
    const styles = (res.json() as { styles: Array<{ id: string; source: string; label: string; formats?: string[] }> })
      .styles;
    const mine = styles.find((s) => s.id === 'my-style');
    expect(mine).toBeDefined();
    expect(mine?.source).toBe('template');
    expect(mine?.label).toBe('My Style');
    expect(mine?.formats).toEqual(['9:16', '1:1']);
  });

  it('ignores a skill with absent/malformed frontmatter', async () => {
    writeSkill('not-a-style', '# Just a skill, no frontmatter\n');
    writeSkill('no-flag', ['---', 'description: nope', '---', '# no vibe-style flag'].join('\n'));
    const res = await app.inject({ method: 'GET', url: '/api/styles' });
    const ids = (res.json() as { styles: Array<{ id: string }> }).styles.map((s) => s.id);
    expect(ids).not.toContain('not-a-style');
    expect(ids).not.toContain('no-flag');
  });
});

describe('POST /api/templates/distill', () => {
  it('400s a bad slug', async () => {
    tmp.seedManifest('p');
    const res = await app.inject({
      method: 'POST',
      url: '/api/templates/distill',
      payload: { project: 'p', name: 'X' }, // too short / uppercase
    });
    expect(res.statusCode).toBe(400);
  });

  it('409s when a skill dir already exists', async () => {
    tmp.seedManifest('p');
    writeSkill('taken', ['---', 'vibe-style: true', 'vibe-style-label: Taken', '---'].join('\n'));
    const res = await app.inject({
      method: 'POST',
      url: '/api/templates/distill',
      payload: { project: 'p', name: 'taken' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('202s a valid distill and lands the distiller prompt in chat.jsonl', async () => {
    tmp.useClaudeAgent(); // agent:'claude' → VIBE_AGENT_BIN drives the turn
    process.env.VIBE_AGENT_BIN = MOCK_AGENT;
    tmp.seedManifest('p');

    const res = await app.inject({
      method: 'POST',
      url: '/api/templates/distill',
      payload: { project: 'p', name: 'fresh-style' },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json() as { started: boolean; slug: string };
    expect(body).toEqual({ started: true, slug: 'fresh-style' });

    // the fire-and-return turn persists the user prompt to chat.jsonl; poll ≤5s.
    const deadline = Date.now() + 5_000;
    let found = false;
    while (Date.now() < deadline) {
      const entries = readChat(tmp.projectsDir, 'p');
      if (entries.some((e) => e.t === 'user' && /template-distiller/.test(e.text))) {
        found = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(found).toBe(true);
  });
});
