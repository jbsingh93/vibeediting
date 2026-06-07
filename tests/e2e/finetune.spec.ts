import { test, expect, type Page } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';

/**
 * The fine-tune editor on e2e-demo (seeded captions.json) — trimmed port of the parent's P4 suite:
 * caption chips render; dragging a chip then Save writes captions.json + creates the Whisper baseline;
 * Ctrl+Z undoes a drag. Zero API spend, no renders (the comp's video source is intentionally absent →
 * the calm placeholder, never a decode error).
 */
const URL = '/#/finetune/e2e-demo';
const PX_PER_SEC = 60; // the editor's default zoom

async function openEditor(page: Page) {
  await page.goto(URL);
  await expect(page.getByTestId('finetune')).toBeVisible();
  await expect(page.getByTestId('ft-chip').first()).toBeVisible();
}

test('finetune: caption chips render from the seeded captions.json', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await openEditor(page);

  await expect(page.getByTestId('ft-chip')).toHaveCount(4); // AI / took / your / job
  await expect(page.locator('[data-word="job"]')).toBeVisible();

  expect(guard.errors()).toEqual([]);
});

test('finetune: drag a chip → Save writes captions.json + baseline', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await openEditor(page);

  const chip = page.locator('[data-word="job"]');
  await chip.scrollIntoViewIfNeeded();
  const before = await chip.boundingBox();
  if (!before) throw new Error('no chip box');

  // drag the body +1.5s (raw mouse coords are viewport-relative)
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 1.5 * PX_PER_SEC, before.y + before.height / 2, { steps: 6 });
  await page.mouse.up();

  const dragged = await chip.boundingBox();
  expect(Math.abs((dragged?.x ?? 0) - before.x)).toBeGreaterThan(10);

  // Save → captions.json carries the new timing + a Whisper baseline now exists
  await page.getByTestId('ft-save').click();
  await expect(page.getByTestId('ft-save-status')).toContainText('saved captions.json');
  await expect(page.getByTestId('ft-save-status')).toContainText('baseline captions.whisper.json');

  // the live finetune state reflects the moved word (asserted through the API, by value)
  const state = await (await page.request.get('/api/projects/e2e-demo/finetune')).json();
  const cap = state.docs.find((d: { name: string }) => d.name === 'captions.json');
  const job = cap.data.find((w: { text: string }) => w.text === 'job');
  expect(job.startMs).toBeGreaterThan(4000);
  // the baseline keeps the pristine 3000ms
  expect(cap.baseline.find((w: { text: string }) => w.text === 'job').startMs).toBe(3000);

  expect(guard.errors()).toEqual([]);
});

/** Drag the `job` chip body by +dxPx and return its new bounding box. */
async function dragJob(page: Page, dxPx: number) {
  const chip = page.locator('[data-word="job"]');
  await chip.scrollIntoViewIfNeeded();
  const b = await chip.boundingBox();
  if (!b) throw new Error('no chip box');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dxPx, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  return chip.boundingBox();
}

test('finetune: undo/redo chain across 3 edits, then reset-to-Whisper baseline', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await openEditor(page);

  const chip = page.locator('[data-word="job"]');
  // Measure the BASELINE position first: a reset-to-Whisper snaps `job` to its pristine onset,
  // which is what the later reset must reproduce (independent of any prior saved captions.json).
  await page.getByTestId('finetune').focus();
  await page.getByTestId('ft-reset').click();
  const baselineX = (await chip.boundingBox())!.x;

  // three successive drags, each commits one undo step (and each moves the chip further right).
  await dragJob(page, 40);
  const after1 = (await chip.boundingBox())!.x;
  expect(after1 - baselineX).toBeGreaterThan(10);
  await dragJob(page, 40);
  await dragJob(page, 40);
  const after3 = (await chip.boundingBox())!.x;
  expect(after3).toBeGreaterThan(after1);

  // undo ×3 walks back to the post-baseline-reset position (the chain's anchor).
  await page.getByTestId('finetune').focus();
  await page.getByTestId('ft-undo').click();
  await page.getByTestId('ft-undo').click();
  await page.getByTestId('ft-undo').click();
  await expect.poll(async () => Math.abs(((await chip.boundingBox())?.x ?? 0) - baselineX)).toBeLessThan(4);

  // redo once re-applies the first drag (chip moves right of the anchor again).
  await page.getByTestId('ft-redo').click();
  await expect.poll(async () => ((await chip.boundingBox())?.x ?? 0) - baselineX).toBeGreaterThan(10);

  // reset-to-Whisper restores the pristine baseline timings (chip back at the baseline position).
  await page.getByTestId('ft-reset').click();
  await expect.poll(async () => Math.abs(((await chip.boundingBox())?.x ?? 0) - baselineX)).toBeLessThan(4);

  expect(guard.errors()).toEqual([]);
});

test('finetune: render-preview picker lists renders; an unloadable render falls back gracefully', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await openEditor(page);

  // e2e-demo has a seeded render (deliver/e2e-demo/AdReel-loudnorm.mp4) → the picker appears.
  const select = page.getByTestId('ft-render-select');
  await expect(select).toBeVisible();
  // placeholder + the seeded scoped render (+ the unscoped stray, which listRenders also tags in)
  await expect.poll(() => select.locator('option').count()).toBeGreaterThanOrEqual(2);
  await expect(select.locator('option', { hasText: 'AdReel-loudnorm' })).toHaveCount(1);

  // The seeded "render" is deliberately undecodable bytes: choosing it must NOT mount a broken
  // Player — the probe bails back to the data preview (select reverts to the placeholder).
  await select.selectOption({ index: 1 });
  await expect.poll(async () => select.inputValue()).toBe('');
  await expect(page.getByTestId('ft-chip').first()).toBeVisible(); // editor stays usable

  expect(guard.errors()).toEqual([]);
});

test('finetune: Ctrl+Z undoes a drag (before save)', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await openEditor(page);

  // drag a word (body grab = the chip centre, away from the 7px edge handles), then undo unsaved.
  const chip = page.locator('[data-word="job"]');
  await chip.scrollIntoViewIfNeeded();
  const before = await chip.boundingBox();
  if (!before) throw new Error('no chip box');

  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 60, before.y + before.height / 2, { steps: 6 });
  await page.mouse.up();
  const dragged = await chip.boundingBox();
  expect(Math.abs((dragged?.x ?? 0) - before.x)).toBeGreaterThan(10);

  // the undo keybinding lives on the focusable finetune container — focus it, then Ctrl+Z
  await page.getByTestId('finetune').focus();
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => Math.abs(((await chip.boundingBox())?.x ?? 0) - before.x))
    .toBeLessThan(3);

  expect(guard.errors()).toEqual([]);
});
