import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';
import { test, expect } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';
import { MAIN_PROJECT_DIR } from '../../playwright.config.js';

/**
 * The Acquire MODAL, fully offline (doc 13 §5): an in-test 127.0.0.1 HTTP server serves a small PNG
 * + an HTML page — real sockets, zero internet. The acquire job spawns the REAL fetch-url /
 * download-asset capability CLIs (copied into the fixture by fixture.mjs), which fetch from the
 * local server. `what=asset` → tile with the acquired badge; `what=page` → markdown in the work
 * tree (asserted via fs); an invalid URL → the modal's inline error.
 *
 * The capabilities run in a child of the UI server process (same machine), so 127.0.0.1 is reachable.
 */

// a 1×1 transparent PNG (the smallest valid PNG) — content-type set so chooseFilename keeps `.png`.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const HTML =
  '<!doctype html><html><head><title>Acquire Fixture Page</title></head>' +
  '<body><h1>Local Reference</h1><p>A page of reference text served from 127.0.0.1.</p>' +
  '<img src="/img.png" /></body></html>';

let server: http.Server;
let base: string;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    if (url.startsWith('/img.png')) {
      res.writeHead(200, { 'content-type': 'image/png', 'content-length': PNG.length });
      res.end(PNG);
      return;
    }
    if (url.startsWith('/page')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(HTML);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('fixture server has no port');
  base = `http://127.0.0.1:${addr.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('acquire: asset → job done → tile with the acquired badge', async ({ page }) => {
  test.setTimeout(45_000);
  const guard = attachConsoleGuard(page);

  await page.goto('/#/project/e2e-demo');
  await page.getByTestId('open-acquire').click();
  await expect(page.getByTestId('acquire-modal')).toBeVisible();

  await page.getByTestId('acquire-url').fill(`${base}/img.png`);
  await page.locator('[data-acquire-what="asset"]').click();
  await page.getByTestId('acquire-fetch').click();

  // the modal closes on a queued job; the asset grid refreshes live when the job lands (done).
  await expect(page.getByTestId('acquire-modal')).toHaveCount(0);

  // the downloaded asset shows up as a tile carrying the acquired (provenance) badge.
  const badge = page.getByTestId('acquired-badge');
  await expect(badge.first()).toBeVisible({ timeout: 30_000 });
  await expect(badge.first()).toHaveAttribute('title', `${base}/img.png`);

  expect(guard.errors()).toEqual([]);
});

test('acquire: page → markdown lands in out/work/<p>/acquire/', async ({ page }) => {
  test.setTimeout(45_000);
  const guard = attachConsoleGuard(page);

  await page.goto('/#/project/e2e-demo');
  await page.getByTestId('open-acquire').click();
  await expect(page.getByTestId('acquire-modal')).toBeVisible();

  await page.getByTestId('acquire-url').fill(`${base}/page`);
  await page.locator('[data-acquire-what="page"]').click();
  await page.getByTestId('acquire-fetch').click();
  await expect(page.getByTestId('acquire-modal')).toHaveCount(0);

  // assert the capability wrote markdown into the work tree (the fetch-url contract).
  const acquireDir = path.join(MAIN_PROJECT_DIR, 'out', 'work', 'e2e-demo', 'acquire');
  await expect
    .poll(
      () => {
        try {
          return fs.readdirSync(acquireDir).filter((f) => f.endsWith('.md'));
        } catch {
          return [];
        }
      },
      { timeout: 30_000 },
    )
    .not.toHaveLength(0);

  const mdFile = fs.readdirSync(acquireDir).find((f) => f.endsWith('.md'))!;
  const md = fs.readFileSync(path.join(acquireDir, mdFile), 'utf8');
  expect(md).toContain('Acquire Fixture Page'); // the page <title> the capability extracts

  expect(guard.errors()).toEqual([]);
});

test('acquire: invalid URL → inline acquire-error, modal stays open', async ({ page }) => {
  const guard = attachConsoleGuard(page);

  await page.goto('/#/project/e2e-demo');
  await page.getByTestId('open-acquire').click();
  await expect(page.getByTestId('acquire-modal')).toBeVisible();

  await page.getByTestId('acquire-url').fill('not-a-real-url');
  await page.getByTestId('acquire-fetch').click();

  await expect(page.getByTestId('acquire-error')).toBeVisible();
  await expect(page.getByTestId('acquire-modal')).toBeVisible(); // never closed on a bad URL

  expect(guard.errors()).toEqual([]);
});
