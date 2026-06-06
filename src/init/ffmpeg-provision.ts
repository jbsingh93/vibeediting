/**
 * FFmpeg provisioner (D21) — downloads a per-OS FULL static ffmpeg/ffprobe build into
 * a project's `.vibe/bin/`, verifies the archive checksum when the host publishes one,
 * extracts with the OS's own bsdtar/GNU-tar (`tar -xf` handles .zip on win32/darwin and
 * .tar.xz on linux — no extraction dependency needed), and chmods on POSIX.
 *
 * Distribution note (doc 08 §5): we download at the USER's request from the upstream
 * build hosts — the package never bundles ffmpeg binaries (GPL distribution stance).
 *
 * The capability PROBE (filters/encoders → ffmpeg-capabilities.json) lives in the
 * scaffolded project (`capabilities/_env/ffmpeg.ts`) — callers run it after provisioning;
 * this module only verifies the binaries run (`-version`).
 *
 * Seams: VIBE_FFMPEG_URL / VIBE_FFPROBE_URL override the download source (tests/mirrors).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ContractError, FsError, NetworkError } from '../core/errors.js';

export interface FfmpegSource {
  /** primary archive (contains ffmpeg, and on win32/linux also ffprobe) */
  url: string;
  /** checksum sidecar published by the host (same origin), if any */
  checksumUrl?: string;
  checksumAlgo?: 'sha256' | 'md5';
  /** darwin: ffprobe ships as a separate archive */
  ffprobeUrl?: string;
  kind: 'zip' | 'tar.xz';
  host: string;
}

/** Per-OS full static builds (doc 07 §11). The post-extract PROBE is the real gate. */
export function pickSource(platform = process.platform, arch = process.arch): FfmpegSource {
  if (process.env.VIBE_FFMPEG_URL) {
    const url = process.env.VIBE_FFMPEG_URL;
    return {
      url,
      ffprobeUrl: process.env.VIBE_FFPROBE_URL,
      kind: url.endsWith('.tar.xz') ? 'tar.xz' : 'zip',
      host: 'env:VIBE_FFMPEG_URL',
    };
  }
  switch (platform) {
    case 'win32':
      return {
        url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
        checksumUrl: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.sha256',
        checksumAlgo: 'sha256',
        kind: 'zip',
        host: 'gyan.dev',
      };
    case 'darwin':
      // evermeet.cx static builds (x64; run fine on arm64 under Rosetta). ffprobe is separate.
      return {
        url: 'https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip',
        ffprobeUrl: 'https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip',
        kind: 'zip',
        host: 'evermeet.cx',
      };
    default: {
      const a = arch === 'arm64' ? 'arm64' : 'amd64';
      return {
        url: `https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${a}-static.tar.xz`,
        checksumUrl: `https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${a}-static.tar.xz.md5`,
        checksumAlgo: 'md5',
        kind: 'tar.xz',
        host: 'johnvansickle.com',
      };
    }
  }
}

export interface ProvisionProgress {
  (phase: 'download' | 'verify' | 'extract' | 'install' | 'done', detail: string): void;
}

async function download(url: string, dest: string, onProgress?: (pct: number | null) => void): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new NetworkError(`download failed: ${res.status} ${res.statusText} — ${url}`, 'Check your connection, or install ffmpeg yourself and set VIBE_FFMPEG.');
  }
  const total = Number(res.headers.get('content-length') ?? 0);
  const out = fs.createWriteStream(dest);
  let received = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    out.write(Buffer.from(value));
    onProgress?.(total ? Math.round((received / total) * 100) : null);
  }
  await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())));
}

function hashFile(file: string, algo: 'sha256' | 'md5'): string {
  const h = createHash(algo);
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

/** Verify against the host's sidecar (format: "<hex>  <name>" or bare hex). */
export async function verifyChecksum(archive: string, src: FfmpegSource): Promise<'verified' | 'no-checksum-published'> {
  if (!src.checksumUrl || !src.checksumAlgo) return 'no-checksum-published';
  const res = await fetch(src.checksumUrl, { redirect: 'follow' });
  if (!res.ok) return 'no-checksum-published'; // sidecar missing upstream — probe still gates
  const text = (await res.text()).trim();
  const expected = text.split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!/^[0-9a-f]{32,64}$/.test(expected)) return 'no-checksum-published';
  const actual = hashFile(archive, src.checksumAlgo).toLowerCase();
  if (actual !== expected) {
    throw new ContractError(`ffmpeg archive checksum mismatch (${src.checksumAlgo}): expected ${expected}, got ${actual}`, 'Re-run the download; if it persists, install ffmpeg yourself and set VIBE_FFMPEG.');
  }
  return 'verified';
}

