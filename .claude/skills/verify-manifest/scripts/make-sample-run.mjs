#!/usr/bin/env node
// Writes a small but realistic visual regression run into <dir>, using the BUILT
// manifest package (dist/index.mjs), so it also exercises ManifestWriter.
//   node make-sample-run.mjs <dir>
// Prints the manifest path. The run holds one entry per status that matters:
// failed (with diff), missing-baseline, passed, created. Images are real PNGs.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const dist = path.join(
  repo,
  'packages/visual-regression-manifest/dist/index.mjs',
);
if (!fs.existsSync(dist)) {
  console.error('build first: pnpm --filter visual-regression-manifest build');
  process.exit(1);
}
const { ManifestWriter, getManifestFileName } = await import(
  pathToFileURL(dist)
);

const dir = path.resolve(process.argv[2] ?? '');
if (!process.argv[2]) {
  console.error('usage: make-sample-run.mjs <dir>');
  process.exit(2);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};
/** RGB PNG: solid `bg` with a `box` rectangle of another color, so baseline/actual/diff look different. */
const png = (w, h, bg, box) => {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inBox =
        box &&
        x >= box.x &&
        x < box.x + box.w &&
        y >= box.y &&
        y < box.y + box.h;
      raw.set(inBox ? box.color : bg, y * (w * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};
const W = 160;
const H = 100;
const shots = path.join(dir, 'e2e/__image_snapshots__');
fs.mkdirSync(shots, { recursive: true });
const put = (name, bg, box) =>
  fs.writeFileSync(path.join(shots, name), png(W, H, bg, box));

const WHITE = [255, 255, 255];
const RED = [220, 38, 38];
const BLUE = [37, 99, 235];
// home: baseline has a blue box, actual a shifted one, diff marks both in red
put('home_#0.png', WHITE, { x: 20, y: 20, w: 50, h: 30, color: BLUE });
put('home_#0.actual.png', WHITE, { x: 40, y: 30, w: 50, h: 30, color: BLUE });
put('home_#0.diff.png', [0, 0, 0], { x: 20, y: 20, w: 70, h: 40, color: RED });
// checkout: actual only (no baseline yet)
put('checkout_#0.actual.png', WHITE, {
  x: 10,
  y: 10,
  w: 30,
  h: 30,
  color: BLUE,
});
// about: passes
put('about_#0.png', WHITE, { x: 10, y: 60, w: 100, h: 20, color: BLUE });
// pricing: baseline created on this run
put('pricing_#0.png', WHITE, { x: 60, y: 10, w: 40, h: 40, color: BLUE });

const file = path.join(dir, getManifestFileName());
fs.rmSync(file, { force: true });
const writer = new ManifestWriter(file, {
  projectRoot: dir,
  tool: { name: 'verify-sample-run', version: '0.0.0' },
  runner: { name: 'sample' },
});
const base = {
  testFile: 'e2e/pages.spec.ts',
  maxDiffRatio: 0.01,
  colorThreshold: 0.1,
  colorMetric: 'yiq',
  viewport: { width: W, height: H },
  actualSize: { width: W, height: H },
  baselineSize: { width: W, height: H },
  platform: {
    osPlatform: 'linux',
    browser: { name: 'chromium', version: '130' },
  },
};
const at = (n) => `e2e/__image_snapshots__/${n}`;
writer.record({
  ...base,
  titlePath: ['pages', 'home renders'],
  status: 'failed',
  diffRatio: 0.0825,
  baselinePath: at('home_#0.png'),
  actualPath: at('home_#0.actual.png'),
  diffPath: at('home_#0.diff.png'),
  message:
    'Image diff factor (8.25%) is bigger than maximum threshold option 1%.',
});
writer.record({
  ...base,
  titlePath: ['pages', 'checkout renders'],
  status: 'missing-baseline',
  baselinePath: at('checkout_#0.png'),
  actualPath: at('checkout_#0.actual.png'),
  diffPath: null,
  message: 'No baseline image.',
});
writer.record({
  ...base,
  titlePath: ['pages', 'about renders'],
  status: 'passed',
  diffRatio: 0,
  baselinePath: at('about_#0.png'),
  actualPath: at('about_#0.actual.png'),
});
writer.record({
  ...base,
  titlePath: ['pages', 'pricing renders'],
  status: 'created',
  baselineWritten: true,
  baselinePath: at('pricing_#0.png'),
  actualPath: at('pricing_#0.actual.png'),
});
writer.flush();
console.log(file);
