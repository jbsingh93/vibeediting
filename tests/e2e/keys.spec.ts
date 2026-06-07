import { test, expect } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';
import { EMPTY_BASE } from '../../playwright.config.js';

/**
 * #/keys on the EMPTY server (:7884) so writes land in test-artifacts/e2e-empty/.env without
 * touching the main fixture's .env semantics. Paste → Save → masked value + set; Remove → not set.
 * The Test button hits the REAL provider, so we never click it (probes are integration-tested) — we
 * only assert it is enabled once a key is set.
 */
test('keys: paste → save → masked + Test enabled; remove → not set', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto(`${EMPTY_BASE}/#/keys`);

  await expect(page.getByTestId('keys-screen')).toBeVisible();
  const row = page.getByTestId('key-row-OPENAI_API_KEY');
  await expect(row).toBeVisible();
  await expect(row).toContainText('not set');
  // a key that isn't set can't be tested
  await expect(page.getByTestId('key-test-OPENAI_API_KEY')).toBeDisabled();

  // paste a fake value and save (it never leaves the machine; we don't probe it)
  await page.getByTestId('key-input-OPENAI_API_KEY').fill('sk-e2e-fake-value-1234567890');
  await page.getByTestId('key-save-OPENAI_API_KEY').click();

  await expect(page.getByTestId('keys-note')).toContainText('saved');
  await expect(page.getByTestId('key-masked-OPENAI_API_KEY')).toBeVisible();
  await expect(page.getByTestId('key-masked-OPENAI_API_KEY')).toContainText('…');
  // now set → Test is enabled (but we DO NOT click it — no network in E2E)
  await expect(page.getByTestId('key-test-OPENAI_API_KEY')).toBeEnabled();

  // Remove → back to not-set
  await page.getByRole('button', { name: /^Remove$/ }).first().click();
  await expect(row).toContainText('not set');
  await expect(page.getByTestId('key-masked-OPENAI_API_KEY')).toHaveCount(0);

  expect(guard.errors()).toEqual([]);
});
