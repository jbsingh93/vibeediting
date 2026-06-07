import { test, expect } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';

/**
 * e2e-demo Deliver tab → queue a render (the fake-render seam stands in for `remotion render`) → the
 * job row appears in #/queue, runs with progress, and completes LIVE over /ws/jobs (no reload).
 */
test('deliver: queue a render → job row appears in #/queue and completes live', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto('/#/project/e2e-demo');

  await page.locator('[data-editor-tab="deliver"]').click();
  await expect(page.getByTestId('deliver-panel')).toBeVisible();
  // loudnorm is ON by default (the delivery hard rule)
  await expect(page.getByTestId('loudnorm-toggle')).toBeChecked();

  await page.getByTestId('deliver-queue').click();
  await expect(page.getByTestId('deliver-queued')).toContainText('queued');

  // the queue shows the row and it reaches `done` live
  await page.goto('/#/queue');
  const rows = page.locator('[data-testid="job-row"]');
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-job-status="done"]').first()).toBeVisible({ timeout: 30_000 });

  // the disk footer renders
  await expect(page.getByTestId('queue-footer')).toContainText('GB');

  expect(guard.errors()).toEqual([]);
});

/** A dry-run queues the real render-preset stub (--dry-run envelope) — its capability name shows in
 *  the log drawer. */
test('deliver: dry-run queues the capability job; log shows the envelope', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto('/#/project/e2e-demo');
  await page.locator('[data-editor-tab="deliver"]').click();
  await expect(page.getByTestId('deliver-panel')).toBeVisible();

  await page.getByTestId('deliver-dry-run').click();
  await expect(page.getByTestId('deliver-queued')).toContainText('dry-run job(s) queued');

  await page.goto('/#/queue');
  const row = page.locator('[data-testid="job-row"]').first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-job-status="done"]').first()).toBeVisible({ timeout: 30_000 });
  await row.locator('[data-action="logs"]').click();
  await expect(page.getByTestId('job-log').first()).toContainText('deliver/render-preset');

  expect(guard.errors()).toEqual([]);
});
