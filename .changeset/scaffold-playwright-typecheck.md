---
"vibeediting": patch
---

Fix `npm run lint` failing on a freshly-scaffolded project (TS2307: Cannot find module 'playwright').

Screen-record capture imports `playwright` dynamically because it's an on-demand devDep (GAP-67),
and `tsconfig.json` excludes those files — but the unit test `p1n-screen-record-cli.test.ts`
imports `record-session.ts` to test `isFrozenCapture`, which dragged it back into `tsc`'s graph and
re-surfaced the unresolved `import('playwright')`. Added an ambient module shim
(`capabilities/screen-record/playwright.d.ts`) so the scaffold type-checks before the optional
`npm i -D playwright`; the real types take over once it's installed. Fixes the `scaffold e2e` CI job
on macOS and Windows.
