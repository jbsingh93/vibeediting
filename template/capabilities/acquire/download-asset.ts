#!/usr/bin/env tsx
/**
 * capabilities/acquire/download-asset.ts — direct binary fetch by URL (plan P1F.3, GAP-48).
 *
 * Pulls an image/video/audio/font/LUT by URL with sha256 + content-type/extension validation + a size
 * guard + provenance. Lands in public/<project>/refs/ (assets meant to SHIP) or test-video/<project>/refs/
 * (working/reference). The latter is gitignored media.
 *
 * CLI: tsx download-asset.ts --url URL --project NAME [--ship] [--out FILE] [--max-mb 200]
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT, runCapability } from '../_env/contract';
import { appendAcquireRecord } from './provenance';

const EXT_BY_CT: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/aac': '.aac',
  'font/ttf': '.ttf', 'font/otf': '.otf', 'font/woff2': '.woff2', 'application/octet-stream': '',
};

/** Pick a filename: prefer the URL's, else derive from content-type (pure → testable). */
export function chooseFilename(url: string, contentType: string | null): string {
  const urlName = path.basename(new URL(url).pathname);
  if (urlName && /\.[a-z0-9]{2,5}$/i.test(urlName)) return urlName;
  const ext = contentType ? (EXT_BY_CT[contentType.split(';')[0].trim()] ?? '') : '';
  return `asset-${Date.now()}${ext}`;
}

export function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  await runCapability('acquire/download-asset', async () => {
    const url = arg('url');
    const project = arg('project');
    if (!url) throw new Error('missing --url');
    if (!project) throw new Error('missing --project');
    const maxMb = parseFloat(arg('max-mb') ?? '200');
    const ship = process.argv.includes('--ship');

    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 vibe-acquire' } });
    if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const mb = buf.length / 1048576;
    if (mb > maxMb) throw new Error(`asset is ${mb.toFixed(1)} MB > --max-mb ${maxMb}`);

    const filename = path.basename(arg('out') ?? chooseFilename(url, res.headers.get('content-type')));
    const baseDir = ship
      ? path.join(REPO_ROOT, 'public', project, 'refs')
      : path.join(REPO_ROOT, 'test-video', project, 'refs');
    fs.mkdirSync(baseDir, { recursive: true });
    const outPath = path.join(baseDir, filename);
    fs.writeFileSync(outPath, buf);

    const hash = sha256(buf);
    appendAcquireRecord(project, { sourceUrl: url, fetchedAt: new Date().toISOString(), localPath: outPath, sha256: hash, bytes: buf.length, tool: 'download-asset', usageIntent: ship ? 'ship' : 'reference' });

    return { outputs: [outPath], metrics: { bytes: buf.length, mb: +mb.toFixed(2), sha256: hash, ship, contentType: res.headers.get('content-type') }, project, source: url, args: process.argv.slice(2) };
  });
}

// Symlink-safe main-guard: macOS tmp/cwd paths can reach the same file via /var → /private/var,
// so a plain path.resolve comparison misses (live-found on Apple-silicon CI at GATE V3).
const realpathSafe = (p: string): string => { try { return fs.realpathSync(path.resolve(p)); } catch { return path.resolve(p); } };
if (process.argv[1] && realpathSafe(process.argv[1]) === realpathSafe(__filename)) void main();
