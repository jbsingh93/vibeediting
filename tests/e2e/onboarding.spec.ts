import { test, expect } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';
import { EMPTY_BASE } from '../../playwright.config.js';

/**
 * The first-run onboarding strip — targets the EMPTY server (:7884, no seeded projects) so the
 * project-less Home renders <Onboarding/>. Steps 1/2 are NOT done (required keys unset, brand name is
 * the placeholder 'My Brand'); the step links deep-link to #/keys and #/brand.
 */
test('onboarding: strip shows on the empty Home; steps not done; links navigate', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto(`${EMPTY_BASE}/`);

  await expect(page.getByTestId('onboarding')).toBeVisible();
  // all three steps render
  await expect(page.getByTestId('onboarding-keys')).toBeVisible();
  await expect(page.getByTestId('onboarding-brand')).toBeVisible();
  await expect(page.getByTestId('onboarding-create')).toBeVisible();

  // steps 1/2 are not complete (a done step has the success border + a ✓; an undone one shows the hint).
  // The hint copy only renders once the async check resolves (not 'checking…').
  await expect(page.getByTestId('onboarding-keys')).toContainText('OpenAI', { timeout: 10_000 });
  await expect(page.getByTestId('onboarding-brand')).toContainText('Colors, tone', { timeout: 10_000 });

  // links deep-link into the keys / brand pages
  await page.getByTestId('onboarding-keys').click();
  await expect(page).toHaveURL(/#\/keys$/);
  await expect(page.getByTestId('keys-screen')).toBeVisible();

  await page.goto(`${EMPTY_BASE}/`);
  await page.getByTestId('onboarding-brand').click();
  await expect(page).toHaveURL(/#\/brand$/);
  await expect(page.getByTestId('brand-screen')).toBeVisible();

  expect(guard.errors()).toEqual([]);
});
