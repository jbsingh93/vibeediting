import { test, expect } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';

/**
 * D14 — "Save as Template" on e2e-demo's Preview tab. The seeded deliver render makes RendersPanel
 * show a row → Save as Template → form → submit → the 202 "distilling…" note, AND the distiller's
 * agent turn persists its prompt to projects/<p>/chat.jsonl (asserted via the chat API).
 */
test('distill: Save as Template → distilling note + the distill prompt lands in the transcript', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto('/#/project/e2e-demo');

  await page.locator('[data-editor-tab="preview"]').click();
  const panel = page.getByTestId('renders-panel');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-testid="render-row"]').first()).toBeVisible();

  await page.getByTestId('open-save-template').click();
  await expect(page.getByTestId('distill-form')).toBeVisible();
  await page.getByTestId('distill-name').fill('e2e-distilled');
  await page.getByTestId('distill-submit').click();

  await expect(page.getByTestId('distill-note')).toContainText('distilling');

  // the distiller turn (mock claude) persisted its prompt to chat.jsonl → visible via the chat API
  await expect
    .poll(async () => {
      const r = await page.request.get('/api/projects/e2e-demo/chat');
      const body = (await r.json()) as { entries: { t: string; text?: string }[] };
      return body.entries.some((e) => e.t === 'user' && /template-distiller/.test(e.text ?? ''));
    }, { timeout: 15_000 })
    .toBe(true);

  expect(guard.errors()).toEqual([]);
});
