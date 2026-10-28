import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // a mode runs a whole tool: browser start, three screenshots, a report
    testTimeout: 10 * 60_000,
    hookTimeout: 10 * 60_000,
    // the examples write into their own folders; two tools at once would still race on CPU
    fileParallelism: false,
  },
});
