/** P1F — acquire: HTML→Markdown extraction, asset filename/hash, provenance, yt-dlp wiring. */
import * as fs from 'node:fs';
import { test, assert, assertEqual } from './harness';
import { lastEnvelope, runPy } from './fixtures';
import { htmlToMarkdown } from '../acquire/fetch-url';
import { chooseFilename, sha256 } from '../acquire/download-asset';
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
  assert(String(m.ffmpeg_location).toLowerCase().includes('ffmpeg'), 'merges with the full ffmpeg');
  assert(!!m.yt_dlp, 'yt-dlp present');
});
