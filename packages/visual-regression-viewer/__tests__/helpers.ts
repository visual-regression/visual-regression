import fs from 'fs';
import path from 'path';
import { deflateSync } from 'zlib';
import { dir, setGracefulCleanup } from 'tmp-promise';
import {
  MANIFEST_SPEC_VERSION,
  summarize,
  type Manifest,
  type ManifestEntry,
} from 'visual-regression-manifest';

setGracefulCleanup();

export const tmpDir = async () => (await dir({ unsafeCleanup: true })).path;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

/** A valid RGBA PNG of the given size filled with one byte value. */
export const png = (width: number, height: number, fill = 0) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height, fill);
  for (let y = 0; y < height; y++) raw[y * (width * 4 + 1)] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

export const writeFile = (file: string, content: string | Buffer) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
};

export const entry = (
  overrides: Partial<ManifestEntry> = {},
): ManifestEntry => ({
  name: 'home',
  test: {
    filePath: 'e2e/home.cy.ts',
    titlePath: ['home', 'renders'],
    retry: 0,
  },
  status: 'failed',
  comparison: { diffRatio: 0.12, maxDiffRatio: 0.01 },
  images: {
    baseline: { path: 'shots/home.png', width: 2, height: 2 },
    actual: { path: 'shots/home.actual.png', width: 2, height: 2 },
    diff: { path: 'shots/home.diff.png' },
  },
  baselineWritten: false,
  recordedAt: '2026-09-22T10:00:00.000Z',
  platform: { osPlatform: 'linux', arch: 'x64', browser: { name: 'chrome' } },
  viewport: { width: 1000, height: 660 },
  renderer: { backend: 'native', browser: 'chrome' },
  message:
    'Image diff factor (12%) is bigger than maximum threshold option 1%.',
  ...overrides,
});

export const manifest = (
  entries: ManifestEntry[] = [entry()],
  overrides: Partial<Manifest> = {},
): Manifest => ({
  reportFormat: 'visual-regression-manifest',
  specVersion: MANIFEST_SPEC_VERSION,
  createdAt: '2026-09-22T10:00:00.000Z',
  updatedAt: '2026-09-22T10:03:00.000Z',
  projectRoot: '/home/runner/work/r/r',
  platform: { osPlatform: 'linux', arch: 'x64', osRelease: '6.8.0' },
  ci: null,
  tool: { name: 'test-tool', version: '1.0.0' },
  options: { updateImages: 'failures-only' },
  runner: { name: 'cypress', version: '16.1.0' },
  summary: summarize(entries),
  entries,
  ...overrides,
});

/** A run directory: one manifest and the images of its entries (baseline, actual and diff each). */
export const writeRun = (
  root: string,
  entries: ManifestEntry[] = [entry()],
  manifestFile = 'visual-regression-manifest.json',
) => {
  writeFile(path.join(root, manifestFile), JSON.stringify(manifest(entries)));
  for (const e of entries) {
    for (const image of [e.images.baseline, e.images.actual, e.images.diff]) {
      if (image.path) writeFile(path.join(root, image.path), png(2, 2));
    }
  }
};
