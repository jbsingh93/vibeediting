import { test, expect } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';

/** The home gallery renders the seeded manifests with status by WORD, click-through to the cockpit,
 *  and NO onboarding strip while projects exist. */
test('gallery: seeded projects visible with status words; no onboarding strip', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

  await expect(page.locator('[data-project="e2e-demo"]')).toBeVisible();
  await expect(page.locator('[data-project="e2e-gate"]')).toBeVisible();
  await expect(page.locator('[data-project="e2e-agent"]')).toBeVisible();

  // status by word, not colour alone (the StatusPill text)
  await expect(page.locator('[data-project="e2e-gate"]')).toContainText('blocked');
  // e2e-gate surfaces its blocked stage word too
  await expect(page.locator('[data-project="e2e-gate"]')).toContainText('motion');

  // there ARE projects → the first-run onboarding strip must not render
  await expect(page.getByTestId('onboarding')).toHaveCount(0);

  expect(guard.errors()).toEqual([]);
});

test('gallery: clicking a card lands in the cockpit', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto('/');

  await page.locator('[data-project="e2e-demo"]').click();
  await expect(page).toHaveURL(/#\/project\/e2e-demo/);
  await expect(page.locator('h1')).toContainText('e2e-demo');
  await expect(page.getByTestId('stage-strip')).toBeVisible();

  expect(guard.errors()).toEqual([]);
});
