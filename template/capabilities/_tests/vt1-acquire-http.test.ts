/** VT.1 — acquire network tools run LIVE against an in-test 127.0.0.1 fixture HTTP server
 *  (real sockets, zero internet, doc 13 §3) + setup-venv idempotency. The CLIs are spawned
 *  ASYNC (spawnSync would block the event loop and starve the fixture server). */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { test, assert, assertEqual, assertIncludes } from './harness';
import { ensureFixtures, lastEnvelope, runTsx, type ProcRun } from './fixtures';
import { REPO_ROOT } from '../_env/contract';

/** Async tsx runner — keeps the test process's event loop free to serve HTTP. */
function runTsxAsync(scriptRel: string, args: string[]): Promise<ProcRun> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', path.join(REPO_ROOT, scriptRel), ...args], {
      cwd: REPO_ROOT,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ status: code ?? -1, stdout, stderr }));
  });
}

const PAGE_HTML = `<html><head><title>VT Fixture Page</title></head><body>
  <h1>Hovedtitel</h1><p>Real bytes over a real socket.</p>
  <img src="/img/hero.png"><video src="/clips/v.mp4"></video>
  <script>ignore()</script></body></html>`;

/** One fixture server for the whole file; routes cover every acquire branch. */
async function withServer(fn: (base: string) => Promise<void>): Promise<void> {
  const fx = ensureFixtures();
  const png = fs.readFileSync(fx.imagePng);
  const server = http.createServer((req, res) => {
    switch (req.url) {
      case '/page':
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE_HTML);
        return;
      case '/img.png':
        res.writeHead(200, { 'content-type': 'image/png' }).end(png);
        return;
      case '/noext': // extension-less URL — filename must derive from content-type
        res.writeHead(200, { 'content-type': 'image/png' }).end(png);
        return;
      case '/big.bin':
        res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(Buffer.alloc(2 * 1024 * 1024, 7));
        return;
      default:
        res.writeHead(404).end('nope');
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address() as { port: number };
  try {
    await fn(`http://127.0.0.1:${addr.port}`);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

function provenanceRecords(): { sourceUrl: string; tool: string; usageIntent?: string; localPath: string }[] {
  const p = path.join(REPO_ROOT, 'out', 'work', '_tests', 'acquire', 'provenance.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
}

test('VT1.1 fetch-url LIVE: page → markdown + resolved media URLs + provenance', async () => {
  await withServer(async (base) => {
    const r = await runTsxAsync('capabilities/acquire/fetch-url.ts', ['--url', `${base}/page`, '--project', '_tests']);
    assertEqual(r.status, 0, `fetch-url exit:\n${r.stderr.slice(-600)}`);
    const env = lastEnvelope(r.stdout);
    assert(env.success && env.outputs.length === 1 && fs.existsSync(env.outputs[0]), 'markdown written');
    const md = fs.readFileSync(env.outputs[0], 'utf8');
    assertIncludes(md, '# VT Fixture Page', 'title is the H1');
    assertIncludes(md, 'Hovedtitel', 'body heading kept');
    assertIncludes(md, `${base}/img/hero.png`, 'relative image resolved against the base URL');
    assertIncludes(md, `${base}/clips/v.mp4`, 'video URL captured');
    assert(!md.includes('ignore()'), 'script stripped');
    assertEqual(env.metrics.images, 1, 'image count metric');
    assert(provenanceRecords().some((p) => p.sourceUrl === `${base}/page` && p.tool === 'fetch-url'), 'provenance appended');
  });
});

test('VT1.2 fetch-url LIVE: 404 → clear failure + WebFetch escalation hint', async () => {
  await withServer(async (base) => {
    const r = await runTsxAsync('capabilities/acquire/fetch-url.ts', ['--url', `${base}/blocked`, '--project', '_tests']);
    assert(r.status !== 0, 'non-zero exit');
    const env = lastEnvelope(r.stdout);
    assertIncludes(env.error ?? '', 'fetch failed: 404', 'status surfaced');
    assertIncludes(env.error ?? '', 'WebFetch', 'escalation path named');
  });
});

test('VT1.3 download-asset LIVE: reference fetch → deliver/_tests/refs + sha256 + provenance', async () => {
  await withServer(async (base) => {
    const r = await runTsxAsync('capabilities/acquire/download-asset.ts', ['--url', `${base}/img.png`, '--project', '_tests']);
    assertEqual(r.status, 0, `download-asset exit:\n${r.stderr.slice(-600)}`);
    const env = lastEnvelope(r.stdout);
    const out = env.outputs[0];
    assertEqual(path.dirname(out), path.join(REPO_ROOT, 'deliver', '_tests', 'refs'), 'lands in the cockpit refs tree');
    assert(fs.existsSync(out) && fs.statSync(out).size > 0, 'bytes on disk');
    const m = env.metrics as { sha256: string; bytes: number; ship: boolean };
    assert(/^[a-f0-9]{64}$/.test(m.sha256) && m.bytes === fs.statSync(out).size, 'sha256 + byte count real');
    assertEqual(m.ship, false, 'reference (non-ship) mode');
    const rec = provenanceRecords().find((p) => p.sourceUrl === `${base}/img.png`);
    assert(!!rec && rec.usageIntent === 'reference', 'provenance usageIntent=reference');
  });
});

test('VT1.4 download-asset LIVE: --ship → public/_tests/refs (the staticFile tree)', async () => {
  await withServer(async (base) => {
    const r = await runTsxAsync('capabilities/acquire/download-asset.ts', ['--url', `${base}/img.png`, '--project', '_tests', '--ship', '--out', 'ship-hero.png']);
    assertEqual(r.status, 0, `ship exit:\n${r.stderr.slice(-600)}`);
    const env = lastEnvelope(r.stdout);
    assertEqual(path.dirname(env.outputs[0]), path.join(REPO_ROOT, 'public', '_tests', 'refs'), 'ship tree');
    assertEqual((env.metrics as { ship: boolean }).ship, true, 'ship flagged');
  });
});

test('VT1.5 download-asset LIVE: extension-less URL derives the filename from content-type', async () => {
  await withServer(async (base) => {
    const r = await runTsxAsync('capabilities/acquire/download-asset.ts', ['--url', `${base}/noext`, '--project', '_tests']);
    assertEqual(r.status, 0, `noext exit:\n${r.stderr.slice(-600)}`);
    assert(/\.png$/.test(lastEnvelope(r.stdout).outputs[0]), 'content-type image/png → .png');
  });
});

test('VT1.6 download-asset LIVE: --max-mb guard blocks an oversized body', async () => {
  await withServer(async (base) => {
    const r = await runTsxAsync('capabilities/acquire/download-asset.ts', ['--url', `${base}/big.bin`, '--project', '_tests', '--max-mb', '1']);
    assert(r.status !== 0, 'non-zero exit');
    assertIncludes(lastEnvelope(r.stdout).error ?? '', '--max-mb 1', 'cap named in the error');
  });
});

test('VT1.7 download-asset LIVE: 404 → clear failure envelope', async () => {
  await withServer(async (base) => {
    const r = await runTsxAsync('capabilities/acquire/download-asset.ts', ['--url', `${base}/missing.png`, '--project', '_tests']);
    assert(r.status !== 0, 'non-zero exit');
    assertIncludes(lastEnvelope(r.stdout).error ?? '', 'download failed: 404', 'status surfaced');
  });
});

test('VT1.8 setup-venv is idempotent: a healthy venv is left alone (fast no-op)', () => {
  // P0.2 already guarantees the suite runs with a healthy venv; this asserts re-running setup
  // does NOT rebuild it (the doc-13 §3 idempotency surface).
  const r = runTsx('capabilities/_env/setup-venv.ts', []);
  assertEqual(r.status, 0, `setup-venv exit:\n${r.stderr.slice(-400)}\n${r.stdout.slice(-400)}`);
  assertIncludes(r.stdout, 'venv already healthy', 'no-op path taken (use --recreate to rebuild)');
});
