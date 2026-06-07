/** P1F — acquire: HTML→Markdown extraction, asset filename/hash, provenance, yt-dlp wiring. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertEqual } from './harness';
import { lastEnvelope, runPy } from './fixtures';
import { REPO_ROOT } from '../_env/contract';
import { htmlToMarkdown } from '../acquire/fetch-url';
import { chooseFilename, refsDir, sha256 } from '../acquire/download-asset';
import { acquireProvenancePath, appendAcquireRecord } from '../acquire/provenance';

test('P1F.1 htmlToMarkdown extracts title, text, and embedded media URLs', () => {
  const html = `<html><head><title>Vibe Test</title></head><body>
    <h1>Hovedtitel</h1><p>Dette er en test af &aelig;&oslash;&aring;.</p>
    <img src="/img/hero.png"><video src="https://x.com/v.mp4"></video>
    <script>ignore()</script></body></html>`;
  const page = htmlToMarkdown(html, 'https://example.com/post');
  assertEqual(page.title, 'Vibe Test', 'title extracted');
  assert(/Hovedtitel/.test(page.markdown), 'heading kept');
  assert(/test af/.test(page.markdown), 'body text kept');
  assert(!/ignore\(\)/.test(page.markdown), 'script stripped');
  assert(page.images.some((u) => u === 'https://example.com/img/hero.png'), 'relative image resolved');
  assert(page.videos.includes('https://x.com/v.mp4'), 'video URL captured');
});

test('P1F.3 chooseFilename prefers URL name, falls back to content-type', () => {
  assertEqual(chooseFilename('https://x.com/a/logo.png', null), 'logo.png', 'use url filename');
  assert(/\.mp4$/.test(chooseFilename('https://x.com/watch?v=abc', 'video/mp4')), 'derive from content-type');
});

test('P1F.3 sha256 is deterministic', () => {
  assertEqual(sha256(Buffer.from('vibe')), sha256(Buffer.from('vibe')), 'stable hash');
  assert(sha256(Buffer.from('a')) !== sha256(Buffer.from('b')), 'distinct inputs differ');
});

test('P1F.4 appendAcquireRecord writes a provenance JSON array', () => {
  appendAcquireRecord('_tests', { sourceUrl: 'https://x.com', fetchedAt: new Date().toISOString(), localPath: 'x', tool: 'unit-test' });
  const p = acquireProvenancePath('_tests');
  assert(fs.existsSync(p), 'provenance.json written');
  const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert(Array.isArray(arr) && arr.length >= 1, 'is a non-empty array');
});

test('P1F.2 download-media.py wires yt-dlp to the FULL ffmpeg build (dry-run)', () => {
  const r = runPy('capabilities/acquire/download-media.py', ['--url', 'https://youtube.com/watch?v=x', '--project', '_tests', '--dry-run']);
  assertEqual(r.status, 0, `dry-run exit:\n${r.stderr.slice(-400)}`);
  const m = lastEnvelope(r.stdout).metrics;
  const ffmpegBin = path.join(String(m.ffmpeg_location), process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  assert(fs.existsSync(ffmpegBin), `merges with the full ffmpeg (no binary at ${ffmpegBin})`);
  assert(!!m.yt_dlp, 'yt-dlp present');
  // THE COCKPIT CONTRACT: media must land where the Asset Manager lists (deliver/<p>/refs/) — the
  // server side adopted deliver/ at V4 while the engine still wrote test-video/, so acquired files
  // were invisible in the UI (live-found by the V5d acquire walk).
  const expectedDir = path.join(REPO_ROOT, 'deliver', '_tests', 'refs');
  assertEqual(path.dirname(String(m.outtmpl)), expectedDir, 'yt-dlp outtmpl targets deliver/<p>/refs/');
});

test('P1F.5 refsDir routes ship→public/<p>/refs and reference→deliver/<p>/refs (the cockpit trees)', () => {
  assertEqual(refsDir('_tests', true), path.join(REPO_ROOT, 'public', '_tests', 'refs'), 'ship tree');
  assertEqual(refsDir('_tests', false), path.join(REPO_ROOT, 'deliver', '_tests', 'refs'), 'reference tree');
});
