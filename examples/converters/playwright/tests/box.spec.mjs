// Three element screenshots of the shared page; E2E_VARIANT=b recolors box-b.
import { expect, test } from '@playwright/test';

const page = new URL('../../harness/pages/box.html', import.meta.url);
page.searchParams.set('variant', process.env.E2E_VARIANT ?? 'a');

for (const box of ['a', 'b', 'c']) {
  test(`box-${box}`, async ({ page: tab }) => {
    await tab.goto(page.href);
    await expect(tab.locator(`#box-${box}`)).toHaveScreenshot(`box-${box}.png`);
  });
}
