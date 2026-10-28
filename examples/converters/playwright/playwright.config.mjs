import { defineConfig } from '@playwright/test';

// PW_OUTPUT: one output folder per compare mode, so a run never deletes another's
// attachments; the reports go next to it. PW_UPDATE: Playwright's updateSnapshots.
const output = process.env.PW_OUTPUT ?? 'test-results/run';
const reports = `${output}-reports`;

export default defineConfig({
  testDir: 'tests',
  outputDir: output,
  workers: 1,
  retries: 0,
  ...(process.env.PW_UPDATE ? { updateSnapshots: process.env.PW_UPDATE } : {}),
  use: { viewport: { width: 320, height: 200 }, deviceScaleFactor: 1 },
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixels: 0,
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  reporter: [
    ['json', { outputFile: `${reports}/report.json` }],
    [
      'playwright-ctrf-json-reporter',
      { outputDir: reports, outputFile: 'ctrf-report.json' },
    ],
  ],
});
