#!/usr/bin/env tsx
/**
 * capabilities/screen-record/actions.ts — the record-plan action model + replay (plan P1G.3, GAP-64).
 *
 * Shared by both capture drivers (record-session.ts PRIMARY page.screencast, cdp-screencast.ts FALLBACK B):
 * the typed action list the EXPLORE stage authors, its validator, and the paced replay. Kept browser-free
 * at type level (Playwright `Page` typed `any`) so the fast test suite imports the validator + types with
 * no browser installed (playwright is an on-demand devDep, GAP-67).
 */
import { DEFAULT_PACING, resolvePacing, smoothClickAt, smoothClickSelector, smoothScroll, smoothType, _sleep, type PacingTable } from './pacing';

export type RecordAction =
  | { type: 'navigate'; url: string; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }
  | { type: 'click'; selector: string; optional?: boolean; timeoutMs?: number }
  | { type: 'clickAt'; x: number; y: number }
  // glide the visible cursor to a screen coordinate and dwell (point at something — no click)
  | { type: 'moveTo'; x: number; y: number; dwellMs?: number }
  | { type: 'type'; selector: string; text: string }
  | { type: 'press'; key: string }
  | { type: 'hover'; selector: string }
  | { type: 'scroll'; deltaY: number }
  | { type: 'waitFor'; selector?: string; state?: 'visible' | 'hidden' | 'attached' | 'detached' }
  | { type: 'wait'; ms: number }
  | { type: 'chapter'; title: string; subtitle?: string; durationMs?: number }
  // a persistent lower-third that EXPLAINS what's on screen; stays until the next caption / clearCaption
  | { type: 'caption'; text: string; subtitle?: string; durationMs?: number }
  | { type: 'clearCaption' };

export interface RecordPlan {
  slug?: string;
  target?: { width?: number; height?: number; deviceScaleFactor?: number; locale?: string; timezoneId?: string };
  output?: string;
  pacing?: Partial<PacingTable>;
  actions: RecordAction[];
}

/** Validate a plan object (pure → testable). Throws on a malformed action list. */
export function validatePlan(plan: unknown): RecordPlan {
  const p = plan as RecordPlan;
  if (!p || !Array.isArray(p.actions) || p.actions.length === 0) throw new Error('plan must have a non-empty "actions" array');
  for (const [i, a] of p.actions.entries()) {
    if (!a || typeof (a as { type?: string }).type !== 'string') throw new Error(`action[${i}] missing "type"`);
    if (a.type === 'navigate' && !a.url) throw new Error(`action[${i}] navigate missing "url"`);
    if ((a.type === 'click' || a.type === 'hover' || a.type === 'type') && !('selector' in a && a.selector)) {
      throw new Error(`action[${i}] ${a.type} missing "selector"`);
    }
    if (a.type === 'caption' && !('text' in a && a.text)) throw new Error(`action[${i}] caption missing "text"`);
    if ((a.type === 'moveTo' || a.type === 'clickAt') && (typeof a.x !== 'number' || typeof a.y !== 'number')) {
      throw new Error(`action[${i}] ${a.type} needs numeric x,y`);
    }
  }
  return p;
}