/**
 * Extract with the OS tar (bsdtar reads .zip on win32/darwin; GNU tar reads .tar.xz).
 * IMPORTANT: tar treats `C:\…` as a remote host (`host:file` syntax) — so we run with
 * cwd = the archive's directory and pass RELATIVE paths only (no drive colons).
 */
function extractArchive(archive: string, into: string): void {
  fs.mkdirSync(into, { recursive: true });
  const cwd = path.dirname(archive);
  const relArchive = path.basename(archive);
  const relInto = path.relative(cwd, into) || '.';
  // On win32, pin System32's bsdtar explicitly: an MSYS/Git-Bash PATH puts GNU tar first,
  // and GNU tar cannot read .zip ("This does not look like a tar archive").
  const sysTar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  const tarBin = process.platform === 'win32' && fs.existsSync(sysTar) ? sysTar : 'tar';
  const r = spawnSync(tarBin, ['-xf', relArchive, '-C', relInto], { encoding: 'utf8', windowsHide: true, cwd });
  if (r.status !== 0) {
    throw new FsError(`archive extraction failed (tar exit ${r.status ?? 'spawn-error'}): ${r.stderr || r.error?.message || ''}`, 'Install ffmpeg yourself and set VIBE_FFMPEG, or ensure the system tar is available.');
  }
}

/** Find the wanted binaries anywhere in the extracted tree (hosts nest them differently). */
export function findExtractedBinaries(root: string, names: string[]): Record<string, string> {
  const found: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (names.includes(entry.name) && !(entry.name in found)) found[entry.name] = full;
    }
  };
  walk(root);
  return found;
}

export interface ProvisionResult {
  ffmpeg: string;
  ffprobe: string;
  version: string;
  host: string;
  checksum: 'verified' | 'no-checksum-published';
}

/**
 * Provision ffmpeg+ffprobe into `<projectDir>/.vibe/bin/`. Throws VibeError on failure.
 * Caller runs the project's capability probe afterwards (writes ffmpeg-capabilities.json).
 */
export async function provisionFfmpeg(projectDir: string, onProgress?: ProvisionProgress): Promise<ProvisionResult> {
  const exe = process.platform === 'win32' ? '.exe' : '';
  const binDir = path.join(projectDir, '.vibe', 'bin');
  const src = pickSource();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-ffmpeg-'));

  try {
    const wanted = [`ffmpeg${exe}`, `ffprobe${exe}`];
    const archives: string[] = [];
    const main = path.join(work, `ffmpeg-archive.${src.kind === 'zip' ? 'zip' : 'tar.xz'}`);
    onProgress?.('download', `${src.host} → ${src.url}`);
    await download(src.url, main, (pct) => onProgress?.('download', pct === null ? 'downloading…' : `${pct}%`));
    archives.push(main);

    onProgress?.('verify', src.checksumUrl ? `checksum (${src.checksumAlgo})` : 'no checksum published by host — probe gates instead');
    const checksum = await verifyChecksum(main, src);

    if (src.ffprobeUrl) {
      const probeArc = path.join(work, 'ffprobe-archive.zip');
      onProgress?.('download', `${src.host} → ${src.ffprobeUrl}`);
      await download(src.ffprobeUrl, probeArc);
      archives.push(probeArc);
    }

    const extracted = path.join(work, 'extracted');
    onProgress?.('extract', path.basename(main));
    for (const a of archives) extractArchive(a, extracted);

    const bins = findExtractedBinaries(extracted, wanted);
    const missing = wanted.filter((w) => !bins[w]);
    if (missing.length) {
      throw new ContractError(`archive did not contain: ${missing.join(', ')}`, 'Report this (the upstream layout may have changed), or install ffmpeg yourself and set VIBE_FFMPEG.');
    }

    fs.mkdirSync(binDir, { recursive: true });
    for (const w of wanted) {
      const dest = path.join(binDir, w);
      fs.copyFileSync(bins[w]!, dest);
      if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
    }
    onProgress?.('install', binDir);

    const ffmpegPath = path.join(binDir, `ffmpeg${exe}`);
    const ver = spawnSync(ffmpegPath, ['-hide_banner', '-version'], { encoding: 'utf8', windowsHide: true });
    if (ver.status !== 0) {
      throw new ContractError(`provisioned ffmpeg does not run (exit ${ver.status ?? 'spawn-error'})`, 'Your platform may need a different build — install ffmpeg yourself and set VIBE_FFMPEG.');
    }
    const version = (ver.stdout ?? '').split('\n')[0]?.trim() ?? 'unknown';
    onProgress?.('done', version);

    return { ffmpeg: ffmpegPath, ffprobe: path.join(binDir, `ffprobe${exe}`), version, host: src.host, checksum };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
