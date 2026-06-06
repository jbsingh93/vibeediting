import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    globals: false,
    // Integration tests mutate process.env seams (VIBE_PROJECTS_DIR, VIBE_AGENT_BIN…) —
    // never run test FILES in parallel against shared env (parent-repo discipline).
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
