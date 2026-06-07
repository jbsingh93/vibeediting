import { test, expect } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';

/** e2e-gate: the blocked motion gate card → Approve → the stage completes live. */
test('gate: blocked motion → Approve → stage completes', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto('/#/project/e2e-gate');

  const gate = page.locator('[data-gate-card="motion"]');
  await expect(gate).toBeVisible();
  await expect(gate).toContainText('Plan gate'); // motion is the plan-gate stage
  await expect(page.locator('[data-stage="motion"]')).toHaveAttribute('data-stage-status', 'blocked');

  await gate.locator('[data-action="approve"]').click();

  await expect(page.locator('[data-stage="motion"]')).toHaveAttribute('data-stage-status', 'complete', {
    timeout: 10_000,
  });
  await expect(gate).toHaveCount(0); // the card unmounts once the gate clears

  expect(guard.errors()).toEqual([]);
});

/** Ctrl+Enter approves the focused gate (doc 08 §8) — on the dedicated e2e-gate2 fixture. */
test('gate: Ctrl+Enter approves the focused gate', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto('/#/project/e2e-gate2');

  const gate = page.locator('[data-gate-card="motion"]');
  await expect(gate).toBeVisible();
  await gate.focus();
  await page.keyboard.press('Control+Enter');

  await expect(page.locator('[data-stage="motion"]')).toHaveAttribute('data-stage-status', 'complete', {
    timeout: 10_000,
  });

  expect(guard.errors()).toEqual([]);
});

/**
 * V5 regression — the kickoff-flow shape: plan parked in notes while the gate stage is still
 * PENDING (no amber GateCard). The Plan tab must offer the plan-approve affordance, and clicking
 * it approves the gate stage + hands the agent its "proceed" turn (the approve_plan WS intent).
 */
test('plan: pending gate stage still gets an Approve-plan affordance', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto('/#/project/e2e-plan');
  await page.locator('[data-editor-tab="plan"]').click();
  await expect(page.getByTestId('plan-tab')).toBeVisible();

  // no blocked gate → no amber card, but the cost chip + approve button are there
  await expect(page.locator('[data-gate-card]')).toHaveCount(0);
  await expect(page.getByTestId('plan-cost-chip')).toBeVisible();
  const approve = page.getByTestId('plan-approve');
  await expect(approve).toBeVisible();
  await approve.click();

  // the intent approves the manifest's gate stage (status stays pending, approved=true)…
  await expect(page.getByTestId('plan-gate-status')).toContainText('approved ✓', { timeout: 15_000 });
  // …and the affordance disappears (already approved)
  await expect(approve).toHaveCount(0);

  expect(guard.errors()).toEqual([]);
});

/** D19 — the plan tab's amber cost chip surfaces the `Estimated cost: $1.23` line from notes. */
test('plan: the amber cost chip shows $1.23 on e2e-demo', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto('/#/project/e2e-demo');
  await page.locator('[data-editor-tab="plan"]').click();
  await expect(page.getByTestId('plan-tab')).toBeVisible();

  await expect(page.getByTestId('plan-cost-chip')).toBeVisible();
  await expect(page.getByTestId('plan-cost-amount')).toHaveText('$1.23');

  expect(guard.errors()).toEqual([]);
});
