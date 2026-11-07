// Generates the example image pairs of the diff algorithm guide and the image
// diff tool, then measures every one of them with the real engines.
//
//   pnpm exec playwright install chromium   (once)
//   pnpm --filter @visual-regression/site diff-examples
//
// 1. Renders the HTML fixtures in scripts/diff-examples/ with Chromium into
//    public/diff-examples/ (one shared baseline, one "actual" per pair).
// 2. Bundles app/lib/image-diff/worker.ts, the very worker the tool page runs,
//    and drives it in Chromium: the same decoding, padding and engines.
// 3. Writes the measurements to data/diff-examples.json and the diff images the
//    engines drew to public/diff-examples/diffs/. The guide renders those files;
//    nothing in the guide is typed in by hand.
//
// Limitation: the fixtures use the system fonts of the machine that renders
// them, so on another machine the pixel counts can move by a few pixels and
// the recorded Chromium version changes. The orderings the guide's prose relies
// on are asserted by app/lib/diff-examples.test.ts; rerun it after regenerating.
import { build } from 'esbuild';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const fixtures = here('./diff-examples/');
const publicDir = here('../public/diff-examples/');
const dataFile = here('../data/diff-examples.json');
const manifest = JSON.parse(await readFile(here('../package.json'), 'utf8'));

const VIEWPORT = { width: 960, height: 600 };

/**
 * `render` says how to make the "actual" image of a pair; the baseline is
 * always the unchanged dashboard, except for the pairs that name their own.
 */
const pairs = [
  {
    id: 'subpixel-text',
    title: 'Text shifted by a sub-pixel',
    changed:
      'The content of the page moved 0.3 px to the right. Boxes snap back to the same pixels, but every glyph is rasterized at a new sub-pixel offset: rendering noise, not a change anyone sees.',
    fixture: 'dashboard',
    variant: 'antialiasing',
  },
  {
    id: 'one-pixel-shift',
    title: 'Everything moved by 1 px',
    changed:
      'The main column moved one pixel to the right. Every edge and every glyph in it is in a new place, but the page looks the same.',
    fixture: 'dashboard',
    variant: 'shift-1px',
  },
  {
    id: 'color-tint',
    title: 'Slight color tint',
    changed:
      'The primary button and the selected payment method drifted by three RGB points per channel (#4f46e5 to #4c49e2), the trace a changed design token leaves.',
    fixture: 'checkout',
    variant: 'button-color',
    baselineFixture: 'checkout',
  },
  {
    id: 'jpeg-compression',
    title: 'JPEG compression artifacts',
    changed:
      'The same page, saved as a JPEG at quality 60 and read back. Nothing changed, but almost no pixel survives the codec untouched.',
    fixture: 'blog',
    jpegQuality: 60,
    viewport: { width: 640, height: 420 },
    baselineFixture: 'blog',
  },
  {
    id: 'added-element',
    title: 'An element was added',
    changed:
      'A cookie notice (240 by 80 px, bottom right) appeared over the page. A real, visible regression that covers about 3% of the image.',
    fixture: 'dashboard',
    variant: 'added-element',
  },
  {
    id: 'size-mismatch',
    title: 'Different image sizes',
    changed:
      'A settings section is gone, so everything below it moved up and the full-page screenshot got shorter: the two images have different heights.',
    fixture: 'settings',
    variant: 'missing-section',
    fullPage: true,
    baselineFixture: 'settings',
  },
  {
    id: 'noise',
    title: 'Scattered noise',
    changed:
      'One pixel in twenty differs by up to 2 levels per channel (a seeded generator), the way GPU dithering or a lossy capture scatters stray pixels. Invisible to the eye.',
    fixture: 'dashboard',
    noise: { share: 0.05, amplitude: 2, seed: 7 },
  },
  {
    id: 'typo',
    title: 'One letter changed',
    changed:
      'The page heading says "Overwiew" instead of "Overview": a real regression a few dozen pixels big.',
    fixture: 'dashboard',
    variant: 'typo',
  },
];

/** what the tool measures, in this order; `engine` + `options` is one table column */
const configs = [
  { id: 'exact', engine: 'exact', label: 'Exact', options: {} },
  { id: 'pixelmatch', engine: 'pixelmatch', label: 'pixelmatch', options: {} },
  {
    id: 'pixelmatch-aa',
    engine: 'pixelmatch',
    label: 'pixelmatch, includeAA',
    options: { includeAA: true },
  },
  {
    id: 'pixelmatch-0',
    engine: 'pixelmatch',
    label: 'pixelmatch, threshold 0',
    options: { threshold: 0 },
  },
  {
    id: 'resemble',
    engine: 'resemble',
    label: 'Resemble.js',
    options: {},
  },
  {
    id: 'resemble-0',
    engine: 'resemble',
    label: 'Resemble.js, ignore nothing',
    options: { ignore: 'nothing' },
  },
  {
    id: 'resemble-aa',
    engine: 'resemble',
    label: 'Resemble.js, ignore antialiasing',
    options: { ignore: 'antialiasing' },
  },
  { id: 'ssim', engine: 'ssim', label: 'SSIM', options: {} },
  { id: 'phash', engine: 'phash', label: 'pHash', options: {} },
];

