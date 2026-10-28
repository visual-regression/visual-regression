import { addMatchImageSnapshotPlugin } from '@simonsmith/cypress-image-snapshot/plugin';
import { defineConfig } from 'cypress';
import { common } from './cypress.common.mjs';

// @simonsmith/cypress-image-snapshot: snapshots next to the screenshots folder
export default defineConfig({
  ...common,
  expose: {
    ...common.expose,
    updateSnapshots: process.env.CIS_UPDATE === '1',
    requireSnapshots: process.env.CIS_REQUIRE === '1',
  },
  e2e: {
    specPattern: 'cypress/e2e/image-snapshot/**/*.cy.js',
    supportFile: 'cypress/support/image-snapshot.js',
    screenshotsFolder: 'cypress/image-snapshot/screenshots',
    setupNodeEvents(on) {
      addMatchImageSnapshotPlugin(on);
    },
  },
});
