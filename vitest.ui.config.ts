import { defineConfig } from 'vitest/config';

/**
 * V4.7 — the ui-app pure-logic unit suite. These exercise the ported client libs
 * (ui-app/src/lib + a couple of component-level pure helpers) with no DOM and no env mutation,
 * so file-parallelism is safe. The root vitest.config.ts excludes ui-app; this config owns it.
 */
export default defineConfig({
  test: {
    include: ['ui-app/src/**/*.test.ts'],
    environment: 'node',
    globals: false,
    fileParallelism: true,
    testTimeout: 20_000,
  },
});
