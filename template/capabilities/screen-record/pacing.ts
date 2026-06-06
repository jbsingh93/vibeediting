#!/usr/bin/env tsx
/**
 * capabilities/screen-record/pacing.ts — deliberate-pacing + smooth-motion helpers (plan P1G.2, GAP-64).
 *
 * A robotic capture (teleporting cursor, instant typing, no breathing room) is NOT a deliverable. These
 * defaults + helpers make every generated `record-session.ts` watchable by default:
 *   - the cursor GLIDES via interpolated `mouse.move(x, y, { steps })` instead of teleporting
 *   - scrolling is a wheel LOOP (smooth) instead of a single PageDown jump
 *   - typing has a per-key delay; clicks have pre/post settle time; pages get read time
 *
 * Pure data (`DEFAULT_PACING`) is unit-tested offline; the action helpers take a Playwright `Page`
 * (typed `any` so this file imports no browser dependency — playwright is on-demand, GAP-67).
 */

/** The default pacing table (ms / step counts). Tunable per-brief; these read well for screen demos. */
export interface PacingTable {
  afterLoadMs: number; // settle after networkidle before the first action
  preClickSettleMs: number; // pause after the cursor arrives, before the click
  postClickMs: number; // pause after a click so the UI reaction is visible
  moveSteps: number; // interpolated mousemove steps (higher = smoother glide)
  typeDelayMs: number; // per-keystroke delay
  readMs: number; // dwell time when "reading" a page
  scrollDeltaPx: number; // wheel delta per smooth-scroll tick
  scrollTickMs: number; // pause between wheel ticks (~25 fps scroll)
  chapterMs: number; // default chapter-card duration
}

export const DEFAULT_PACING: PacingTable = {
  afterLoadMs: 400,
  preClickSettleMs: 500,
  postClickMs: 800,
  moveSteps: 28,
  typeDelayMs: 80,
  readMs: 2500,
  scrollDeltaPx: 70,
  scrollTickMs: 40,
  chapterMs: 2000,
};

/** Clamp/merge a partial override onto the defaults (pure → testable). */
export function resolvePacing(override?: Partial<PacingTable>): PacingTable {
  return { ...DEFAULT_PACING, ...(override ?? {}) };
}

/** How many wheel ticks to travel `totalPx` at `scrollDeltaPx` per tick (pure → testable). */
export function scrollTicks(totalPx: number, p: PacingTable = DEFAULT_PACING): number {
  return Math.max(1, Math.round(Math.abs(totalPx) / p.scrollDeltaPx));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// The helpers below take a Playwright Page/Mouse/Keyboard. Typed `any` on purpose: this module must
// import no browser package (playwright is an on-demand devDep, GAP-67). record-session.ts passes a real Page.

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Glide the cursor to (x,y) with interpolated steps, settle, then click. */
export async function smoothClickAt(page: any, x: number, y: number, p: PacingTable = DEFAULT_PACING): Promise<void> {
  await page.mouse.move(x, y, { steps: p.moveSteps });
  await sleep(p.preClickSettleMs);
  await page.mouse.down();
  await page.mouse.up();
  await sleep(p.postClickMs);
}

/** Glide to a located element's center, then click it (keeps the visible cursor honest). */
export async function smoothClickSelector(page: any, selector: string, p: PacingTable = DEFAULT_PACING): Promise<void> {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  if (!box) throw new Error(`smoothClickSelector: no bounding box for "${selector}"`);
  await smoothClickAt(page, box.x + box.width / 2, box.y + box.height / 2, p);
}

/** Smooth scroll by a wheel LOOP (not PageDown) so motion is fluid, not a jump. */
export async function smoothScroll(page: any, totalPx: number, p: PacingTable = DEFAULT_PACING): Promise<void> {
  const ticks = scrollTicks(totalPx, p);
  const dir = totalPx < 0 ? -1 : 1;
  for (let i = 0; i < ticks; i++) {
    await page.mouse.wheel(0, dir * p.scrollDeltaPx);
    await sleep(p.scrollTickMs);
  }
}

/** Type into a field with a human per-key delay. */
export async function smoothType(page: any, selector: string, text: string, p: PacingTable = DEFAULT_PACING): Promise<void> {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await el.click();
  await page.keyboard.type(text, { delay: p.typeDelayMs });
  await sleep(p.postClickMs);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const _sleep = sleep;
