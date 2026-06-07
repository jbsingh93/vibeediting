import * as fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';
import { MOCK_SCENARIO_PATH } from '../../playwright.config.js';

/**
 * AskUserQuestion → an answerable QUESTION CARD in the chat. A scenario file (VIBE_MOCK_SCENARIO,
 * read by mock-agent.mjs when it EXISTS at invocation) carries a question payload; the mock plays it.
 * Single-select fast path: one option click answers, sent as the next turn ("My answers: … <header>:
 * <label>"). No headless tool-error row leaks into the feed.
 */
test('question: card with options → click answer → sent as the next turn', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  test.setTimeout(45_000);

  await page.goto('/#/project/e2e-agent');
  await expect(page.getByTestId('agent-input')).toBeVisible();

  fs.writeFileSync(
    MOCK_SCENARIO_PATH,
    JSON.stringify({
      question: {
        questions: [
          {
            question: 'Which style should the intro have?',
            header: 'Style',
            multiSelect: false,
            options: [
              { label: 'Apple-keynote', description: 'calm premium' },
              { label: 'Hormozi', description: 'fast cuts' },
            ],
          },
        ],
      },
      reply: 'Pick one above and I will continue.',
    }),
  );

  try {
    await page.getByTestId('agent-input').fill('Make a channel intro');
    await page.keyboard.press('Enter');

    const card = page.getByTestId('question-card');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText('Which style should the intro have?');
    // the headless AskUserQuestion never leaks as an error activity row
    await expect(page.locator('[data-activity-status="error"]')).toHaveCount(0);

    // remove the scenario so the NEXT turn is the default transcript (Resuming…)
    fs.rmSync(MOCK_SCENARIO_PATH, { force: true });

    // single-select fast path: one click answers
    await card.locator('[data-question-option="Apple-keynote"]').click();
    await expect(page.getByTestId('question-answered')).toBeVisible();
    await expect(page.getByTestId('agent-feed')).toContainText('My answers:');
    await expect(page.getByTestId('agent-feed')).toContainText('Style: Apple-keynote');
    // the answer started a real --resume turn (the mock replies)
    await expect(page.getByTestId('agent-feed')).toContainText('Resuming session', { timeout: 15_000 });
  } finally {
    fs.rmSync(MOCK_SCENARIO_PATH, { force: true });
  }

  expect(guard.errors()).toEqual([]);
});
