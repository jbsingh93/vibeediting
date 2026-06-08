import * as fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { attachConsoleGuard } from './console-guard.js';
import { MOCK_SCENARIO_PATH } from '../../playwright.config.js';

/**
 * The fine-tune editor on e2e-demo (seeded captions.json) — trimmed port of the parent's P4 suite:
 * caption chips render; dragging a chip then Save writes captions.json + creates the Whisper baseline;
 * Ctrl+Z undoes a drag. Zero API spend, no renders (the comp's video source is intentionally absent →
 * the calm placeholder, never a decode error).
 */
const URL = '/#/finetune/e2e-demo';
const PX_PER_SEC = 60; // the editor's default zoom

/**
 * VE.7.5 — the editor now fits the clip to the dock width on LOAD (auto-fit), so the default zoom
 * is no longer a fixed 60. Pin it to PX_PER_SEC via the keyboard the moment the editor opens: the
 * first slider touch sets `zoomTouched`, which permanently disables auto-fit — so every test's
 * pixel↔seconds math (rb.x + sec*PX_PER_SEC) stays valid against the restructured DOM. Home jumps
 * to the slider min (20) so we always approach the target deterministically from below.
 */
async function lockZoom(page: Page, target = PX_PER_SEC) {
  const zoom = page.getByTestId('ft-zoom');
  await zoom.focus();
  await zoom.press('Home');
  for (let guard = 0; guard < 320; guard++) {
    if (Number(await zoom.inputValue()) >= target) break;
    await zoom.press('ArrowRight');
  }
  expect(Number(await zoom.inputValue())).toBe(target);
}

async function openEditor(page: Page) {
  await page.goto(URL);
  await expect(page.getByTestId('finetune')).toBeVisible();
  await expect(page.getByTestId('ft-chip').first()).toBeVisible();
  await lockZoom(page);
}

test('finetune: caption chips render from the seeded captions.json', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await openEditor(page);

  await expect(page.getByTestId('ft-chip')).toHaveCount(4); // AI / took / your / job
  await expect(page.locator('[data-word="job"]')).toBeVisible();

  expect(guard.errors()).toEqual([]);
});

test('finetune: VE.7.5 layout — clip fits the dock width on load + the editor fills its region', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto(URL);
  await expect(page.getByTestId('finetune')).toBeVisible();
  await expect(page.getByTestId('ft-chip').first()).toBeVisible();
  // NB: deliberately NOT lockZoom — we are asserting the auto-fit DEFAULT landed.

  const dock = page.getByTestId('ft-timeline');
  await expect(dock).toBeVisible();
  const dockBox = await dock.boundingBox();
  const laneBox = await dock.locator('> div').first().boundingBox(); // the (trackWidth+52) lane
  if (!dockBox || !laneBox) throw new Error('no timeline boxes');

  // fit-to-width: the track lane spans (≈) the full dock width on load, instead of a ~350px stub
  // stranded left in a ~1200px dock (the pre-VE.7.5 "sea of black").
  expect(laneBox.width).toBeGreaterThan(dockBox.width * 0.9);

  // fill-height: the editor claims its region — the timeline dock reaches the bottom of the editor,
  // and the editor reaches near the viewport bottom (not a natural-height cluster stranded up top).
  const ft = await page.getByTestId('finetune').boundingBox();
  const vp = page.viewportSize();
  if (!ft || !vp) throw new Error('no viewport / editor box');
  expect(ft.y + ft.height).toBeGreaterThan(vp.height - 120);
  expect(dockBox.y + dockBox.height).toBeGreaterThan(ft.y + ft.height - 10);

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

/** Drag a range on the ruler from `fromSec` to `toSec` (output time) → forms a selection band. */
async function dragRange(page: Page, fromSec: number, toSec: number) {
  await lockZoom(page); // pin the zoom so fromSec*PX_PER_SEC lands where we expect (VE.7.5 auto-fit)
  const ruler = page.getByTestId('ft-ruler');
  await ruler.scrollIntoViewIfNeeded();
  const rb = await ruler.boundingBox();
  if (!rb) throw new Error('no ruler box');
  const y = rb.y + rb.height / 2;
  await page.mouse.move(rb.x + fromSec * PX_PER_SEC, y);
  await page.mouse.down();
  await page.mouse.move(rb.x + ((fromSec + toSec) / 2) * PX_PER_SEC, y, { steps: 6 });
  await page.mouse.move(rb.x + toSec * PX_PER_SEC, y, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('ft-range-window')).toBeVisible();
}

/**
 * Drive an <input type=range> to `target` via the keyboard (ArrowLeft/Right = ∓step). Stays in the
 * DOM-typed browser out of the Node typecheck, and exercises the real control: the range-audio gain
 * slider splits the clip on the first step, then re-sets the inner clip's gain on each subsequent
 * step (the lane-stable key keeps focus across the split).
 */
async function nudgeRange(page: Page, testid: string, target: number) {
  const slider = page.getByTestId(testid).first();
  await slider.focus();
  for (let guard = 0; guard < 80; guard++) {
    const cur = Number(await slider.inputValue());
    if (cur === target) break;
    await page.keyboard.press(cur > target ? 'ArrowLeft' : 'ArrowRight');
  }
  expect(Number(await slider.inputValue())).toBe(target);
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

test('finetune: drag on the ruler selects a time range (band + range inspector), Esc clears', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await openEditor(page);

  const ruler = page.getByTestId('ft-ruler');
  const rb = await ruler.boundingBox();
  if (!rb) throw new Error('no ruler box');
  const y = rb.y + rb.height / 2;

  // drag across most of the ruler → a real range (the >3px move threshold distinguishes a drag from a seek-tap)
  await page.mouse.move(rb.x + 8, y);
  await page.mouse.down();
  await page.mouse.move(rb.x + rb.width * 0.5, y, { steps: 8 });
  await page.mouse.move(rb.x + rb.width - 8, y, { steps: 8 });
  await page.mouse.up();

  // the band spans the tracks and the range inspector shows the window summary
  await expect(page.getByTestId('ft-range-band')).toBeVisible();
  await expect(page.getByTestId('ft-inspector')).toContainText('range');
  await expect(page.getByTestId('ft-range-window')).toBeVisible();
  await expect(page.getByTestId('ft-range-spans')).toContainText('word'); // e2e-demo has captions in the window

  // Esc on the focused editor clears the range (band gone)
  await page.getByTestId('finetune').focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('ft-range-band')).toHaveCount(0);

  expect(guard.errors()).toEqual([]);
});