/** Count the distinct navigate targets in a plan (pure → testable; feeds provenance). */
export function planNavTargets(plan: RecordPlan): string[] {
  return plan.actions.filter((a) => a.type === 'navigate').map((a) => (a as { url: string }).url);
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A full-screen chapter title-card (deterministic; version-independent of sc.showChapter). */
export async function showChapter(page: any, title: string, durationMs: number, subtitle?: string): Promise<void> {
  await page.evaluate(
    ({ t, s, d }: { t: string; s?: string; d: number }) => {
      const card = document.createElement('div');
      card.style.cssText =
        'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;z-index:2147483646;' +
        'background:radial-gradient(circle at 50% 40%,#1a1a20,#0E0E11);color:#FFFFFF;font-family:Inter,system-ui,sans-serif;' +
        'text-align:center;padding:0 9%;opacity:0;transition:opacity 220ms ease';
      const h = document.createElement('div');
      h.textContent = t;
      h.style.cssText = 'font-weight:800;font-size:60px;line-height:1.12;letter-spacing:-0.02em;color:#FFE600';
      card.appendChild(h);
      if (s) {
        const p = document.createElement('div');
        p.textContent = s;
        p.style.cssText = 'font-weight:500;font-size:27px;line-height:1.4;color:#EDEDED;max-width:1100px';
        card.appendChild(p);
      }
      document.body.appendChild(card);
      requestAnimationFrame(() => (card.style.opacity = '1'));
      setTimeout(() => {
        card.style.opacity = '0';
        setTimeout(() => card.remove(), 280);
      }, d);
    },
    { t: title, s: subtitle, d: durationMs },
  );
  await _sleep(durationMs + 500);
}

/** A persistent lower-third that EXPLAINS what's on screen — replaces any existing one (id-keyed). */
export async function showLowerThird(page: any, text: string, subtitle?: string): Promise<void> {
  await page.evaluate(
    ({ t, s }: { t: string; s?: string }) => {
      const ID = '__vibe-lt';
      document.getElementById(ID)?.remove();
      const lt = document.createElement('div');
      lt.id = ID;
      lt.style.cssText =
        'position:fixed;left:48px;bottom:56px;max-width:60%;z-index:2147483645;padding:18px 26px;border-radius:14px;' +
        'background:rgba(14,14,17,0.86);border-left:6px solid #FFE600;color:#fff;font-family:Inter,system-ui,sans-serif;' +
        'box-shadow:0 10px 30px rgba(0,0,0,0.45);opacity:0;transform:translateY(12px);transition:opacity 260ms ease,transform 260ms ease';
      const h = document.createElement('div');
      h.textContent = t;
      h.style.cssText = 'font-weight:700;font-size:30px;line-height:1.25;letter-spacing:-0.01em';
      lt.appendChild(h);
      if (s) {
        const p = document.createElement('div');
        p.textContent = s;
        p.style.cssText = 'margin-top:8px;font-weight:500;font-size:20px;line-height:1.4;color:#FFE600';
        lt.appendChild(p);
      }
      document.body.appendChild(lt);
      requestAnimationFrame(() => {
        lt.style.opacity = '1';
        lt.style.transform = 'translateY(0)';
      });
    },
    { t: text, s: subtitle },
  );
}

/** Fade out + remove the lower-third. */
export async function clearLowerThird(page: any): Promise<void> {
  await page.evaluate(() => {
    const lt = document.getElementById('__vibe-lt');
    if (lt) {
      lt.style.opacity = '0';
      lt.style.transform = 'translateY(12px)';
      setTimeout(() => lt.remove(), 300);
    }
  });
  await _sleep(350);
}

/** Replay one action with deliberate pacing (GAP-64). */
export async function runAction(page: any, a: RecordAction, p: PacingTable = DEFAULT_PACING): Promise<void> {
  switch (a.type) {
    case 'navigate':
      await page.goto(a.url, { waitUntil: a.waitUntil ?? 'networkidle' });
      await _sleep(p.afterLoadMs);
      break;
    case 'click':
      if (a.optional) {
        try {
          await page.locator(a.selector).first().waitFor({ state: 'visible', timeout: a.timeoutMs ?? 4000 });
        } catch {
          break; // not present this run → skip (e.g. a consent dialog that didn't appear)
        }
      }
      await smoothClickSelector(page, a.selector, p);
      break;
    case 'clickAt':
      await smoothClickAt(page, a.x, a.y, p);
      break;
    case 'moveTo':
      // glide the cursor (interpolated mousemove → the overlay follows) and dwell, "pointing" at a target
      await page.mouse.move(a.x, a.y, { steps: p.moveSteps });
      await _sleep(a.dwellMs ?? p.preClickSettleMs);
      break;
    case 'type':
      await smoothType(page, a.selector, a.text, p);
      break;
    case 'press':
      await page.keyboard.press(a.key);
      await _sleep(p.postClickMs);
      break;
    case 'hover': {
      const el = page.locator(a.selector).first();
      const box = await el.boundingBox();
      if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: p.moveSteps });
      await _sleep(p.preClickSettleMs);
      break;
    }
    case 'scroll':
      await smoothScroll(page, a.deltaY, p);
      break;
    case 'waitFor':
      if (a.selector) await page.locator(a.selector).first().waitFor({ state: a.state ?? 'visible' });
      break;
    case 'wait':
      await _sleep(a.ms);
      break;
    case 'chapter':
      await showChapter(page, a.title, a.durationMs ?? p.chapterMs, a.subtitle);
      break;
    case 'caption':
      await showLowerThird(page, a.text, a.subtitle);
      await _sleep(a.durationMs ?? p.readMs);
      break;
    case 'clearCaption':
      await clearLowerThird(page);
      break;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export { resolvePacing };
