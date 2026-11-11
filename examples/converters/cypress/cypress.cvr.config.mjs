import { defineConfig } from 'cypress';
import { configureVisualRegression } from 'cypress-visual-regression';
import { common } from './cypress.common.mjs';

// cypress-visual-regression: base, actual and diff folders under cypress/snapshots
export default defineConfig({
  ...common,
  expose: {
    ...common.expose,
    visualRegressionType: process.env.CVR_TYPE ?? 'regression',
  },
  e2e: {
    specPattern: 'cypress/e2e/cvr/**/*.cy.js',
    supportFile: 'cypress/support/cvr.js',
    screenshotsFolder: 'cypress/snapshots/actual',
    setupNodeEvents(on) {
      configureVisualRegression(on);
    },
  },
});
