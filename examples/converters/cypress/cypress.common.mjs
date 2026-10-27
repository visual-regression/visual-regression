// Shared by the three config files: one page, one viewport, nothing that varies
// between runs. E2E_VARIANT reaches the specs through `expose`.
export const common = {
  video: false,
  screenshotOnRunFailure: false,
  retries: 0,
  viewportWidth: 320,
  viewportHeight: 200,
  // the shared page, served by Cypress's own file server
  fileServerFolder: '../harness',
  expose: { e2eVariant: process.env.E2E_VARIANT ?? 'a' },
};
