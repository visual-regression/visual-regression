import { fileURLToPath } from 'node:url';
import { defineConfig, configDefaults } from 'vitest/config';

const isCI = !!process.env.CI;

export default defineConfig({
  resolve: {
    // the tests reuse the checks of examples/converters/harness, which import this
    // package by name: point that at the source under test, not a stale dist
    alias: {
      'visual-regression-manifest': fileURLToPath(
        new URL('./src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: isCI
        ? ['text', ['lcovonly', { projectRoot: '../..' }]]
        : ['text', 'lcov'],
      exclude: [
        ...(configDefaults.coverage.exclude ?? []),
        'src/types.ts',
        '__tests__/**',
        '**/examples/**',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 89,
        statements: 90,
      },
    },
  },
});
