import { defineConfig } from 'cypress';
import getCompareSnapshotsPlugin from 'cypress-image-diff-js/plugin';
import { common } from './cypress.common.mjs';

// cypress-image-diff-js: baseline, comparison and diff folders plus a JSON report
// under cypress/image-diff (its ROOT_DIR, set in cypress-image-diff.config.cjs,
// which the plugin reads from the working directory)
export default defineConfig({
  ...common,
  e2e: {
    specPattern: 'cypress/e2e/image-diff/**/*.cy.js',
    supportFile: 'cypress/support/image-diff.js',
    // the plugin moves every screenshot out of here into its comparison folder
    screenshotsFolder: 'cypress/image-diff/screenshots',
    setupNodeEvents(on, config) {
      return getCompareSnapshotsPlugin(on, config);
    },
  },
});
