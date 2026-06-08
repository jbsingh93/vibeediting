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

/**
 * VE.6 codex parity: the range-scoped "Ask Editor Agent" affordance prefills the SAME shared composer
 * and the turn routes through the codex adapter (no new transport, D29). The disk-diff accept card is
 * backend-agnostic (proven on the main/claude leg); here we prove the prefill + codex turn routing.
 */
test('codex: range "Ask Editor Agent" prefills the composer and the turn runs through codex', async ({ page }) => {
  test.setTimeout(60_000);
  const guard = attachConsoleGuard(page);

  await page.goto(`${CODEX_BASE}/#/project/e2e-codex-edl`);
  await expect(page.getByTestId('agent-input')).toBeVisible();
  await page.locator('[data-editor-tab="finetune"]').click();
  await expect(page.getByTestId('finetune')).toBeVisible();
  await expect(page.getByTestId('ft-segment')).toHaveCount(3);

  // drag a range → the Ask-Editor-Agent affordance appears (bring the ruler into view first — the
  // editor shares vertical space with the player in the project workspace).
  const ruler = page.getByTestId('ft-ruler');
  await ruler.scrollIntoViewIfNeeded();
  const rb = await ruler.boundingBox();
  if (!rb) throw new Error('no ruler box');
  const y = rb.y + rb.height / 2;
  await page.mouse.move(rb.x + 8, y);
  await page.mouse.down();
  await page.mouse.move(rb.x + rb.width * 0.5, y, { steps: 8 });
  await page.mouse.move(rb.x + rb.width - 8, y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('ft-range-window')).toBeVisible();
  await expect(page.getByTestId('ft-range-ask-agent')).toBeVisible();

  // prefill (VE.6.1) → the visible scope prefix lands in the shared composer
  await page.getByTestId('ft-range-ask-agent').click();
  const input = page.getByTestId('agent-input');
  await expect(input).toHaveValue(/^\[Editing range \d+:\d{2}–\d+:\d{2} · affects segments\.json\] $/);

  // send → the codex adapter streams the turn (agent_message → assistant bubble), turn ends
  await input.click();
  await input.press('End');
  await input.pressSequentially('tighten this window');
  await input.press('Enter');
  await expect(page.getByTestId('agent-feed')).toContainText('Probed the clip and wrote the brief', { timeout: 20_000 });
  await expect(page.getByText('agent working…')).toHaveCount(0, { timeout: 15_000 });

  expect(guard.errors()).toEqual([]);
});
