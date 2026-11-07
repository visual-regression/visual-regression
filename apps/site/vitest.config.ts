import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for the image diff engines and for the claims of the diff
// algorithm guide (app/lib/**); the rest of the site is checked by the build
export default defineConfig({
  resolve: {
    alias: {
      '~~': fileURLToPath(new URL('.', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
  test: { include: ['app/lib/**/*.test.ts'] },
});
