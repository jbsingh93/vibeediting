import * as fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';
import { ARGV_LOG } from '../../playwright.config.js';

/**
 * The agent loop, driven by the MOCK `claude` (VIBE_AGENT_BIN → mock-agent.mjs) — never the real CLI.
 * Proves: user message → streamed assistant bubble + glyph activity row; the agent's manifest edit
 * reflected LIVE on the stage strip (brain↔body unification, no reload); and --resume continuity
 * (turn 2's argv carries --resume in the argv log).
 */
test('agent: message → activity + bubble + live stage flip; turn 2 resumes', async ({ page }) => {
  const guard = attachConsoleGuard(page);

  await page.goto('/#/project/e2e-agent');
  await expect(page.getByTestId('agent-input')).toBeVisible();
  // ingest started running in global-setup → the mock completes it
  await expect(page.locator('[data-stage="ingest"]')).toHaveAttribute('data-stage-status', 'running');

  await page.getByTestId('agent-input').fill('make the ingest');
  await page.keyboard.press('Enter');

  // assistant text bubble streams in
  await expect(page.getByTestId('agent-feed')).toContainText('Planning the ingest', { timeout: 15_000 });
  // the activity row carries the capability + a glyph
  const activity = page.locator('[data-activity="ingest/transcribe"]');
  await expect(activity).toBeVisible();
  // the agent's manifest edit propagates live to the stage strip (watcher → /ws/manifests), no reload
  await expect(page.locator('[data-stage="ingest"]')).toHaveAttribute('data-stage-status', 'complete', {
    timeout: 10_000,
  });

  // turn 2 → the server passes --resume → the mock acknowledges + the argv log records it
  await page.getByTestId('agent-input').fill('continue');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('agent-feed')).toContainText('Resuming session', { timeout: 15_000 });

  await expect
    .poll(() => {
      try {
        return fs.readFileSync(ARGV_LOG, 'utf8');
      } catch {
        return '';
      }
    })
    .toContain('--resume');

  expect(guard.errors()).toEqual([]);
});