test('finetune: structural verbs — split @ playhead → delete → reorder → save → reload persists the cut', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  // dedicated EDL project (no captions) so the SEG track + structural verbs are the focus
  await page.goto('/#/finetune/e2e-edl');
  await expect(page.getByTestId('finetune')).toBeVisible();

  // the seeded 3-segment EDL renders on the SEG track
  await expect(page.getByTestId('ft-segment')).toHaveCount(3);
  await lockZoom(page); // VE.7.5 auto-fit → pin to 60 px/s before the ruler pixel math

  // razor: seek the playhead into s2 (1.5s @ 60px/s = +90px on the ruler), then press S to split
  const ruler = page.getByTestId('ft-ruler');
  const rb = await ruler.boundingBox();
  if (!rb) throw new Error('no ruler box');
  await page.mouse.click(rb.x + 1.5 * PX_PER_SEC, rb.y + rb.height / 2);
  await page.getByTestId('finetune').focus();
  await page.keyboard.press('s');
  await expect(page.getByTestId('ft-segment')).toHaveCount(4);
  await expect(page.locator('[data-segment="s2-a"]')).toBeVisible();
  await expect(page.locator('[data-segment="s2-b"]')).toBeVisible();

  // delete + ripple: select s1, hit the inspector delete verb
  await page.locator('[data-segment="s1"]').click();
  await page.getByTestId('ft-seg-delete').click();
  await expect(page.getByTestId('ft-segment')).toHaveCount(3);
  await expect(page.locator('[data-segment="s1"]')).toHaveCount(0);

  // reorder: select s3, move it earlier (◀) → order becomes s2-a, s3, s2-b
  await page.locator('[data-segment="s3"]').click();
  await page.getByTestId('ft-seg-move-left').click();
  const segLocator = page.getByTestId('ft-segment');
  const segCount = await segLocator.count();
  const domOrder: (string | null)[] = [];
  for (let i = 0; i < segCount; i++) domOrder.push(await segLocator.nth(i).getAttribute('data-segment'));
  expect(domOrder).toEqual(['s2-a', 's3', 's2-b']);

  // save → the persisted segments.json reflects the restructured cut (by value, via the API)
  await page.getByTestId('ft-save').click();
  await expect(page.getByTestId('ft-save-status')).toContainText('saved segments.json');

  await page.reload();
  await expect(page.getByTestId('ft-segment')).toHaveCount(3);
  const state = await (await page.request.get('/api/projects/e2e-edl/finetune')).json();
  const seg = state.docs.find((d: { name: string }) => d.name === 'segments.json');
  expect(seg.data.segments.map((s: { id: string }) => s.id)).toEqual(['s2-a', 's3', 's2-b']);
  // the split halves keep contiguous source + the new internal edge is a hard cut
  const a = seg.data.segments.find((s: { id: string }) => s.id === 's2-a');
  const b = seg.data.segments.find((s: { id: string }) => s.id === 's2-b');
  expect(a.srcEnd).toBe(1.5);
  expect(b.srcStart).toBe(1.5);
  expect(b.transition).toEqual({ kind: 'cut', durationFrames: 0 });

  expect(guard.errors()).toEqual([]);
});

