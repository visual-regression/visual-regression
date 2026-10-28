import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    'import.meta.env.E2E_VARIANT': JSON.stringify(
      process.env.E2E_VARIANT ?? 'a',
    ),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [
        { browser: 'chromium', viewport: { width: 320, height: 200 } },
      ],
      expect: {
        toMatchScreenshot: {
          comparatorName: 'pixelmatch',
          comparatorOptions: { allowedMismatchedPixelRatio: 0 },
        },
      },
    },
  },
});
