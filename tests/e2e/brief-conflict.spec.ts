import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, expect } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';
import { MAIN_PROJECTS_ROOT } from '../../playwright.config.js';

/**
 * Brief edit/save conflict (doc 13 §5): the user edits brief.md in the UI; the file changes on disk
 * underneath (the agent's class of write); Save sends the stale `expect` sha → the server returns
 * 409 file-changed → the UI surfaces the conflict banner with a recovery path ("Load theirs").
 *
 * Uses e2e-demo's seeded brief; no other spec edits brief.md, and the fixture is recreated each run.
 */
const PROJECT = 'e2e-demo';
const BRIEF = path.join(MAIN_PROJECTS_ROOT, PROJECT, 'brief.md');

test('brief-conflict: disk changes under an edit → 409 banner + reload recovery', async ({ page }) => {
  test.setTimeout(45_000);
  const guard = attachConsoleGuard(page);

  await page.goto(`/#/project/${PROJECT}`);
  await page.locator('[data-editor-tab="brief"]').click();
  await expect(page.getByTestId('brief-tab')).toBeVisible();

  // enter edit mode and change the draft.
  await page.getByTestId('brief-edit').click();
  const editor = page.getByTestId('brief-editor');
  await expect(editor).toBeVisible();
  await editor.fill('# Brief — my local edit\n\nThis is the version I am typing in the UI.\n');

  // mutate brief.md on disk behind the UI (the agent-write class). The watcher may surface this as a
  // mid-edit conflict on its own; the Save below is the deterministic 409 path regardless.
  fs.writeFileSync(BRIEF, '# Brief — disk wins\n\nAnother writer changed this file.\n', 'utf8');

  await page.getByTestId('brief-save').click();

  // the conflict banner appears with a recovery path.
  const banner = page.getByTestId('brief-conflict');
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('brief-conflict-reload').click();

  // "Load theirs" adopts the disk version; the banner clears and the editor shows the disk content.
  await expect(banner).toHaveCount(0);
  await expect(page.getByTestId('brief-editor')).toHaveValue(/disk wins/);

  expect(guard.errors()).toEqual([]);
});
