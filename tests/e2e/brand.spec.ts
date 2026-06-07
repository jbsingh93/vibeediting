import { test, expect } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';
import { EMPTY_BASE } from '../../playwright.config.js';

/**
 * #/brand on the EMPTY server (:7884): edit the name + accent colour → Save → the success note,
 * persisted across reload. "Let the agent set this up" with no projects shows the honest note (the
 * agent works inside a project chat — there's none on the empty server).
 */
test('brand: edit name + accent → save → note; persists across reload', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto(`${EMPTY_BASE}/#/brand`);

  await expect(page.getByTestId('brand-screen')).toBeVisible();
  const name = page.getByTestId('brand-name');
  await expect(name).toBeVisible();

  await name.fill('Acme E2E');
  // set the accent colour input (a native <input type=color> — set its value directly)
  await page.getByTestId('brand-color-accent').fill('#ff8800');
  await page.getByTestId('brand-save').click();

  await expect(page.getByTestId('brand-note')).toContainText('Saved');

  // reload → the saved name is read back from brand.json
  await page.reload();
  await expect(page.getByTestId('brand-name')).toHaveValue('Acme E2E');

  expect(guard.errors()).toEqual([]);
});

test('brand: "let the agent set this up" with no projects shows the honest note', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto(`${EMPTY_BASE}/#/brand`);

  await expect(page.getByTestId('brand-ask-agent')).toBeVisible();
  await page.getByTestId('brand-ask-agent').click();
  // no project exists on the empty server → the agent can't be reached; the honest note appears
  await expect(page.getByTestId('brand-note')).toContainText('Create a project first');

  expect(guard.errors()).toEqual([]);
});
