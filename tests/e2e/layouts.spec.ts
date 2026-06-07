import { test, expect } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';

/**
 * The tri-panel layout toggles (doc 13 §5): V-A/B/C/D each apply (panel presence changes per the
 * CSS-grid presets in lib/layout.ts) and the cockpit stays usable in each. The toggle only shows
 * while a project is open.
 *
 *   A (Balanced):     assets + agent + editor
 *   B (Conversation): assets + agent  (editor collapses to 0fr → unmounted)
 *   C (Editor):       assets + agent + editor (editor wide)
 *   D (Focus):        editor only     (assets + agent → 0fr → unmounted)
 */
test('layouts: V-A/B/C/D toggles change panel visibility and stay usable', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto('/#/project/e2e-demo');

  const assets = page.locator('[data-panel="assets"]');
  const agent = page.locator('[data-panel="agent"]');
  const editor = page.locator('[data-panel="editor"]');

  // A — balanced: all three panels present.
  await page.locator('[data-layout="A"]').click();
  await expect(assets).toBeVisible();
  await expect(agent).toBeVisible();
  await expect(editor).toBeVisible();

  // B — conversation: editor collapses (unmounted), the agent composer stays usable.
  await page.locator('[data-layout="B"]').click();
  await expect(editor).toHaveCount(0);
  await expect(agent).toBeVisible();
  await expect(page.getByTestId('agent-input')).toBeVisible();

  // C — editor: all three present again (editor gets the wide column).
  await page.locator('[data-layout="C"]').click();
  await expect(editor).toBeVisible();
  await expect(assets).toBeVisible();
  await expect(agent).toBeVisible();

  // D — focus/theater: only the editor; its tabs are still usable.
  await page.locator('[data-layout="D"]').click();
  await expect(assets).toHaveCount(0);
  await expect(agent).toHaveCount(0);
  await expect(editor).toBeVisible();
  await page.locator('[data-editor-tab="plan"]').click();
  await expect(page.getByTestId('plan-tab')).toBeVisible();

  // back to A leaves the cockpit fully usable.
  await page.locator('[data-layout="A"]').click();
  await expect(assets).toBeVisible();
  await expect(agent).toBeVisible();
  await expect(editor).toBeVisible();

  expect(guard.errors()).toEqual([]);
});
