// E2E_BASE_URL: the harness's static server (BackstopJS needs http); E2E_VARIANT=b
// recolors box-b. One scenario per box, each capturing its element only.
const base = process.env.E2E_BASE_URL;
const variant = process.env.E2E_VARIANT ?? 'a';

module.exports = {
  id: 'e2e',
  viewports: [{ label: 'phone', width: 320, height: 200 }],
  scenarios: ['a', 'b', 'c'].map((box) => ({
    label: `box-${box}`,
    url: `${base}/pages/box.html?variant=${variant}`,
    selectors: [`#box-${box}`],
    misMatchThreshold: 0,
    requireSameDimensions: true,
    delay: 0,
  })),
  paths: {
    bitmaps_reference: 'backstop_data/bitmaps_reference',
    bitmaps_test: 'backstop_data/bitmaps_test',
    engine_scripts: 'backstop_data/engine_scripts',
    html_report: 'backstop_data/html_report',
    ci_report: 'backstop_data/ci_report',
    json_report: 'backstop_data/json_report',
  },
  report: ['json'],
  engine: 'puppeteer',
  engineOptions: { args: ['--no-sandbox'] },
  asyncCaptureLimit: 1,
  asyncCompareLimit: 1,
  debug: false,
  debugWindow: false,
};
