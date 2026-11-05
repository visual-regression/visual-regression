// Renders the HTML fixtures in scripts/examples/ with Playwright's Chromium
// into public/examples/<pair>/{baseline,actual}.png, writes
// public/examples/index.json for the page and public/og.png for link
// previews. Run `pnpm exec playwright install chromium` once, then
// `pnpm --filter @visual-regression/image-diff examples`.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const fixtures = fileURLToPath(new URL('./examples/', import.meta.url));
const out = fileURLToPath(new URL('../public/', import.meta.url));

const pairs = [
  {
    id: 'typo',
    name: 'Typo',
    fixture: 'dashboard',
    variant: 'typo',
    description:
      'One letter in the page heading changed: "Overview" became "Overwiew". A real regression that is only a few dozen pixels big.',
    lookFor:
      'A tight threshold keeps it; a loose one, or a hash, calls the pages the same.',
    engine: 'pixelmatch',
  },
  {
    id: 'button-color',
    name: 'Button color',
    fixture: 'checkout',
    variant: 'button-color',
    description:
      'The primary button and the selected payment method drifted by three RGB points per channel (#4f46e5 → #4c49e2), the trace a changed design token leaves.',
    lookFor:
      'Exact pixels and Resemble.js (ignore: nothing) flag every button pixel; pixelmatch at its default threshold, Resemble.js with ignore: less and SSIM let it pass. Lower the pixelmatch threshold to 0 to catch it.',
    engine: 'exact',
  },
  {
    id: 'layout-shift',
    name: 'Layout shift',
    fixture: 'dashboard',
    variant: 'layout-shift',
    description:
      'The second stat card moved down by 4 px. Nothing inside it changed.',
    lookFor:
      'Pixel engines paint the card edges and its text twice (old and new position); SSIM stays near 1 because the structure is the same, only moved. The blink view shows the move at once.',
    engine: 'ssim',
  },
  {
    id: 'antialiasing',
    name: 'Anti-aliasing',
    fixture: 'dashboard',
    variant: 'antialiasing',
    description:
      'The content was nudged by 0.3 px. Boxes snap back to the same pixels, but every glyph is rasterized at a new sub-pixel offset: pure rendering noise.',
    lookFor:
      'pixelmatch with anti-aliasing detection (includeAA off) and Resemble.js with ignore: antialiasing drop most of it; turn includeAA on to see the noise counted.',
    engine: 'pixelmatch',
  },
  {
    id: 'dynamic-content',
    name: 'Dynamic content',
    fixture: 'dashboard',
    variant: 'dynamic-content',
    description:
      'The clock advanced a minute, the online counter moved, and a different user is signed in (avatar and name). Content that changes on every run.',
    lookFor:
      'Every engine reports it, correctly: these pixels did change. The fix is a mask over the dynamic regions in your tool, not a looser threshold.',
    engine: 'pixelmatch',
  },
  {
    id: 'dark-mode',
    name: 'Dark mode',
    fixture: 'dashboard',
    variant: 'dark-mode',
    description:
      'The same page rendered with the dark theme. Almost every pixel differs.',
    lookFor:
      'Pixel mismatch near 100%, an SSIM near 0, and even the perceptual hash, blind to small changes, has most of its bits flipped.',
    engine: 'exact',
  },
  {
    id: 'compression',
    name: 'JPEG compression',
    fixture: 'blog',
    variant: '',
    jpegQuality: 60,
    // JPEG noise hardly compresses as PNG; a smaller page keeps the file small
    viewport: { width: 640, height: 420 },
    description:
      'The actual image is the same page saved as a JPEG at quality 60 and read back. No real change, but almost no pixel survives the codec untouched.',
    lookFor:
      'Exact pixels and Resemble.js report most of the image; pixelmatch at threshold 0 does too. SSIM stays close to 1 because the structure is intact. Look at the gradient and the serif text for the artifacts.',
    engine: 'ssim',
  },
  {
    id: 'missing-section',
    name: 'Missing section',
    fixture: 'settings',
    variant: 'missing-section',
    fullPage: true,
    description:
      'The "Notifications" section is gone, so everything below it moved up and the full-page screenshot got shorter: the two images have different sizes.',
    lookFor:
      'pixelmatch and SSIM refuse different sizes on their own; the tool pads the shorter image so they can run. Resemble.js reports isSameDimensions: false.',
    engine: 'resemble',
  },
];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 960, height: 600 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

const render = async (fixture, variant, options = {}) => {
  await page.setViewportSize(options.viewport ?? { width: 960, height: 600 });
  const url = new URL(pathToFileURL(`${fixtures}${fixture}.html`));
  if (variant) url.searchParams.set('variant', variant);
  await page.goto(url.href);
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot({ type: 'png', fullPage: Boolean(options.fullPage) });
};

// decode a JPEG in the browser and hand back the pixels as a PNG
/* global document, createImageBitmap -- page.evaluate callbacks run in the browser */
const throughJpeg = async (fixture, quality, options = {}) => {
  await page.setViewportSize(options.viewport ?? { width: 960, height: 600 });
  await page.goto(pathToFileURL(`${fixtures}${fixture}.html`).href);
  const jpeg = await page.screenshot({ type: 'jpeg', quality });
  const dataUrl = await page.evaluate(async (base64) => {
    const response = await fetch(`data:image/jpeg;base64,${base64}`);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    return canvas.toDataURL('image/png');
  }, jpeg.toString('base64'));
  return Buffer.from(dataUrl.split(',')[1], 'base64');
};

for (const pair of pairs) {
  const dir = `${out}examples/${pair.id}/`;
  await mkdir(dir, { recursive: true });
  const baseline = await render(pair.fixture, '', pair);
  const actual = pair.jpegQuality
    ? await throughJpeg(pair.fixture, pair.jpegQuality, pair)
    : await render(pair.fixture, pair.variant, pair);
  await writeFile(`${dir}baseline.png`, baseline);
  await writeFile(`${dir}actual.png`, actual);
  console.log(
    `${pair.id}: baseline ${Math.round(baseline.length / 1024)} KB, actual ${Math.round(actual.length / 1024)} KB`,
  );
}

await writeFile(
  `${out}examples/index.json`,
  JSON.stringify(
    pairs.map(({ id, name, description, lookFor, engine }) => ({
      id,
      name,
      description,
      lookFor,
      engine,
    })),
    null,
    2,
  ) + '\n',
);

await page.setViewportSize({ width: 1200, height: 630 });
await page.goto(pathToFileURL(`${fixtures}og.html`).href);
await writeFile(`${out}og.png`, await page.screenshot({ type: 'png' }));
console.log('og.png written');

await browser.close();
