import { test, expect } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';
import { OFFLINE_BASE } from '../../playwright.config.js';

/**
 * Graceful degradation: against the OFFLINE server (:7883, VIBE_AGENT_BIN points at a missing file),
 * sending a message shows the offline banner and the rest of the cockpit still works.
 */
test('agent offline: banner appears, cockpit still navigable', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto(`${OFFLINE_BASE}/#/project/e2e-agent`);
  await expect(page.getByTestId('agent-input')).toBeVisible();

  await page.getByTestId('agent-input').fill('plan me a 9:16 ad');
  await page.keyboard.press('Enter');

  const banner = page.getByTestId('agent-offline');
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await expect(banner).toContainText('claude login');

  // the GUI still works offline — the stage strip renders, navigation works
  await expect(page.getByTestId('stage-strip')).toBeVisible();
  await expect(page.locator('[data-stage="ingest"]')).toBeVisible();

  expect(guard.errors()).toEqual([]);
});
