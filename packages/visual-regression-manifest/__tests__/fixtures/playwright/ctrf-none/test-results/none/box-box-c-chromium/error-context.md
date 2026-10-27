# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: box.spec.mjs >> box-c
- Location: tests/box.spec.mjs:8:3

# Error details

```
Error: A snapshot doesn't exist at /Users/jakubfreisler/Projects/Web/visual-regression/examples/converters/playwright/tests/box.spec.mjs-snapshots/box-c-chromium-darwin.png.
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
     |                                              ^ Error: A snapshot doesn't exist at /Users/jakubfreisler/Projects/Web/visual-regression/examples/converters/playwright/tests/box.spec.mjs-snapshots/box-c-chromium-darwin.png.
  11 |   });
  12 | }
  13 | 
```