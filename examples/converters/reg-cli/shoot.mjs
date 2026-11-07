// Takes the three element screenshots reg-cli compares: reg-cli takes a folder of
// images from any source, this one fills `actual/` with the Playwright library.
// E2E_VARIANT=b recolors box-b.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const page = pathToFileURL(
  path.resolve(import.meta.dirname, '../harness/pages/box.html'),
);
page.searchParams.set('variant', process.env.E2E_VARIANT ?? 'a');
const out = path.resolve(import.meta.dirname, 'actual');

const browser = await chromium.launch();
try {
  const tab = await browser.newPage({
    viewport: { width: 320, height: 200 },
    deviceScaleFactor: 1,
  });
  await tab.goto(page.href);
  for (const box of ['a', 'b', 'c']) {
    await tab
      .locator(`#box-${box}`)
      .screenshot({ path: path.join(out, `box-${box}.png`) });
  }
} finally {
  await browser.close();
}
