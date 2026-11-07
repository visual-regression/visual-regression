import { defineConfig } from 'vitest/config';

// Unit tests for the image diff engines (app/lib/image-diff); the rest of the site is checked by the build
export default defineConfig({
  test: { include: ['app/lib/**/*.test.ts'] },
});
