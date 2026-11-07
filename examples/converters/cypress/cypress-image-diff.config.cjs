// cypress-image-diff-js's own config, read from the working directory. Only the
// image-diff config file loads the plugin, so it affects nothing else.
module.exports = {
  ROOT_DIR: 'cypress/image-diff',
  // off (the default): a missing baseline is copied from the comparison and passes;
  // on: it fails the test and leaves no baseline (CID_FAIL_MISSING=1 in the scenario)
  FAIL_ON_MISSING_BASELINE: process.env.CID_FAIL_MISSING === '1',
  // one JSON report with a fixed name, rewritten by every run
  JSON_REPORT: { FILENAME: 'report', OVERWRITE: true },
};
