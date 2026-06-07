import { test, expect } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';

/**
 * The new-project wizard: #/new chooser → wizard, step 1 formats (7 incl. the generic 'edit-footage'),
 * step 2 fetches styles (builtins + the seeded `my-e2e-style` with the "yours" badge, first style
 * preselected), complete steps → create → lands in the cockpit; the manifest is real (asserted via
 * GET /api/projects). The created id is unique per run (the fixture recreates trees each run).
 */
test('wizard: chooser → 4 steps → create → cockpit + manifest', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  const id = 'e2e-wizard-made';

  await page.goto('/');
  await page.getByTestId('new-video').click();
  await expect(page.getByTestId('new-chooser')).toBeVisible();
  await page.getByTestId('choose-wizard').click();
  await expect(page.getByTestId('wizard')).toBeVisible();

  // ① format — 7 cards incl. the generic 'edit-footage'
  await expect(page.locator('[data-format]')).toHaveCount(7);
  await expect(page.locator('[data-format="edit-footage"]')).toBeVisible();
  await page.locator('[data-format="9:16-ad"]').click();
  await page.getByTestId('wizard-next').click();

  // ② style — builtins + the user's "yours" style; the first style is preselected
  await expect(page.getByTestId('wizard-styles')).toBeVisible();
  await expect(page.locator('[data-style="my-e2e-style"]')).toBeVisible();
  await expect(page.locator('[data-style="my-e2e-style"]').getByTestId('style-yours-badge')).toBeVisible();
  // the first style card carries the selected glyph (default selection applied)
  await expect(page.locator('[data-style]').first()).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-style="my-e2e-style"]').click();
  await page.getByTestId('wizard-next').click();

  // ③ brief
  await page.getByTestId('wizard-name').fill('e2e wizard made');
  await page.getByTestId('wizard-hook').fill('AI took your job');
  await page.getByTestId('wizard-cta').fill('Follow for more');
  await page.getByTestId('wizard-next').click();

  // ④ assets → create
  await page.getByTestId('wizard-create').click();

  // lands in the cockpit
  await expect(page).toHaveURL(new RegExp(`#/project/${id}`));
  await expect(page.locator('h1')).toContainText(id);

  // the manifest is real — visible through the projects API
  await expect
    .poll(async () => {
      const r = await page.request.get('/api/projects');
      const body = (await r.json()) as { projects: { project_id: string }[] };
      return body.projects.some((p) => p.project_id === id);
    })
    .toBe(true);

  // the wizard kickoff reached the agent (mock streams a reply)
  await expect(page.getByTestId('agent-feed')).toContainText('was just created from the JBS Vibe Editing wizard', {
    timeout: 15_000,
  });

  expect(guard.errors()).toEqual([]);
});

test('wizard: Next is blocked without a format; bad name blocks create', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto('/#/new/wizard');

  await expect(page.getByTestId('wizard-next')).toBeDisabled(); // no format picked
  await page.locator('[data-format="16:9-tutorial"]').click();
  await expect(page.getByTestId('wizard-next')).toBeEnabled();

  await page.getByTestId('wizard-next').click(); // → style
  await page.getByTestId('wizard-next').click(); // → brief
  await page.getByTestId('wizard-name').fill('!!!'); // reduces to an invalid slug
  await expect(page.getByTestId('wizard-next')).toBeDisabled();

  await page.getByTestId('wizard-name').fill('ok-name');
  await expect(page.getByTestId('wizard-next')).toBeEnabled();

  expect(guard.errors()).toEqual([]);
});