test('finetune: b-roll insert — pick footage → cutaway segment → save → reload persists src', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto('/#/finetune/e2e-edl-broll');
  await expect(page.getByTestId('finetune')).toBeVisible();
  await expect(page.getByTestId('ft-segment')).toHaveCount(3);

  // open the b-roll picker (in the SEG track header) and choose the seeded footage
  await page.getByTestId('ft-broll-add').click();
  const pick = page.getByTestId('ft-broll-pick');
  await expect(pick).toBeVisible();
  await pick.selectOption('public/e2e-edl-broll/broll.mp4');

  // a cutaway segment is inserted (4 blocks); its pill shows the footage filename
  await expect(page.getByTestId('ft-segment')).toHaveCount(4);
  await expect(page.locator('[data-segment^="broll-"]')).toHaveCount(1);
  await expect(page.locator('[data-segment^="broll-"]')).toContainText('broll.mp4');

  // save → reload → the cutaway persisted carrying its public-rooted src
  await page.getByTestId('ft-save').click();
  await expect(page.getByTestId('ft-save-status')).toContainText('saved segments.json');
  await page.reload();
  await expect(page.getByTestId('ft-segment')).toHaveCount(4);
  const state = await (await page.request.get('/api/projects/e2e-edl-broll/finetune')).json();
  const seg = state.docs.find((d: { name: string }) => d.name === 'segments.json');
  const broll = seg.data.segments.find((s: { id: string }) => s.id.startsWith('broll-'));
  expect(broll.src).toBe('e2e-edl-broll/broll.mp4');
  expect(broll.srcEnd).toBeGreaterThan(0);

  expect(guard.errors()).toEqual([]);
});

test('finetune: typed transition — set a kind on a segment edge → save → reload persists it', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto('/#/finetune/e2e-edl-tr');
  await expect(page.getByTestId('finetune')).toBeVisible();
  await expect(page.getByTestId('ft-segment')).toHaveCount(3);

  // select s2 (not the first clip → it has an incoming edge), set the transition to a wipe-from-right
  await page.locator('[data-segment="s2"]').click();
  await page.getByTestId('ft-seg-transition-kind').selectOption('wipe');
  await page.getByTestId('ft-seg-transition-dir').selectOption('r');
  await page.getByTestId('ft-seg-transition-dur').fill('12');
  // the incoming-edge badge appears on the block
  await expect(page.locator('[data-segment="s2"] [data-testid="ft-seg-transition-badge"]')).toBeVisible();

  await page.getByTestId('ft-save').click();
  await expect(page.getByTestId('ft-save-status')).toContainText('saved segments.json');
  await page.reload();
  const state = await (await page.request.get('/api/projects/e2e-edl-tr/finetune')).json();
  const seg = state.docs.find((d: { name: string }) => d.name === 'segments.json');
  const s2 = seg.data.segments.find((s: { id: string }) => s.id === 's2');
  expect(s2.transition).toEqual({ kind: 'wipe', durationFrames: 12, direction: 'r' });
  // s1 (the first clip) has no transition control / no transition field
  const s1 = seg.data.segments.find((s: { id: string }) => s.id === 's1');
  expect(s1.transition).toBeUndefined();

  expect(guard.errors()).toEqual([]);
});