// --- 1. render ---------------------------------------------------------------

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
});
const page = await context.newPage();

const render = async (fixture, { variant, viewport, fullPage } = {}) => {
  await page.setViewportSize(viewport ?? VIEWPORT);
  const url = new URL(pathToFileURL(`${fixtures}${fixture}.html`));
  if (variant) url.searchParams.set('variant', variant);
  await page.goto(url.href);
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot({ type: 'png', fullPage: Boolean(fullPage) });
};

const throughJpeg = async (fixture, quality, viewport) => {
  await page.setViewportSize(viewport ?? VIEWPORT);
  await page.goto(pathToFileURL(`${fixtures}${fixture}.html`).href);
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot({ type: 'jpeg', quality });
};

const withNoise = async (png, { share, amplitude, seed }) => {
  const dataUrl = await page.evaluate(
    async ({ base64, share, amplitude, seed }) => {
      const bitmap = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${base64}`)).blob(),
      );
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      // mulberry32: a seeded generator, so the file is the same on every run
      let state = seed;
      const random = () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      for (let i = 0; i < image.data.length; i += 4) {
        if (random() >= share) continue;
        for (let c = 0; c < 3; c++) {
          const delta = Math.round((random() * 2 - 1) * amplitude) || amplitude;
          image.data[i + c] = Math.max(
            0,
            Math.min(255, image.data[i + c] + delta),
          );
        }
      }
      context.putImageData(image, 0, 0);
      return canvas.toDataURL('image/png');
    },
    { base64: png.toString('base64'), share, amplitude, seed },
  );
  return Buffer.from(dataUrl.split(',')[1], 'base64');
};

await rm(publicDir, { recursive: true, force: true });
await mkdir(`${publicDir}diffs/`, { recursive: true });

const files = new Map();
const baselines = new Map();
for (const pair of pairs) {
  const fixture = pair.baselineFixture ?? pair.fixture;
  const baselineName = `${fixture}${pair.fullPage ? '-full' : ''}${pair.jpegQuality ? '-small' : ''}.png`;
  if (!baselines.has(baselineName)) {
    const png = await render(fixture, {
      viewport: pair.viewport,
      fullPage: pair.fullPage,
    });
    baselines.set(baselineName, png);
    files.set(baselineName, png);
  }
  let actualName;
  let actual;
  if (pair.jpegQuality) {
    actualName = `${pair.id}.jpg`;
    actual = await throughJpeg(pair.fixture, pair.jpegQuality, pair.viewport);
  } else {
    actualName = `${pair.id}.png`;
    actual = await render(pair.fixture, pair);
    if (pair.noise) actual = await withNoise(actual, pair.noise);
  }
  files.set(actualName, actual);
  pair.baselineFile = baselineName;
  pair.actualFile = actualName;
}
for (const [name, bytes] of files)
  await writeFile(`${publicDir}${name}`, bytes);

// --- 2. measure with the real worker ---------------------------------------------

const bundled = await build({
  entryPoints: [here('../app/lib/image-diff/worker.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  logLevel: 'error',
});
const workerSource = bundled.outputFiles[0].text;

await page.goto('about:blank');
await page.evaluate((source) => {
  const url = URL.createObjectURL(
    new Blob([source], { type: 'text/javascript' }),
  );
  globalThis.__worker = new Worker(url);
  let token = 0;
  const pending = new Map();
  globalThis.__worker.addEventListener('message', (event) => {
    const entry = pending.get(event.data.token);
    if (!entry) return;
    pending.delete(event.data.token);
    if (event.data.type === 'error')
      entry.reject(new Error(event.data.message));
    else entry.resolve(event.data);
  });
  globalThis.__worker.addEventListener('error', (event) => {
    for (const entry of pending.values())
      entry.reject(new Error(event.message || 'worker crashed'));
  });
  const toBase64 = async (blob) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  };
  const send = (message) =>
    new Promise((resolve, reject) => {
      const t = ++token;
      pending.set(t, { resolve, reject });
      globalThis.__worker.postMessage({ ...message, token: t });
    });
  const fromBase64 = (base64, type) =>
    new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type });
  globalThis.__measure = async (a, b, aType, bType, runs) => {
    const loaded = await send({
      type: 'load',
      a: fromBase64(a, aType),
      b: fromBase64(b, bType),
      padding: 'magenta',
    });
    const out = [];
    for (const run of runs) {
      const times = [];
      let result;
      for (let i = 0; i < 5; i++) {
        result = (
          await send({ type: 'run', engine: run.engine, options: run.options })
        ).result;
        times.push(result.elapsedMs);
      }
      times.sort((x, y) => x - y);
      out.push({
        id: run.id,
        result: {
          ...result,
          diff: result.diff ? await toBase64(result.diff) : null,
        },
        medianMs: times[2],
      });
    }
    return {
      loaded: {
        a: loaded.a,
        b: loaded.b,
        padded: loaded.padded
          ? { width: loaded.padded.width, height: loaded.padded.height }
          : null,
      },
      out,
    };
  };
}, workerSource);

// the defaults of every engine, as the tool shows them: an option set above is a patch on these
const registry = await build({
  entryPoints: [here('../app/lib/image-diff/engines/infos.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'Engines',
  platform: 'browser',
  target: 'es2022',
  logLevel: 'error',
});
const defaults = await page.evaluate((source) => {
  const { infos } = new Function(`${source}; return Engines;`)();
  return Object.fromEntries(infos.map((info) => [info.id, info.defaults]));
}, registry.outputFiles[0].text);

// the diff images are shown as thumbnails; the tool page draws them at full size
const THUMB_WIDTH = 400;
const thumbnail = async (base64) => {
  const webp = await page.evaluate(
    async ({ base64, width }) => {
      const bitmap = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${base64}`)).blob(),
      );
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = Math.round((bitmap.height * width) / bitmap.width);
      const context = canvas.getContext('2d');
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/webp', 0.8);
    },
    { base64, width: THUMB_WIDTH },
  );
  return Buffer.from(webp.split(',')[1], 'base64');
};

