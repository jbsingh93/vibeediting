import { test, expect } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';

/**
 * The Render Queue surfaces (doc 13 §5): cancel a QUEUED job, retry a FAILED one, open the log
 * drawer — plus the unscoped-render chip on a seeded stray. Jobs are in-memory per server, so we
 * create them at runtime via the REAL endpoints (the deterministic fake-render seam + a capability
 * that has no script in the fixture → a clean `failed` job).
 */

test('queue: cancel a queued render; retry a failed job; log drawer opens', async ({ page }) => {
  test.setTimeout(45_000);
  const guard = attachConsoleGuard(page);

  // 1) two renders to populate the queue (the render lane is size 1).
  const r1 = await page.request.post('/api/render', {
    data: { compId: 'AdReel', preset: 'vertical-ad', outName: 'e2e-demo/q1', project: 'e2e-demo' },
  });
  expect(r1.ok()).toBeTruthy();
  const r2 = await page.request.post('/api/render', {
    data: { compId: 'AdReel', preset: 'vertical-ad', outName: 'e2e-demo/q2', project: 'e2e-demo' },
  });
  expect(r2.ok()).toBeTruthy();

  // 2) a guaranteed-failed capability job: ingest/probe is whitelisted but has no script in the
  //    fixture → no envelope → the job lands `failed` (then we retry it).
  const rf = await page.request.post('/api/run', {
    data: { verb: 'ingest/probe', args: ['--in', 'nope.mp4', '--project', 'e2e-demo'], project: 'e2e-demo' },
  });
  expect(rf.ok()).toBeTruthy();

  await page.goto('/#/queue');
  await expect(page.locator('[data-testid="job-row"]').first()).toBeVisible({ timeout: 10_000 });

  // a failed job appears → retry it (a fresh job is enqueued).
  const failed = page.locator('[data-job-status="failed"]').first();
  await expect(failed).toBeVisible({ timeout: 20_000 });
  const failedCountBefore = await page.locator('[data-job-status="failed"]').count();
  await failed.locator('[data-action="retry"]').click();
  // the retry enqueues a new row (it will fail again, but the action worked → more rows over time).
  await expect
    .poll(async () => page.locator('[data-testid="job-row"]').count())
    .toBeGreaterThanOrEqual(4);
  expect(failedCountBefore).toBeGreaterThanOrEqual(1);

  // the log drawer opens on any row and shows its (captured) output.
  const firstRow = page.locator('[data-testid="job-row"]').first();
  await firstRow.locator('[data-action="logs"]').click();
  await expect(page.getByTestId('job-log').first()).toBeVisible();

  expect(guard.errors()).toEqual([]);
});

test('queue: a cancellable (queued/running) job exposes the cancel action', async ({ page }) => {
  test.setTimeout(45_000);
  const guard = attachConsoleGuard(page);

  // queue two renders so at least one is queued/running with a cancel button.
  for (const name of ['c1', 'c2']) {
    const r = await page.request.post('/api/render', {
      data: { compId: 'AdReel', preset: 'vertical-ad', outName: `e2e-demo/${name}`, project: 'e2e-demo' },
    });
    expect(r.ok()).toBeTruthy();
  }

  await page.goto('/#/queue');
  const cancelBtn = page.locator('[data-action="cancel"]').first();
  await expect(cancelBtn).toBeVisible({ timeout: 10_000 });
  await cancelBtn.click();
  // a cancelled row appears (the queued one is killed immediately).
  await expect(page.locator('[data-job-status="cancelled"]').first()).toBeVisible({ timeout: 10_000 });

  expect(guard.errors()).toEqual([]);
});

test('queue: an unscoped stray render shows the unscoped chip in the renders panel', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto('/#/project/e2e-demo');
  await page.locator('[data-editor-tab="preview"]').click();

  // the renders panel lists the seeded deliver/stray-at-root.mp4 with the unscoped chip.
  await expect(page.getByTestId('renders-panel')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-render-unscoped]').first()).toBeVisible();

  expect(guard.errors()).toEqual([]);
});
