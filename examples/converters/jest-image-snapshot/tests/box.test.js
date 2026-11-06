// Three element screenshots of the shared page, compared by jest-image-snapshot.
// E2E_VARIANT=b recolors box-b, so exactly that comparison fails.
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
let tab;
beforeAll(async () => {
  browser = await chromium.launch();
  tab = await browser.newPage({
    viewport: { width: 320, height: 200 },
    deviceScaleFactor: 1,
  });
  await tab.goto(page.href);
});
afterAll(async () => {
  await browser?.close();
});

for (const box of ['a', 'b', 'c']) {
  it(`box-${box}`, async () => {
    const image = await tab.locator(`#box-${box}`).screenshot();
    expect(image).toMatchImageSnapshot({
      customSnapshotIdentifier: `box-${box}`,
      storeReceivedOnFailure: true,
      failureThreshold: 0,
      failureThresholdType: 'pixel',
    });
  });
}
