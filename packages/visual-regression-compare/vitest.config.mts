import { fileURLToPath } from 'node:url';
import { defineConfig, configDefaults } from 'vitest/config';

const isCI = !!process.env.CI;

export default defineConfig({
  resolve: {
    alias: {
      // test against the source, so the tests do not need a built manifest package
      'visual-regression-manifest': fileURLToPath(
        new URL('../visual-regression-manifest/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    // the tests build manifests in temp directories: CI metadata (a workspace
    // the project root is outside of) must not leak in from the runner
    env: { CI: 'false', GITHUB_ACTIONS: 'false', GITLAB_CI: 'false' },
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: isCI
        ? ['text', ['lcovonly', { projectRoot: '../..' }]]
        : ['text', 'lcov'],
      exclude: [
        ...(configDefaults.coverage.exclude ?? []),
        'src/cli.ts',
        'src/worker.ts',
        'src/types.ts',
        '__tests__/**',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
