#!/usr/bin/env tsx
/**
 * capabilities/screen-record/guards.ts — determinism + security guards (plan P1G.6, GAP-64/65).
 *
 * A headed browser/desktop capture can (a) drift between takes (random data, clocks, animations) and
 * (b) leak secrets on-camera. These guards make a recording reproducible AND keep outputs inside the
 * repo's disposable tree. All pure → unit-tested offline.
 *
 * SECURITY (GAP-65), enforced here + documented in README/SKILL:
 *   - prefer the SANDBOXED page.screencast/CDP capture over gdigrab when secrets risk exists (the
 *     in-browser screencast can't see OS UAC dialogs / notifications / other windows; gdigrab films all)
 *   - never write a deliverable into a synced personal folder — only the gitignored out/ + test-video/,
 *     or an explicit public/<project>/ (the only tree allowed to SHIP)
 *   - never record a real signed-in personal account: use --isolated + a purpose-seeded auth.json (secret)
 */
import * as path from 'node:path';
import { REPO_ROOT } from '../_env/contract';

/** The only trees a screen-record output / output-dir / storage-state may live in (GAP-65). */
export const ALLOWED_OUTPUT_ROOTS = ['out', 'test-video', 'public'] as const;

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Validate that `target` resolves inside one of the allowed repo trees (never a synced personal folder).
 * Returns the resolved absolute path or throws. Pure (no fs touch) → testable.
 */
export function assertSafeOutputPath(target: string): string {
  const abs = path.resolve(REPO_ROOT, target);
  if (!isInside(abs, REPO_ROOT)) {
    throw new Error(`screen-record refuses to write outside the repo: ${abs}`);
  }
  const ok = ALLOWED_OUTPUT_ROOTS.some((root) => isInside(abs, path.join(REPO_ROOT, root)));
  if (!ok) {
    throw new Error(
      `screen-record output must live under ${ALLOWED_OUTPUT_ROOTS.join(' / ')}/ (gitignored or explicit-ship) — got ${abs}`,
    );
  }
  return abs;
}

/** `true` when a path is in the SHIP tree (public/) vs the disposable working trees (out/, test-video/). */
export function isShipPath(target: string): boolean {
  const abs = path.resolve(REPO_ROOT, target);
  return isInside(abs, path.join(REPO_ROOT, 'public'));
}

/**
 * A deterministic-clock/RNG init script, pinned via context.addInitScript so EVERY take renders the same
 * pixels regardless of wall-clock (GAP-64). `seed` defaults to a fixed value for reproducible takes.
 */
export function determinismInitScript(opts: { seedMs?: number; rngSeed?: number } = {}): string {
  const seedMs = opts.seedMs ?? Date.parse('2026-01-01T12:00:00Z');
  const rngSeed = opts.rngSeed ?? 0x9e3779b9;
  return `(() => {
    const FIXED = ${seedMs};
    const _Date = Date;
    // freeze Date.now and new Date() to a fixed instant (animations/timestamps render identically)
    const F = function (...a) { return a.length ? new _Date(...a) : new _Date(FIXED); };
    F.now = () => FIXED; F.parse = _Date.parse; F.UTC = _Date.UTC; F.prototype = _Date.prototype;
    // eslint-disable-next-line no-global-assign
    Date = F;
    // seeded Math.random (mulberry32) so any randomized UI is reproducible
    let s = ${rngSeed} >>> 0;
    Math.random = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  })();`;
}

/**
 * A browser-realism ("stealth") init script so a demo capture of PUBLIC content isn't blocked by naive
 * automation detection (e.g. Google's `navigator.webdriver` "unusual traffic" reCAPTCHA wall). This is for
 * recording public pages in a screencast — NOT for evading auth, scraping at scale, or abusing a service.
 * Pairs with the `--disable-blink-features=AutomationControlled` launch flag.
 */
export function stealthInitScript(): string {
  return `(() => {
    try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch (e) {}
    try { Object.defineProperty(navigator, 'languages', { get: () => ['en-US','en'] }); } catch (e) {}
    try { if (!window.chrome) window.chrome = { runtime: {} }; } catch (e) {}
  })();`;
}

/**
 * A `requestAnimationFrame` "frame pump": forces a tiny recomposite every frame via an invisible node, so
 * Chrome keeps producing compositor frames and `page.screencast` streams continuously (~30–60 fps). Without
 * this, a page with no visible animation (e.g. a static page while only the CURSOR moves) emits almost no
 * screencast frames and cursor motion is never captured (GAP-62/63). Paired with `page.bringToFront()`.
 */
export function framePumpInitScript(): string {
  return `(() => {
    var ID='__vibe-pump';
    function ensure(){ if(document.getElementById(ID) || !document.body) return;
      var st=document.createElement('style');
      st.textContent='@keyframes __vibepump{from{transform:translateZ(0) rotate(0deg)}to{transform:translateZ(0) rotate(360deg)}}';
      (document.head||document.documentElement).appendChild(st);
      var el=document.createElement('div'); el.id=ID;
      el.style.cssText='position:fixed;right:0;bottom:0;width:3px;height:3px;opacity:0.02;pointer-events:none;z-index:0;will-change:transform;animation:__vibepump 0.5s linear infinite';
      document.body.appendChild(el);
    }
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', ensure); else ensure();
    // re-attach on SPA body swaps (Google/site re-render)
    new MutationObserver(ensure).observe(document.documentElement, { childList: true, subtree: true });
  })();`;
}

/**
 * Lock `document.title` to a fixed unique marker so the Chrome WINDOW title is stable + findable — gdigrab
 * captures a window by title (DPI-/position-independent), which is far more robust than region math.
 */
export function titleLockInitScript(marker: string): string {
  const safe = marker.replace(/[`'"\\]/g, '');
  // The WINDOW title is driven by the real document title, NOT a JS getter override — so FORCE-set it and
  // keep re-asserting (sites/navigations reset it). Runs in every document via addInitScript.
  return `(() => {
    var M = '${safe}';
    function set(){ try { if (document.title !== M) document.title = M; } catch (e) {} }
    set();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', set);
    setInterval(set, 400);
  })();`;
}

/** Redact a storage-state / auth path for logs (never print its contents). Pure. */
export function redactAuthRef(authPath: string | undefined): string {
  if (!authPath) return '(none)';
  return `${path.basename(authPath)} (treated as secret)`;
}
