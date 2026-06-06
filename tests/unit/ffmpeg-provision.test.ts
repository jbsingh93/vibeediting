import { createServer, type Server } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findExtractedBinaries, pickSource, verifyChecksum } from '../../src/init/ffmpeg-provision.js';

describe('pickSource', () => {
  afterEach(() => {
    delete process.env.VIBE_FFMPEG_URL;
    delete process.env.VIBE_FFPROBE_URL;
  });

  it('selects gyan.dev zip with sha256 sidecar on win32', () => {
    const s = pickSource('win32', 'x64');
    expect(s.host).toBe('gyan.dev');
    expect(s.kind).toBe('zip');
    expect(s.checksumAlgo).toBe('sha256');
    expect(s.checksumUrl).toContain('.sha256');
  });

  it('selects evermeet with a separate ffprobe archive on darwin', () => {
    const s = pickSource('darwin', 'arm64');
    expect(s.host).toBe('evermeet.cx');
    expect(s.ffprobeUrl).toBeTruthy();
    expect(s.kind).toBe('zip');
  });

  it('selects johnvansickle tar.xz with arch mapping on linux', () => {
    expect(pickSource('linux', 'x64').url).toContain('amd64');
    expect(pickSource('linux', 'arm64').url).toContain('arm64');
    expect(pickSource('linux', 'x64').kind).toBe('tar.xz');
  });

  it('honors the VIBE_FFMPEG_URL seam (and infers kind from the extension)', () => {
    process.env.VIBE_FFMPEG_URL = 'http://localhost:1/custom.tar.xz';
    const s = pickSource('win32', 'x64');
    expect(s.host).toBe('env:VIBE_FFMPEG_URL');
    expect(s.kind).toBe('tar.xz');
  });
});

describe('findExtractedBinaries', () => {
  it('finds binaries nested at any depth (hosts nest differently)', () => {
    const root = mkdtempSync(join(tmpdir(), 'vibe-extract-'));
    try {
      mkdirSync(join(root, 'ffmpeg-7.1-essentials', 'bin'), { recursive: true });
      writeFileSync(join(root, 'ffmpeg-7.1-essentials', 'bin', 'ffmpeg.exe'), 'x');
      writeFileSync(join(root, 'ffmpeg-7.1-essentials', 'bin', 'ffprobe.exe'), 'x');
      const found = findExtractedBinaries(root, ['ffmpeg.exe', 'ffprobe.exe']);
      expect(Object.keys(found).sort()).toEqual(['ffmpeg.exe', 'ffprobe.exe']);
      expect(found['ffmpeg.exe']).toContain('bin');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns only what exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'vibe-extract-'));
    try {
      const found = findExtractedBinaries(root, ['ffmpeg']);
      expect(found).toEqual({});
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('verifyChecksum', () => {
  let server: Server | undefined;
  afterEach(() => {
    server?.close();
    server = undefined;
  });

  function serve(body: string): Promise<string> {
    return new Promise((resolve) => {
      server = createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end(body);
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server!.address() as { port: number };
        resolve(`http://127.0.0.1:${addr.port}/file.sha256`);
      });
    });
  }

  it('passes when the sidecar hash matches', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vibe-sum-'));
    const archive = join(dir, 'a.zip');
    writeFileSync(archive, 'archive-bytes');
    const digest = createHash('sha256').update('archive-bytes').digest('hex');
    const checksumUrl = await serve(`${digest}  ffmpeg-release.zip`);
    try {
      const result = await verifyChecksum(archive, {
        url: 'x', checksumUrl, checksumAlgo: 'sha256', kind: 'zip', host: 'test',
      });
      expect(result).toBe('verified');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws a contract error (exit 4) on mismatch', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vibe-sum-'));
    const archive = join(dir, 'a.zip');
    writeFileSync(archive, 'archive-bytes');
    const checksumUrl = await serve(`${'0'.repeat(64)}  ffmpeg-release.zip`);
    try {
      await expect(
        verifyChecksum(archive, { url: 'x', checksumUrl, checksumAlgo: 'sha256', kind: 'zip', host: 'test' }),
      ).rejects.toMatchObject({ exitCode: 4 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('degrades to no-checksum-published when the host has no sidecar', async () => {
    const result = await verifyChecksum('does-not-matter', { url: 'x', kind: 'zip', host: 'test' });
    expect(result).toBe('no-checksum-published');
  });
});
