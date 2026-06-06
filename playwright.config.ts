import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the JBS Vibe Editing UI E2E suite.
 *
 * The real suite arrives with the UI port (phase V4) — ported from the parent
 * system's E2E discipline (seeded temp project + mock agent + lavfi-synthesized
 * test media; no API spend). Until then `tests/e2e/` is empty and this config
 * just establishes the conventions: data-testid locators, single worker,
 * artifacts under test-artifacts/.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'test-artifacts/playwright-html' }]]
    : 'list',
  outputDir: 'test-artifacts/playwright',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.VIBE_UI_BASE_URL ?? 'http://127.0.0.1:7878',
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
});
