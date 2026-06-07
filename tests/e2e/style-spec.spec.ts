import { test, expect } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';

/**
 * The style-spec card (doc 13 §5): a seeded *.style-spec.json under deliver/e2e-demo/refs/
 * (global-setup) renders in the Assets panel with its MEASURED signals; "Use as my style" PREFILLS
 * the chat composer (and does NOT auto-send) — the same deliberate-human-send discipline as the
 * wiki "ask the agent" affordance.
 */
test('style-spec: card renders measured signals; "use style" prefills the composer (no auto-send)', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto('/#/project/e2e-demo');

  // the card lives beneath the asset grid (Assets panel, visible in the default balanced layout).
  const card = page.getByTestId('style-spec-card').first();
  await expect(card).toBeVisible();
  await expect(card).toContainText('hormozi-ref'); // the spec name
  await expect(card).toContainText('-13.4 LUFS'); // a measured signal rendered from the JSON

  // record the agent feed length so we can prove NOTHING was sent.
  const userBubbles = page.locator('[data-testid="agent-feed"] >> text=Use this style-spec');

  await card.getByTestId('use-style').click();

  // the composer is now prefilled with the style ask…
  const composer = page.getByTestId('agent-input');
  await expect(composer).toHaveValue(/Use this style-spec as the style anchor for e2e-demo/);
  // …and it was NOT sent (no user bubble carrying that text in the feed).
  await expect(userBubbles).toHaveCount(0);

  expect(guard.errors()).toEqual([]);
});
