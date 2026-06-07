import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the JBS Vibe Editing cockpit E2E suite (V4.7) — ported from the parent
 * system's discipline (seeded disposable project + mock agent + fake render; zero API spend, no real
 * renders) and adapted to vibe (course/persp coverage dropped; keys/brand/onboarding/wiki/styles
 * surfaces added). Single worker, no parallelism, no retries — every spec is serial-safe.
 *
 * THREE webServers boot against disposable trees `tests/e2e/fixture.mjs` recreates each run:
 *   - MAIN  :7882 — test-artifacts/e2e-project, the mock `claude` (VIBE_AGENT_BIN) drives turns,
 *                    fake-render stands in for `remotion render`. globalSetup seeds its manifests.
 *   - OFFLINE :7883 — same project, but VIBE_AGENT_BIN points at a missing file so agent turns
 *                    degrade to the offline banner; VIBE_UI_NO_WATCH so only ONE server watches the
 *                    shared dir (a second chokidar watcher on Windows trips rename EPERM).
 *   - EMPTY :7884 — test-artifacts/e2e-empty, a project-LESS tree for onboarding/keys/brand so those
 *                    specs mutate .env / brand.json without polluting the main fixture's semantics.
 *
 * The mock agent reads VIBE_PROJECTS_DIR to find the manifests it mutates — it MUST equal the
 * server's projects root (= <project>/projects), so we set it explicitly on every server.
 */
const PORT = 7882;
const OFFLINE_PORT = 7883;
const EMPTY_PORT = 7884;
const CODEX_PORT = 7885;

const REPO = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = path.join(REPO, 'test-artifacts');

export const MAIN_PROJECT_DIR = path.join(ARTIFACTS, 'e2e-project');
export const EMPTY_PROJECT_DIR = path.join(ARTIFACTS, 'e2e-empty');
export const CODEX_PROJECT_DIR = path.join(ARTIFACTS, 'e2e-codex');
export const MAIN_PROJECTS_ROOT = path.join(MAIN_PROJECT_DIR, 'projects');
export const EMPTY_PROJECTS_ROOT = path.join(EMPTY_PROJECT_DIR, 'projects');
export const CODEX_PROJECTS_ROOT = path.join(CODEX_PROJECT_DIR, 'projects');

export const MOCK_AGENT = path.join(REPO, 'tests', 'helpers', 'mock-agent.mjs');
export const MOCK_CODEX = path.join(REPO, 'tests', 'helpers', 'mock-codex.mjs');
export const FAKE_RENDER = path.join(REPO, 'tests', 'helpers', 'fake-render.mjs');
export const ARGV_LOG = path.join(ARTIFACTS, 'e2e-argv.log');
export const CODEX_ARGV_LOG = path.join(ARTIFACTS, 'e2e-codex-argv.log');
export const MOCK_SCENARIO_PATH = path.join(ARTIFACTS, 'e2e-mock-scenario.json');
const NO_SUCH_AGENT = path.join(ARTIFACTS, 'no-such-agent.exe');

export const OFFLINE_BASE = `http://127.0.0.1:${OFFLINE_PORT}`;
export const EMPTY_BASE = `http://127.0.0.1:${EMPTY_PORT}`;
export const CODEX_BASE = `http://127.0.0.1:${CODEX_PORT}`;

const FIXTURE = 'node tests/e2e/fixture.mjs';
const serve = (dir: string, port: number) =>
  `npx tsx bin/vibe.ts ui --project ${dir} --no-open --port ${port}`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'test-artifacts/playwright-html', open: 'never' }]]
    : 'list',
  outputDir: 'test-artifacts/playwright',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    testIdAttribute: 'data-testid',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: [
    {
      // MAIN — the fixture is recreated by THIS command (the first webServer to start), then the
      // server boots against it. global-setup seeds the deterministic manifests afterward.
      command: `${FIXTURE} && ${serve(MAIN_PROJECT_DIR, PORT)}`,
      url: `http://127.0.0.1:${PORT}/api/projects`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        VIBE_PROJECTS_DIR: MAIN_PROJECTS_ROOT,
        VIBE_UI_NO_OPEN: '1',
        VIBE_AGENT_BIN: MOCK_AGENT,
        VIBE_MOCK_ARGV_LOG: ARGV_LOG,
        VIBE_MOCK_SCENARIO: MOCK_SCENARIO_PATH,
        VIBE_RENDER_CMD: FAKE_RENDER,
      },
    },
    {
      // OFFLINE — same project dir; missing agent bin → offline degradation. No watcher (Windows).
      command: serve(MAIN_PROJECT_DIR, OFFLINE_PORT),
      url: `${OFFLINE_BASE}/api/projects`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        VIBE_PROJECTS_DIR: MAIN_PROJECTS_ROOT,
        VIBE_UI_NO_OPEN: '1',
        VIBE_UI_NO_WATCH: '1',
        VIBE_AGENT_BIN: NO_SUCH_AGENT,
      },
    },
    {
      // EMPTY — a project-less tree for onboarding/keys/brand. Watcher on (its own dir, no clash).
      command: serve(EMPTY_PROJECT_DIR, EMPTY_PORT),
      url: `${EMPTY_BASE}/api/projects`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        VIBE_PROJECTS_DIR: EMPTY_PROJECTS_ROOT,
        VIBE_UI_NO_OPEN: '1',
        VIBE_AGENT_BIN: MOCK_AGENT,
      },
    },
    {
      // CODEX — a tree whose vibe.config.json prefers `codex`; VIBE_CODEX_BIN points at the mock
      // codex CLI so the WS turn routes through the codex adapter (UI-level parity, codex.spec.ts).
      command: serve(CODEX_PROJECT_DIR, CODEX_PORT),
      url: `${CODEX_BASE}/api/projects`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        VIBE_PROJECTS_DIR: CODEX_PROJECTS_ROOT,
        VIBE_UI_NO_OPEN: '1',
        VIBE_CODEX_BIN: MOCK_CODEX,
        VIBE_MOCK_ARGV_LOG: CODEX_ARGV_LOG,
        VIBE_RENDER_CMD: FAKE_RENDER,
      },
    },
  ],
});
