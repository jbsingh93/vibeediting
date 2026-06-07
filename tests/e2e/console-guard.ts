import type { Page } from '@playwright/test';

/**
 * Collect real console errors + uncaught page errors. External resource-load failures (favicon /
 * font CDN, or a gitignored media file the Player asks for that isn't on disk) are network noise,
 * not app bugs — the "zero console errors" rule targets JavaScript errors in our own code.
 */
export function attachConsoleGuard(page: Page): { errors: () => string[] } {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/Failed to load resource/i.test(text)) return; // favicon / font CDN / 404 media
    errors.push(text);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return { errors: () => errors };
}