test('finetune: per-clip effects — add color/transform/speed on a clip → save → reload persists the stack', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto('/#/finetune/e2e-edl-fx');
  await expect(page.getByTestId('finetune')).toBeVisible();
  await expect(page.getByTestId('ft-segment')).toHaveCount(3);

  // select s1 (effects apply to ANY clip, incl. the first) and open the effects sub-panel
  await page.locator('[data-segment="s1"]').click();
  await expect(page.getByTestId('ft-seg-fx')).toBeVisible();

  // add a colorCorrect effect → set saturation
  await page.getByTestId('ft-seg-fx-add-colorCorrect').click();
  await expect(page.getByTestId('ft-seg-fx-item')).toHaveCount(1);
  await page.getByTestId('ft-seg-fx-saturation').fill('1.4');

  // add a transform → set scale
  await page.getByTestId('ft-seg-fx-add-transform').click();
  await expect(page.getByTestId('ft-seg-fx-item')).toHaveCount(2);
  await page.getByTestId('ft-seg-fx-scale').fill('1.25');

  // add a speed → set rate
  await page.getByTestId('ft-seg-fx-add-speed').click();
  await expect(page.getByTestId('ft-seg-fx-item')).toHaveCount(3);
  await page.getByTestId('ft-seg-fx-speed').fill('1.5');

  // save → reload → the persisted segments.json carries the ordered effects stack (by value, via API)
  await page.getByTestId('ft-save').click();
  await expect(page.getByTestId('ft-save-status')).toContainText('saved segments.json');
  await page.reload();
  const state = await (await page.request.get('/api/projects/e2e-edl-fx/finetune')).json();
  const seg = state.docs.find((d: { name: string }) => d.name === 'segments.json');
  const s1 = seg.data.segments.find((s: { id: string }) => s.id === 's1');
  expect(s1.effects.map((e: { type: string }) => e.type)).toEqual(['colorCorrect', 'transform', 'speed']);
  expect(s1.effects[0].saturation).toBe(1.4);
  expect(s1.effects[1].scale).toBe(1.25);
  expect(s1.effects[2].rate).toBe(1.5);
  // other clips stay un-effected (no injected defaults)
  const s2 = seg.data.segments.find((s: { id: string }) => s.id === 's2');
  expect(s2.effects).toBeUndefined();

  expect(guard.errors()).toEqual([]);
});

test('finetune: range audio — dip music in a window splits the BGM track into clips → save persists', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto('/#/finetune/e2e-edl-audio');
  await expect(page.getByTestId('finetune')).toBeVisible();
  await expect(page.getByTestId('ft-segment')).toHaveCount(3);
  await expect(page.getByTestId('ft-audio-pill')).toHaveCount(1); // one to-end BGM bed

  // select a 0.5–2.5s window → the range-audio panel lists the spanned BGM clip + the footage row
  await dragRange(page, 0.5, 2.5);
  await expect(page.getByTestId('ft-range-audio')).toBeVisible();
  await expect(page.getByTestId('ft-range-audio-clip')).toHaveCount(1);
  await expect(page.getByTestId('ft-range-footage')).toBeVisible();

  // dip the music to −30 dB inside the window → the BGM track splits into head / dipped-mid / tail
  await nudgeRange(page, 'ft-range-audio-gain', -30);
  await expect(page.getByTestId('ft-audio-pill')).toHaveCount(3);

  await page.getByTestId('ft-save').click();
  await expect(page.getByTestId('ft-save-status')).toContainText('saved audio-mix.json');
  await page.reload();

  const state = await (await page.request.get('/api/projects/e2e-edl-audio/finetune')).json();
  const mix = state.docs.find((d: { name: string }) => d.name === 'audio-mix.json');
  const tracks = mix.data.tracks as { offsetSec: number; durationSec?: number; srcInSec?: number; gainDb: number }[];
  expect(tracks).toHaveLength(3);
  const byOffset = [...tracks].sort((a, b) => a.offsetSec - b.offsetSec);
  expect(byOffset[0]).toMatchObject({ offsetSec: 0, durationSec: 0.5, gainDb: -12 }); // head untouched
  expect(byOffset[1]).toMatchObject({ offsetSec: 0.5, durationSec: 2, gainDb: -30 }); // the dip
  expect(byOffset[2]).toMatchObject({ offsetSec: 2.5, gainDb: -12 }); // tail untouched
  expect(byOffset[2]!.srcInSec).toBe(2.5); // source stays continuous across the dip (no drift)
  expect(mix.data.masterLufs).toBe(-14); // master loudness lock untouched

  expect(guard.errors()).toEqual([]);
});

