/**
 * server-p6.test.ts — the creation modes' seam (p6-routes.ts): brief read/write with sha
 * optimistic concurrency, multipart asset upload (sanitize / traversal / collision / ext reject),
 * the wiki parser over CAPABILITIES.md (sec-N ids), the .env 403 guard, and chat replay.
 *
 * Multipart payloads are built by hand (a boundary + CRLF-delimited parts) — fastify inject sends
 * the raw body with the multipart content-type header, exactly what @fastify/multipart streams.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/index.js';
import { makeTempVibeProject, type TempVibeProject } from '../helpers/temp-vibe-project.js';

let app: FastifyInstance;
let tmp: TempVibeProject;

beforeEach(async () => {
  tmp = makeTempVibeProject();
  app = await buildApp();
});
afterEach(async () => {
  await app.close();
  tmp.cleanup();
});

const BOUNDARY = '----vibetestboundary1234';

/** Build one file-part multipart/form-data body (Buffer) for the given filename + bytes. */
function multipartFile(filename: string, content: Buffer): Buffer {
  const head = Buffer.from(
    `--${BOUNDARY}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${BOUNDARY}--\r\n`, 'utf8');
  return Buffer.concat([head, content, tail]);
}

function uploadHeaders(): Record<string, string> {
  return { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` };
}

describe('brief', () => {
  it('GET returns a stub with exists:false when no brief exists', async () => {
    tmp.seedManifest('b'); // create route writes brief.md, so delete it to test the stub path
    fs.rmSync(path.join(tmp.projectsDir, 'b', 'brief.md'), { force: true });
    const res = await app.inject({ method: 'GET', url: '/api/projects/b/brief' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { exists: boolean; md: string; sha256: string };
    expect(body.exists).toBe(false);
    expect(body.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('PUT 409s a stale expect sha', async () => {
    tmp.seedManifest('b2');
    // brief.md exists from create; write it first so a real on-disk sha exists
    await app.inject({ method: 'PUT', url: '/api/projects/b2/brief', payload: { md: '# real' } });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/projects/b2/brief',
      payload: { md: '# new', expect: 'staleSha' },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string }).error).toBe('file-changed');
  });

  it('PUT with a fresh sha writes and returns the new sha', async () => {
    tmp.seedManifest('b3');
    const get = await app.inject({ method: 'GET', url: '/api/projects/b3/brief' });
    const sha = (get.json() as { sha256: string }).sha256;
    const res = await app.inject({
      method: 'PUT',
      url: '/api/projects/b3/brief',
      payload: { md: '# updated brief', expect: sha },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { sha256: string }).sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.readFileSync(path.join(tmp.projectsDir, 'b3', 'brief.md'), 'utf8')).toBe('# updated brief');
  });

  it('two writers from the same base sha → exactly ONE 409, the winner content intact', async () => {
    tmp.seedManifest('b4');
    // both writers loaded the same base sha
    const get = await app.inject({ method: 'GET', url: '/api/projects/b4/brief' });
    const baseSha = (get.json() as { sha256: string }).sha256;

    // Writer A commits first against the base sha → succeeds (200).
    const a = await app.inject({
      method: 'PUT',
      url: '/api/projects/b4/brief',
      payload: { md: '# writer A wins', expect: baseSha },
    });
    // Writer B then commits against the now-STALE base sha → must lose with a 409.
    const b = await app.inject({
      method: 'PUT',
      url: '/api/projects/b4/brief',
      payload: { md: '# writer B clobbers', expect: baseSha },
    });

    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([200, 409]); // exactly one conflict
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(409);
    expect((b.json() as { error: string }).error).toBe('file-changed');
    // the winner's content is on disk; the loser never clobbered it.
    expect(fs.readFileSync(path.join(tmp.projectsDir, 'b4', 'brief.md'), 'utf8')).toBe('# writer A wins');
    // the 409 hands back the current bytes so writer B can reconcile.
    expect((b.json() as { md: string }).md).toBe('# writer A wins');
  });
});

describe('asset upload (multipart)', () => {
  it('lands a sanitized file in public/<p>/', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/up/assets/upload',
      headers: uploadHeaders(),
      payload: multipartFile('My Clip.mp4', Buffer.alloc(64, 1)),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { uploaded: Array<{ name: string; relPath: string }> };
    expect(body.uploaded).toHaveLength(1);
    expect(body.uploaded[0]!.name).toBe('my-clip.mp4'); // lowercased, spaces → dash
    expect(fs.existsSync(path.join(tmp.dir, 'public', 'up', 'my-clip.mp4'))).toBe(true);
  });

  it('neutralizes a traversal filename to its basename', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/up2/assets/upload',
      headers: uploadHeaders(),
      payload: multipartFile('../evil.mp4', Buffer.alloc(64, 1)),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { uploaded: Array<{ name: string }> };
    expect(body.uploaded[0]!.name).toBe('evil.mp4');
    // nothing escaped public/up2/
    expect(fs.existsSync(path.join(tmp.dir, 'public', 'up2', 'evil.mp4'))).toBe(true);
    expect(fs.existsSync(path.join(tmp.dir, 'public', 'evil.mp4'))).toBe(false);
  });

  it('suffixes -2 on a collision', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/projects/up3/assets/upload',
      headers: uploadHeaders(),
      payload: multipartFile('clip.mp4', Buffer.alloc(64, 1)),
    });
    expect((first.json() as { uploaded: Array<{ name: string }> }).uploaded[0]!.name).toBe('clip.mp4');
    const second = await app.inject({
      method: 'POST',
      url: '/api/projects/up3/assets/upload',
      headers: uploadHeaders(),
      payload: multipartFile('clip.mp4', Buffer.alloc(64, 1)),
    });
    expect((second.json() as { uploaded: Array<{ name: string }> }).uploaded[0]!.name).toBe('clip-2.mp4');
  });

  it('rejects a disallowed extension', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/up4/assets/upload',
      headers: uploadHeaders(),
      payload: multipartFile('malware.exe', Buffer.alloc(64, 1)),
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string; rejected: Array<{ reason: string }> };
    expect(body.error).toMatch(/not an accepted asset type/i);
  });
});

describe('wiki', () => {
  it('parses CAPABILITIES.md into sections with the sec-N id scheme', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/wiki' });
    expect(res.statusCode).toBe(200);
    const sections = (res.json() as { sections: Array<{ id: string; title: string }> }).sections;
    const ids = sections.map((s) => s.id);
    expect(ids).toContain('intro'); // the preamble
    expect(ids).toContain('sec-0');
    expect(ids).toContain('sec-1');
    expect(ids).toContain('sec-2');
    const sec1 = sections.find((s) => s.id === 'sec-1');
    expect(sec1?.title).toBe('1. Ingest');
  });

  it('403s a wiki doc request for .env', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/wiki/doc?path=.env' });
    expect(res.statusCode).toBe(403);
  });
});

describe('chat replay', () => {
  it('returns the transcript entries + busy:false', async () => {
    tmp.seedManifest('c');
    tmp.seedChatUser('c', 'first message');
    tmp.seedChatUser('c', 'second message');
    const res = await app.inject({ method: 'GET', url: '/api/projects/c/chat' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { entries: Array<{ t: string; text?: string }>; busy: boolean };
    expect(body.busy).toBe(false);
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0]).toMatchObject({ t: 'user', text: 'first message' });
  });
});

describe('comps listing (V5 F9 regression)', () => {
  it('GET /api/comps parses USER comps from src/Root.tsx (multi-line attrs, Still, {expr} ids)', async () => {
    const rootTsx = [
      `import { Composition, Still } from 'remotion';`,
      `export const Root = () => (<>`,
      `  <Composition id="DemoWelcome" width={1920} height={1080} fps={30} durationInFrames={150} />`,
      `  <Composition`,
      `    id="MidnightTeaser"`,
      `    width={1080}`,
      `    height={1920}`,
      `  />`,
      `  <Still id={'ThumbStill'} width={1280} height={720} />`,
      `</>);`,
    ].join('\n');
    fs.mkdirSync(path.join(tmp.dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmp.dir, 'src', 'Root.tsx'), rootTsx, 'utf8');

    const res = await app.inject({ method: 'GET', url: '/api/comps' });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { comps: string[] }).comps).toEqual(['DemoWelcome', 'MidnightTeaser', 'ThumbStill']);
  });

  it('falls back to DemoWelcome when Root.tsx is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/comps' });
    expect((res.json() as { comps: string[] }).comps).toEqual(['DemoWelcome']);
  });
});

describe('renders listing', () => {
  it('lists project-scoped renders AND tags root-level strays as unscoped (V5 F5 regression)', async () => {
    tmp.seedManifest('vid');
    // project-scoped renders
    fs.mkdirSync(path.join(tmp.dir, 'out', 'vid'), { recursive: true });
    fs.writeFileSync(path.join(tmp.dir, 'out', 'vid', 'draft-v1.mp4'), Buffer.alloc(2048, 1));
    fs.mkdirSync(path.join(tmp.dir, 'deliver', 'vid'), { recursive: true });
    fs.writeFileSync(path.join(tmp.dir, 'deliver', 'vid', 'final-loudnorm.mp4'), Buffer.alloc(2048, 2));
    // a stray at the out/ ROOT (agent rendered without a project-scoped --out)
    fs.writeFileSync(path.join(tmp.dir, 'out', 'stray_v3.mp4'), Buffer.alloc(2048, 3));
    // another project's scoped render must NOT leak in
    fs.mkdirSync(path.join(tmp.dir, 'out', 'otherproj'), { recursive: true });
    fs.writeFileSync(path.join(tmp.dir, 'out', 'otherproj', 'other.mp4'), Buffer.alloc(2048, 4));
    // non-video at the root must not appear
    fs.writeFileSync(path.join(tmp.dir, 'out', 'notes.txt'), 'x');

    const res = await app.inject({ method: 'GET', url: '/api/projects/vid/renders' });
    expect(res.statusCode).toBe(200);
    const renders = (res.json() as { renders: Array<{ name: string; scoped?: boolean; loudnorm: boolean; url: string }> }).renders;

    const byName = Object.fromEntries(renders.map((r) => [r.name, r]));
    expect(byName['draft-v1.mp4']).toMatchObject({ scoped: true, loudnorm: false });
    expect(byName['final-loudnorm.mp4']).toMatchObject({ scoped: true, loudnorm: true });
    expect(byName['stray_v3.mp4']).toMatchObject({ scoped: false });
    expect(byName['stray_v3.mp4']!.url).toBe('/out/stray_v3.mp4');
    expect(byName['other.mp4']).toBeUndefined();
    expect(byName['notes.txt']).toBeUndefined();
  });
});
