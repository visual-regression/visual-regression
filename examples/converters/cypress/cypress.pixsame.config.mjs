import { initPlugin as initVisualRegressionPlugin } from '@pixsame/cypress-plugin-visual-regression-diff/plugins';
import { defineConfig } from 'cypress';
import { common } from './cypress.common.mjs';

// pixsame: baseline, .actual and .diff images in __image_snapshots__ next to the spec
export default defineConfig({
  ...common,
  expose: {
    ...common.expose,
    pluginVisualRegressionUpdateImages: process.env.PIXSAME_UPDATE === '1',
    pluginVisualRegressionCreateMissingImages:
      process.env.PIXSAME_CREATE !== '0',
  },
  e2e: {
    specPattern: 'cypress/e2e/pixsame/**/*.cy.js',
    supportFile: 'cypress/support/pixsame.js',
    setupNodeEvents(on, config) {
      initVisualRegressionPlugin(on, config);
      return config;
    },
  },
});
