/**
 * Ambient shim for the ON-DEMAND `playwright` package (GAP-67).
 *
 * Screen-record capture (`record-session.ts`, `cdp-screencast.ts`) imports `playwright`
 * dynamically so a fresh scaffold type-checks and the fast test suite runs WITHOUT a browser
 * installed. But `tsc` still resolves a dynamic `import('playwright')` whenever those files are
 * pulled into the compilation graph (e.g. `_tests/p1n-screen-record-cli.test.ts` imports
 * `record-session` to unit-test `isFrozenCapture`). Without this shim that fails with
 * `TS2307: Cannot find module 'playwright'` until the optional `npm i -D playwright` runs.
 *
 * This declares the module as `any`. When the user actually installs playwright, the real
 * package types in node_modules take precedence; the capture code uses `pw: any` regardless.
 */
declare module 'playwright';
