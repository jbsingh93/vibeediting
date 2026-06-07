import { test, expect } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';

/** #/health renders the doctor report (server-side `vibe doctor`): agent rows + the
 *  "Modified engine files" row, and Re-run works. */
test('health: doctor report renders with agent rows + modified-engine-files; re-run works', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto('/#/health');

  await expect(page.getByRole('heading', { name: 'System health' })).toBeVisible();
  // doctor runs server-side (spawns tsx, cold) — allow generous time
  await expect(page.getByTestId('health-table')).toBeVisible({ timeout: 25_000 });

  // a known check is present
  await expect(page.locator('[data-check="node"]')).toBeVisible();
  // at least one agent-CLI row (claude / codex / agent)
  await expect(page.locator('[data-check="claude"], [data-check="codex"], [data-check="agent"]').first()).toBeVisible();

  // the engine-divergence row
  await expect(page.getByTestId('modified-engine-files')).toBeVisible();

  // re-run reloads the table without a console error
  await page.getByRole('button', { name: /Re-run doctor/i }).click();
  await expect(page.getByTestId('health-table')).toBeVisible({ timeout: 25_000 });

  expect(guard.errors()).toEqual([]);
});

test('health: the top-bar health dot links to the health screen', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto('/');
  await page.getByRole('link', { name: /system health/i }).click();
  await expect(page.getByRole('heading', { name: 'System health' })).toBeVisible();
  expect(guard.errors()).toEqual([]);
});
