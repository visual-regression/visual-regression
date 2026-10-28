// Without customSnapshotIdentifier the baseline is named after the test file, the
// test title and a counter, with a `-snap` postfix: the naming the converter must
// recognize next to the custom one in box.test.js.
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { toMatchImageSnapshot } = require('jest-image-snapshot');

expect.extend({ toMatchImageSnapshot });

const page = pathToFileURL(
  path.resolve(__dirname, '../../harness/pages/box.html'),
);
page.searchParams.set('variant', process.env.E2E_VARIANT ?? 'a');

let browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

it('box-a with the default identifier', async () => {
  const tab = await browser.newPage({
    viewport: { width: 320, height: 200 },
    deviceScaleFactor: 1,
  });
  await tab.goto(page.href);
  expect(await tab.locator('#box-a').screenshot()).toMatchImageSnapshot();
});
