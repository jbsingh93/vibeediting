import * as fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';
import { CODEX_BASE, CODEX_ARGV_LOG } from '../../playwright.config.js';

/**
 * Codex UI parity (doc 13 §5): a dedicated server leg (:7885) whose project prefers `agent: 'codex'`
 * (vibe.config.json) with VIBE_CODEX_BIN pointing at the mock codex CLI. The WS turn routes through
 * the codex adapter; its JSONL transcript maps to the SAME AgentEvent union the UI renders — so a
 * sent message streams assistant text + a capability activity row, the turn ends (done), and a
 * second turn resumes the thread (`exec resume <id>` in the codex argv log).
 */
test('codex: message → streamed text + activity + done; turn 2 resumes the thread', async ({ page }) => {
  test.setTimeout(60_000);
  const guard = attachConsoleGuard(page);

  await page.goto(`${CODEX_BASE}/#/project/e2e-codex`);
  await expect(page.getByTestId('agent-input')).toBeVisible();

  await page.getByTestId('agent-input').fill('plan a short product reel');
  await page.keyboard.press('Enter');

  // the codex agent_message maps to a streamed assistant bubble…
  await expect(page.getByTestId('agent-feed')).toContainText('Probed the clip and wrote the brief', { timeout: 15_000 });
  // …and the command_execution maps to a glyph activity row (Bash classifier parity).
  await expect(page.locator('[data-activity]').first()).toBeVisible();
  // turn ended → composer usable again.
  await expect(page.getByText('agent working…')).toHaveCount(0, { timeout: 15_000 });

  // turn 2 → the adapter passes `exec resume <thread_id>` → the mock + argv log record it.
  await page.getByTestId('agent-input').fill('continue');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('agent-feed')).toContainText('Probed the clip and wrote the brief', { timeout: 15_000 });

  await expect
    .poll(() => {
      try {
        return fs.readFileSync(CODEX_ARGV_LOG, 'utf8');
      } catch {
        return '';
      }
    })
    .toContain('resume');

  expect(guard.errors()).toEqual([]);
});