test('finetune: range audio — mute footage in a window + insert an SFX at the range start → save persists', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  // own seeded project — Test A's save mutates e2e-edl-audio on disk, so this one stays hermetic.
  await page.goto('/#/finetune/e2e-edl-audio2');
  await expect(page.getByTestId('finetune')).toBeVisible();
  await expect(page.getByTestId('ft-segment')).toHaveCount(3);

  await dragRange(page, 0.5, 2.5);

  // mute the footage audio of the spanned segments (video keeps playing)
  await page.getByTestId('ft-range-footage-mute').click();
  // insert an SFX track AT the range start (VE.7.2)
  await page.getByTestId('ft-range-insert-sfx').selectOption('e2e-edl-audio2/sfx-whoosh.mp3');
  await expect(page.getByTestId('ft-audio-pill')).toHaveCount(2); // bed + the new SFX

  await page.getByTestId('ft-save').click();
  await expect(page.getByTestId('ft-save-status')).toContainText('saved');
  await page.reload();

  const state = await (await page.request.get('/api/projects/e2e-edl-audio2/finetune')).json();
  const seg = state.docs.find((d: { name: string }) => d.name === 'segments.json');
  // all three spanned segments carry footage mute; nothing else changed
  expect(seg.data.segments.map((s: { audioMute?: boolean }) => !!s.audioMute)).toEqual([true, true, true]);
  const mix = state.docs.find((d: { name: string }) => d.name === 'audio-mix.json');
  const sfx = mix.data.tracks.find((t: { role: string }) => t.role === 'sfx');
  expect(sfx).toBeTruthy();
  expect(sfx.offsetSec).toBeCloseTo(0.5, 1); // dropped at the range start
  expect(sfx.src).toBe('e2e-edl-audio2/sfx-whoosh.mp3');

  expect(guard.errors()).toEqual([]);
});

test('finetune: Ask Editor Agent — range prefills the composer → agent rewrites the window → diff card → accept persists', async ({ page }) => {
  test.setTimeout(60_000);
  const guard = attachConsoleGuard(page);

  // the project workspace (NOT the standalone #/finetune route) — the chat composer lives here, so
  // the "Ask Editor Agent" affordance renders and the turn can run.
  await page.goto('/#/project/e2e-edl-agent');
  await expect(page.getByTestId('agent-input')).toBeVisible();
  await page.locator('[data-editor-tab="finetune"]').click();
  await expect(page.getByTestId('finetune')).toBeVisible();
  await expect(page.getByTestId('ft-segment')).toHaveCount(3);

  // drag a time range on the ruler → the range inspector + the Ask-Editor-Agent affordance appear.
  // (In the project workspace the editor shares vertical space with the player, so bring the ruler
  // into view before dragging — its box can otherwise sit below the fold.)
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

  // the agent's scoped turn drops the filler middle clip, leaving s1/s3 byte-identical (window-only).
  fs.writeFileSync(
    MOCK_SCENARIO_PATH,
    JSON.stringify({
      reply: 'Tightened the window — dropped the filler clip; s1 and s3 are unchanged.',
      docs: [
        {
          name: 'segments.json',
          data: {
            fps: 30,
            crossfadeFrames: 0,
            src: 'e2e-edl-agent/clip.mp4',
            segments: [
              { id: 's1', srcStart: 0, srcEnd: 1, cap: '' },
              { id: 's3', srcStart: 2, srcEnd: 3, cap: '' },
            ],
          },
        },
      ],
    }),
  );

  try {
    // VE.6.1 — clicking the affordance prefills the SHARED composer with the visible scope prefix.
    await page.getByTestId('ft-range-ask-agent').click();
    const input = page.getByTestId('agent-input');
    await expect(input).toHaveValue(/^\[Editing range \d+:\d{2}–\d+:\d{2} · affects segments\.json\] $/);

    // type the instruction AFTER the prefix and send a normal turn (Enter).
    await input.click();
    await input.press('End');
    await input.pressSequentially('tighten this — drop the filler clip');
    await input.press('Enter');

    // the agent's reply streams in…
    await expect(page.getByTestId('agent-feed')).toContainText('Tightened the window', { timeout: 20_000 });

    // …and the 2.5s disk-diff poll surfaces the scoped change as the accept/reject card.
    await expect(page.getByTestId('ft-agent-diff')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('ft-diff-accept').click();
    await expect(page.getByTestId('ft-agent-diff')).toHaveCount(0);
  } finally {
    fs.rmSync(MOCK_SCENARIO_PATH, { force: true });
  }

  // persisted: the window was tightened (s2 gone) and the out-of-window clips are preserved verbatim.
  const state = await (await page.request.get('/api/projects/e2e-edl-agent/finetune')).json();
  const seg = state.docs.find((d: { name: string }) => d.name === 'segments.json');
  expect(seg.data.segments.map((s: { id: string }) => s.id)).toEqual(['s1', 's3']);
  const s1 = seg.data.segments.find((s: { id: string }) => s.id === 's1');
  const s3 = seg.data.segments.find((s: { id: string }) => s.id === 's3');
  expect({ a: s1.srcStart, b: s1.srcEnd }).toEqual({ a: 0, b: 1 });
  expect({ a: s3.srcStart, b: s3.srcEnd }).toEqual({ a: 2, b: 3 });

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
