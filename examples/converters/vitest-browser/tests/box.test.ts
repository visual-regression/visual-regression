// Three element screenshots of the shared page, compared by toMatchScreenshot.
// E2E_VARIANT=b (through `define`) recolors box-b.
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import markup from '../../harness/pages/box.html?raw';

for (const box of ['a', 'b', 'c']) {
  test(`box-${box}`, async () => {
    // innerHTML keeps the page's style but runs no script: set the variant by hand
    document.body.innerHTML = markup;
    document.body.dataset.variant = import.meta.env.E2E_VARIANT;
    const element = document.querySelector(`#box-${box}`);
    if (!element) throw new Error(`no #box-${box}`);
    await expect(page.elementLocator(element)).toMatchScreenshot(`box-${box}`);
  });
}
