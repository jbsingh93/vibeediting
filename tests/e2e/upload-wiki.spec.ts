import { test, expect } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';

/**
 * Cockpit assets upload (page.setInputFiles → the streamed multipart endpoint → public/<p>/, a tile
 * appears) and the capability wiki modal (📖 → sections parsed live from CAPABILITIES.md). Tiny
 * in-memory fixtures only — upload runs NOTHING automatic by design.
 */
test('assets: ＋ Import uploads a file → the tile appears', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto('/#/project/e2e-demo');
  await expect(page.getByTestId('asset-manager')).toBeVisible();

  await page.getByTestId('import-file-input').setInputFiles({
    name: 'sfx-pop.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.alloc(2048, 3),
  });

  const tile = page.locator('[data-testid="asset-tile"]', { hasText: 'sfx-pop.wav' });
  await expect(tile).toBeVisible({ timeout: 10_000 });
  await expect(tile).toHaveAttribute('data-asset-category', 'sfx');

  expect(guard.errors()).toEqual([]);
});

test('wiki: 📖 opens the modal → sections from CAPABILITIES.md; Esc closes', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto('/');

  await page.getByTestId('wiki-button').click();
  await expect(page.getByTestId('wiki-modal')).toBeVisible();
  await expect(page.getByTestId('wiki-search')).toBeFocused();

  // the numbered ## sections of the fixture's CAPABILITIES.md → sec-0 / sec-1 / sec-2
  await expect(page.locator('[data-wiki-section="sec-0"]')).toBeVisible();
  await expect(page.locator('[data-wiki-section="sec-1"]')).toBeVisible();
  await expect(page.locator('[data-wiki-section="sec-2"]')).toBeVisible();

  // search filters the section list
  await page.getByTestId('wiki-search').fill('ingest');
  await page.locator('[data-wiki-section="sec-1"]').click();
  await expect(page.getByTestId('wiki-content')).toContainText('transcribe');

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('wiki-modal')).toHaveCount(0);

  expect(guard.errors()).toEqual([]);
});
