import * as fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';
import { MOCK_SCENARIO_PATH, ARGV_LOG } from '../../playwright.config.js';

/**
 * Agent-failure recovery (doc 13 §5): a mock scenario (e2eFail) ERRORS mid-turn — a tool_result with
 * is_error:true + a result is_error:true. The UI surfaces the failure (an activity row with status
 * 'error'), the turn ENDS so the composer re-enables, and a SECOND turn recovers normally with
 * --resume intact (argv log). The error text is persisted to chat.jsonl by the adapter.
 */
test('agent-fail: errored turn surfaces, composer re-enabled, second turn recovers (--resume)', async ({ page }) => {
  test.setTimeout(60_000);
  const guard = attachConsoleGuard(page);

  await page.goto('/#/project/e2e-agent-fail');
  await expect(page.getByTestId('agent-input')).toBeVisible();

  fs.writeFileSync(MOCK_SCENARIO_PATH, JSON.stringify({ e2eFail: true }));

  try {
    await page.getByTestId('agent-input').fill('transcribe the clip');
    await page.keyboard.press('Enter');

    // failure surface: the errored tool step shows as an error activity row…
    await expect(page.locator('[data-activity-status="error"]').first()).toBeVisible({ timeout: 15_000 });
    // …and the agent's failure message streams into the feed.
    await expect(page.getByTestId('agent-feed')).toContainText('The turn failed', { timeout: 15_000 });

    // the turn ENDED → "agent working…" is gone and the composer accepts input again.
    await expect(page.getByText('agent working…')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId('agent-input')).toBeEnabled();

    // recover: remove the scenario so the next turn is the default (successful) transcript.
    fs.rmSync(MOCK_SCENARIO_PATH, { force: true });

    await page.getByTestId('agent-input').fill('try again');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('agent-feed')).toContainText('Resuming session', { timeout: 15_000 });

    // continuity: the recovery turn carried --resume.
    await expect
      .poll(() => {
        try {
          return fs.readFileSync(ARGV_LOG, 'utf8');
        } catch {
          return '';
        }
      })
      .toContain('--resume');
  } finally {
    fs.rmSync(MOCK_SCENARIO_PATH, { force: true });
  }

  expect(guard.errors()).toEqual([]);
});