const mime = (name) => (name.endsWith('.jpg') ? 'image/jpeg' : 'image/png');
const measured = [];
for (const pair of pairs) {
  const a = files.get(pair.baselineFile);
  const b = files.get(pair.actualFile);
  const runs = configs.map((c) => ({
    id: c.id,
    engine: c.engine,
    options: { ...defaults[c.engine], ...c.options },
  }));
  const { loaded, out } = await page.evaluate(
    async ([a, b, aType, bType, runs]) =>
      globalThis.__measure(a, b, aType, bType, runs),
    [
      a.toString('base64'),
      b.toString('base64'),
      mime(pair.baselineFile),
      mime(pair.actualFile),
      runs,
    ],
  );
  const results = {};
  for (const { id, result, medianMs } of out) {
    const config = configs.find((c) => c.id === id);
    const primary = result.metrics.find((m) => m.primary);
    results[id] = {
      mismatch: result.mismatch,
      total: result.total,
      unit: result.unit,
      ratio: result.total ? result.mismatch / result.total : 0,
      ...(primary
        ? { primary: { label: primary.label, value: primary.value } }
        : {}),
      metrics: Object.fromEntries(
        result.metrics.map((m) => [m.label, m.value]),
      ),
      medianMs: Math.round(medianMs * 10) / 10,
      notes: result.notes,
    };
    // the five default engines get a diff image for the gallery
    if (result.diff && id === config.engine) {
      await writeFile(
        `${publicDir}diffs/${pair.id}.${id}.webp`,
        await thumbnail(result.diff),
      );
      results[id].diff = `/diff-examples/diffs/${pair.id}.${id}.webp`;
    }
  }
  measured.push({
    id: pair.id,
    title: pair.title,
    changed: pair.changed,
    baseline: `/diff-examples/${pair.baselineFile}`,
    actual: `/diff-examples/${pair.actualFile}`,
    baselineSize: loaded.a,
    actualSize: loaded.b,
    padded: loaded.padded,
    results,
  });
  console.log(
    `${pair.id}: ${configs.map((c) => `${c.id}=${results[c.id].primary?.value ?? `${(results[c.id].ratio * 100).toFixed(2)}%`}`).join(' ')}`,
  );
}

await writeFile(
  dataFile,
  JSON.stringify(
    {
      about:
        'Generated by scripts/make-diff-examples.mjs: every number was measured by the engines of app/lib/image-diff running in Chromium (the same Web Worker as the tool page).',
      engines: {
        pixelmatch: manifest.dependencies.pixelmatch,
        resemblejs: manifest.dependencies.resemblejs,
        'ssim.js': manifest.dependencies['ssim.js'],
      },
      browser: `Chromium ${browser.version()}`,
      configs: configs.map(({ id, engine, label, options }) => ({
        id,
        engine,
        label,
        options,
      })),
      pairs: measured,
    },
    null,
    2,
  ) + '\n',
);
await browser.close();
