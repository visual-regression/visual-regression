# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: box.spec.mjs >> box-b
- Location: tests/box.spec.mjs:8:3

# Error details

```
Error: expect(locator).toHaveScreenshot(expected) failed

Locator: locator('#box-b')
  9600 pixels (ratio 1.00 of all image pixels) are different.

  Snapshot: box-b.png

Call log:
  - Expect "toHaveScreenshot(box-b.png)" locator('#box-b') with timeout 5000ms
    - verifying given screenshot expectation
  - waiting for locator('#box-b')
    - locator resolved to <div id="box-b" class="box"></div>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - 9600 pixels (ratio 1.00 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - waiting for locator('#box-b')
    - locator resolved to <div id="box-b" class="box"></div>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - captured a stable screenshot
  - 9600 pixels (ratio 1.00 of all image pixels) are different.

```

# Test source

```ts
  1  | // Three element screenshots of the shared page; E2E_VARIANT=b recolors box-b.
  2  | import { expect, test } from '@playwright/test';
  3  | 
  4  | const page = new URL('../../harness/pages/box.html', import.meta.url);
  5  | page.searchParams.set('variant', process.env.E2E_VARIANT ?? 'a');
  6  | 
  7  | for (const box of ['a', 'b', 'c']) {
  8  |   test(`box-${box}`, async ({ page: tab }) => {
  9  |     await tab.goto(page.href);
> 10 |     await expect(tab.locator(`#box-${box}`)).toHaveScreenshot(`box-${box}.png`);
     |                                              ^ Error: expect(locator).toHaveScreenshot(expected) failed
  11 |   });
  12 | }
  13 | 
```