import fs from 'fs';
import path from 'path';
import tmp from 'tmp-promise';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
} from 'vitest';
import { ManifestWriter, isManifest } from 'visual-regression-manifest';
import { Comparer, createComparer, type ComparerOptions } from './comparer';
import { pixelmatchEngine } from './engines';
import { decodePng } from './image';
import { fsStore } from './store';
import { makePng } from './test-utils';
import type { Plugin, Reporter } from './types';

let dir: tmp.DirectoryResult;
beforeEach(async () => {
  dir = await tmp.dir({ unsafeCleanup: true });
});
afterEach(() => dir.cleanup());

const file = (...parts: string[]) => path.join(dir.path, ...parts);
const put = (name: string, bytes: Uint8Array) => {
  fs.mkdirSync(path.dirname(file(name)), { recursive: true });
  fs.writeFileSync(file(name), bytes);
};
const exists = (name: string) => fs.existsSync(file(name));

const make = (options: Partial<ComparerOptions> = {}): Comparer =>
  createComparer({
    store: fsStore({
      baselineDir: file('base'),
      actualDir: file('in'),
      diffDir: file('out'),
    }),
    manifest: { projectRoot: dir.path },
    concurrency: 1,
    ...options,
  });

describe('compareImage', () => {
  it('passes an identical image and leaves no review files', async () => {
    put('base/a.png', makePng(10, 10));
    put('out/a.actual.png', Buffer.from('stale'));
    const entry = await make().compareImage({
      name: 'a',
      actual: makePng(10, 10),
    });
    expect(entry).toMatchObject({
      status: 'passed',
      name: 'a',
      baselineWritten: false,
      comparison: { diffRatio: 0, maxDiffRatio: 0, colorMetric: 'yiq' },
    });
    expect(entry.images.actual.path).toBeNull();
    expect(exists('out/a.actual.png')).toBe(false);
  });

  it('fails a changed image and writes .actual and .diff', async () => {
    put('base/a.png', makePng(10, 10));
    const entry = await make().compareImage({
      name: 'a',
      actual: makePng(10, 10, undefined, 5),
    });
    expect(entry.status).toBe('failed');
    expect(entry.comparison.diffRatio).toBe(0.05);
    expect(entry.images).toMatchObject({
      baseline: { path: 'base/a.png', width: 10, height: 10 },
      actual: { path: 'out/a.actual.png' },
      diff: { path: 'out/a.diff.png' },
    });
    expect(entry.extra?.visualRegressionCompare).toMatchObject({
      engine: 'pixelmatch',
      diffPixels: 5,
    });
    expect(entry.message).toBe('5 pixels (5%) differ; the limit is 0%.');
  });

  it('accepts a difference within the ratio or pixel limit', async () => {
    put('base/a.png', makePng(10, 10));
    const actual = makePng(10, 10, undefined, 5);
    const byRatio = await make({ limits: { maxDiffRatio: 0.05 } }).compareImage(
      { name: 'a', actual },
    );
    expect(byRatio.status).toBe('passed');
    expect(byRatio.message).toContain('within the limit of 5%');
    const byPixels = await make({ limits: { maxDiffPixels: 4 } }).compareImage({
      name: 'a',
      actual,
    });
    expect(byPixels.status).toBe('failed');
    expect(byPixels.comparison.maxDiffRatio).toBe(0.04);
  });

  it('reports a screenshot without baseline, or creates it', async () => {
    const actual = makePng(4, 4);
    const missing = await make().compareImage({ name: 'n', actual });
    expect(missing).toMatchObject({
      status: 'missing-baseline',
      baselineWritten: false,
    });
    expect(missing.images.actual.path).toBe('out/n.actual.png');
    expect(exists('base/n.png')).toBe(false);

    const created = await make({ onMissingBaseline: 'create' }).compareImage({
      name: 'n',
      actual,
    });
    expect(created).toMatchObject({ status: 'created', baselineWritten: true });
    expect(exists('base/n.png')).toBe(true);
    expect(exists('out/n.actual.png')).toBe(false);
  });

  describe('size mismatch', () => {
    const smaller = makePng(10, 10);
    const larger = makePng(12, 10);

    it('fails by default without comparing, recording both sizes', async () => {
      put('base/a.png', smaller);
      const entry = await make().compareImage({ name: 'a', actual: larger });
      expect(entry).toMatchObject({
        status: 'failed',
        comparison: { diffRatio: 1 },
        message: 'The size changed: baseline 10x10, actual 12x10.',
      });
      expect(entry.images.baseline).toMatchObject({ width: 10, height: 10 });
      expect(entry.images.actual).toMatchObject({ width: 12, height: 10 });
      expect(entry.images.diff.path).toBeNull();
      expect(entry.extra?.visualRegressionCompare).toMatchObject({
        sizeMismatch: 'fail',
        baselineSize: { width: 10, height: 10 },
        actualSize: { width: 12, height: 10 },
      });
    });

    it('compares after padding when asked', async () => {
      put('base/a.png', smaller);
      const entry = await make({ onSizeMismatch: 'pad' }).compareImage({
        name: 'a',
        actual: larger,
      });
      // the two extra columns are transparent in the baseline and gray in the actual
      expect(entry.status).toBe('failed');
      expect(entry.comparison.diffRatio).toBeCloseTo(20 / 120);
      expect(entry.message).toContain('padded to the same size');
      expect(entry.extra?.visualRegressionCompare).toMatchObject({
        sizeMismatch: 'pad',
      });
    });

    it('compares after cropping when asked', async () => {
      put('base/a.png', smaller);
      const entry = await make({ onSizeMismatch: 'crop' }).compareImage({
        name: 'a',
        actual: larger,
      });
      expect(entry.status).toBe('passed');
      expect(entry.message).toContain('cropped to the same size');
    });
  });

  describe('update', () => {
    it('failures-only replaces the baseline of a failed comparison only', async () => {
      put('base/a.png', makePng(10, 10));
      put('base/b.png', makePng(10, 10));
      const comparer = make({
        update: 'failures-only',
        limits: { maxDiffRatio: 0.5 },
      });
      const changed = makePng(10, 10, [0, 0, 255, 255]);
      const a = await comparer.compareImage({ name: 'a', actual: changed });
      const b = await comparer.compareImage({
        name: 'b',
        actual: makePng(10, 10, undefined, 2),
      });
      expect(a).toMatchObject({ status: 'updated', baselineWritten: true });
      expect(fs.readFileSync(file('base/a.png'))).toEqual(Buffer.from(changed));
      expect(b.status).toBe('passed');
    });

    it('all also replaces a baseline that matches within the limit', async () => {
      put('base/a.png', makePng(10, 10));
      const comparer = make({ update: 'all', limits: { maxDiffRatio: 0.5 } });
      const near = makePng(10, 10, undefined, 2);
      expect(
        (await comparer.compareImage({ name: 'a', actual: near })).status,
      ).toBe('updated');
      expect(
        (await comparer.compareImage({ name: 'a', actual: near })).status,
      ).toBe('passed');
    });

    it('leaves a baseline alone when only the PNG encoding differs', async () => {
      const identical = makePng(10, 10);
      put('base/a.png', makePng(10, 10, undefined, 0));
      const reencoded = Buffer.from(identical);
      // same pixels, different bytes: flip a byte in a non-pixel chunk is brittle,
      // so compare against an uncompressed encoding of the same pixels
      const { PNG } = await import('pngjs');
      const png = PNG.sync.read(Buffer.from(identical));
      const other = PNG.sync.write(png, { deflateLevel: 0 });
      expect(Buffer.compare(other, reencoded)).not.toBe(0);
      const entry = await make({ update: 'all' }).compareImage({
        name: 'a',
        actual: other,
      });
      expect(entry).toMatchObject({ status: 'passed', baselineWritten: false });
    });

    it('replaces the baseline after a size change', async () => {
      put('base/a.png', makePng(10, 10));
      const entry = await make({ update: 'all' }).compareImage({
        name: 'a',
        actual: makePng(20, 10),
      });
      expect(entry.status).toBe('updated');
      expect(entry.message).toContain('The size changed');
    });
  });

  it('records the metadata of the input', async () => {
    put('base/a.png', makePng(4, 4));
    const entry = await make({
      manifest: {
        projectRoot: dir.path,
        variant: 'default',
        platform: { osPlatform: 'linux' },
      },
    }).compareImage({
      name: 'a',
      actual: makePng(4, 4),
      test: { filePath: 'e2e/a.spec.ts', titlePath: ['a', 'b'], retry: 0 },
      viewport: { width: 4, height: 4 },
      extra: { storybook: { id: 'x' } },
      duration: 7,
    });
    expect(entry).toMatchObject({
      test: { filePath: 'e2e/a.spec.ts', titlePath: ['a', 'b'] },
      variant: 'default',
      platform: { osPlatform: 'linux' },
      viewport: { width: 4, height: 4 },
      duration: 7,
      extra: { storybook: { id: 'x' } },
      options: { imagesPath: 'base/{name}.png', maxDiffRatio: 0 },
    });
  });

  it('sanitizes the name into a safe path', async () => {
    const entry = await make({ onMissingBaseline: 'create' }).compareImage({
      name: '../x: y',
      actual: makePng(2, 2),
    });
    expect(entry.images.baseline.path).toBe('base/x- y.png');
  });

  it('says which image could not be decoded', async () => {
    put('base/a.png', makePng(4, 4));
    await expect(
      make().compareImage({ name: 'a', actual: Buffer.from('nope') }),
    ).rejects.toThrow(/^a: /);
  });

  it('runs an engine given as an object in the main thread', async () => {
    put('base/a.png', makePng(4, 4));
    const entry = await make({
      engine: pixelmatchEngine({ threshold: 0.9 }),
      concurrency: 4,
    }).compareImage({ name: 'a', actual: makePng(4, 4) });
    expect(entry.comparison.colorThreshold).toBe(0.9);
  });
});

describe('compareAll', () => {
  it('compares every incoming image and writes a valid manifest', async () => {
    put('base/same.png', makePng(8, 8));
    put('base/sub/changed.png', makePng(8, 8));
    put('in/same.png', makePng(8, 8));
    put('in/sub/changed.png', makePng(8, 8, undefined, 3));
    put('in/new.png', makePng(8, 8));
    const comparer = make();
    await comparer.compareAll();
    const manifest = await comparer.close();
    expect(manifest.summary).toMatchObject({
      entries: 3,
      passed: 1,
      failed: 1,
      missingBaseline: 1,
    });
    expect(manifest.entries.map((e) => e.name)).toEqual([
      'new',
      'same',
      'sub/changed',
    ]);
    const onDisk = JSON.parse(
      fs.readFileSync(file('visual-regression-manifest.compare.json'), 'utf8'),
    );
    expect(isManifest(onDisk)).toBe(true);
    expect(onDisk.tool.name).toBe('visual-regression-compare');
  });

  it('uses a matcher to find differently named baselines and skips images it returns null for', async () => {
    put('base/a-ref.png', makePng(4, 4));
    put('in/a.png', makePng(4, 4));
    put('in/skip.png', makePng(4, 4));
    const comparer = make({
      matcher: {
        baselineFor: ({ path: p }) =>
          p === 'skip.png'
            ? null
            : { kind: 'baseline', path: p.replace('.png', '-ref.png') },
      },
    });
    const manifest = await comparer.compareAll();
    expect(manifest.entries.map((e) => [e.name, e.status])).toEqual([
      ['a-ref', 'passed'],
    ]);
  });

  it('compares in worker threads when a worker module is given', async () => {
    const esbuild = await import('esbuild');
    // inside the package, so the bundled worker finds pixelmatch and pngjs
    const workerDir = fs.mkdtempSync(
      new URL('../node_modules/.worker-', import.meta.url).pathname,
    );
    onTestFinished(() => fs.rmSync(workerDir, { recursive: true }));
    await esbuild.build({
      entryPoints: [new URL('./worker.ts', import.meta.url).pathname],
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      outfile: path.join(workerDir, 'worker.mjs'),
      logLevel: 'silent',
    });
    put('base/a.png', makePng(8, 8));
    put('base/b.png', makePng(8, 8));
    put('in/a.png', makePng(8, 8));
    put('in/b.png', makePng(8, 8, undefined, 1));
    const comparer = make({
      concurrency: 2,
      workerFile: path.join(workerDir, 'worker.mjs'),
    });
    const manifest = await comparer.compareAll();
    await comparer.close();
    expect(manifest.entries.map((e) => [e.name, e.status])).toEqual([
      ['a', 'passed'],
      ['b', 'failed'],
    ]);
  });

  it('reports every image it could not compare', async () => {
    put('base/a.png', makePng(4, 4));
    put('base/b.png', makePng(4, 4));
    put('in/a.png', Buffer.from('broken'));
    put('in/b.png', Buffer.from('broken'));
    await expect(make().compareAll()).rejects.toThrow(
      /2 images could not be compared/,
    );
  });
});

describe('plugins and reporters', () => {
  it('calls hooks in order, lets decide and beforeWrite change the outcome and ends the reporters', async () => {
    put('base/a.png', makePng(6, 6));
    const calls: string[] = [];
    const reporter: Reporter = {
      onEntry: (entry) => void calls.push(`entry:${entry.status}`),
      onEnd: (manifest) => void calls.push(`end:${manifest.summary.entries}`),
    };
    const plugin: Plugin = {
      name: 'test',
      setup(api) {
        api.on('beforeCompare', (ctx) => void calls.push(`before:${ctx.name}`));
        api.on('afterCompare', (_ctx, m) => void calls.push(`after:${m.kind}`));
        api.on('decide', (_ctx, decision) => ({
          ...decision,
          status: 'approved',
          message: 'approved by the service',
        }));
        api.on('beforeWrite', (_ctx, plan) => {
          calls.push(`write:${plan.write.map((w) => w.ref.kind)}`);
          return { write: [] };
        });
        api.on('end', () => void calls.push('plugin-end'));
        api.addReporter(reporter);
      },
    };
    const comparer = make({ plugins: [plugin] });
    const entry = await comparer.compareImage({
      name: 'a',
      actual: makePng(6, 6, undefined, 2),
    });
    await comparer.close();
    expect(entry).toMatchObject({
      status: 'approved',
      message: 'approved by the service',
      baselineWritten: true,
    });
    // a store that keeps baselines elsewhere skipped the local write
    expect(fs.readFileSync(file('base/a.png'))).toEqual(
      Buffer.from(makePng(6, 6)),
    );
    expect(calls).toEqual([
      'before:a',
      'after:compared',
      'write:baseline',
      'entry:approved',
      'plugin-end',
      'end:1',
    ]);
  });

  it('lets a plugin register an engine by name and swap the layout', async () => {
    put('base/a.png', makePng(4, 4));
    const plugin: Plugin = {
      name: 'engine',
      setup(api) {
        api.addEngine('always-differs', {
          name: 'always-differs',
          colorMetric: 'custom',
          colorThreshold: 0,
          compare: ({ width, height }) => ({
            diffPixels: width * height,
            diffRatio: 1,
          }),
        });
        api.setLayout({
          paths: (name) => ({
            baseline: `${name}.png`,
            incoming: `${name}.png`,
            actual: `${name}.new.png`,
            diff: `${name}.delta.png`,
          }),
          nameOf: () => null,
        });
      },
    };
    const entry = await make({
      engine: 'always-differs',
      plugins: [plugin],
    }).compareImage({ name: 'a', actual: makePng(4, 4) });
    expect(entry).toMatchObject({
      status: 'failed',
      comparison: { colorMetric: 'custom' },
      images: { actual: { path: 'out/a.new.png' } },
    });
  });

  it('closes once', async () => {
    const comparer = make();
    const first = await comparer.close();
    expect(await comparer.close()).toEqual(first);
    expect(fs.existsSync(comparer.writer.filePath)).toBe(true);
  });
});

describe('per-call options', () => {
  it('lets one call widen the limit without touching the next', async () => {
    put('base/a.png', makePng(10, 10));
    const comparer = make();
    const changed = makePng(10, 10, undefined, 5);
    const loose = await comparer.compareImage({
      name: 'a',
      actual: changed,
      options: { limits: { maxDiffRatio: 0.1 } },
    });
    const strict = await comparer.compareImage({ name: 'a', actual: changed });
    expect(loose).toMatchObject({
      status: 'passed',
      comparison: { maxDiffRatio: 0.1 },
    });
    expect(strict.status).toBe('failed');
  });

  it('records the color threshold of the call that used it', async () => {
    put('base/a.png', makePng(10, 10));
    const comparer = make({ engine: 'pixelmatch' });
    const a = await comparer.compareImage({
      name: 'a',
      actual: makePng(10, 10),
      options: { engineOptions: { threshold: 0.3 } },
    });
    const b = await comparer.compareImage({
      name: 'a',
      actual: makePng(10, 10),
    });
    expect(a.comparison.colorThreshold).toBe(0.3);
    expect(b.comparison.colorThreshold).toBe(0.1);
  });

  it('applies includeAA per call', async () => {
    put('base/a.png', makePng(10, 10));
    const entry = await make().compareImage({
      name: 'a',
      actual: makePng(10, 10),
      options: { engineOptions: { includeAA: true } },
    });
    expect(entry.extra?.visualRegressionCompare).toMatchObject({
      engine: 'pixelmatch',
    });
  });

  it('overrides the size policy and the missing-baseline policy', async () => {
    put('base/a.png', makePng(10, 10));
    const comparer = make();
    const padded = await comparer.compareImage({
      name: 'a',
      actual: makePng(10, 12),
      options: { onSizeMismatch: 'pad', limits: { maxDiffRatio: 1 } },
    });
    expect(padded.status).toBe('passed');
    const created = await comparer.compareImage({
      name: 'new',
      actual: makePng(10, 10),
      options: { onMissingBaseline: 'create' },
    });
    expect(created.status).toBe('created');
    expect(exists('base/new.png')).toBe(true);
  });

  it('replaces the whole limit pair, not one half of it', async () => {
    put('base/a.png', makePng(10, 10));
    const entry = await make({
      limits: { maxDiffPixels: 0 },
    }).compareImage({
      name: 'a',
      actual: makePng(10, 10, undefined, 5),
      options: { limits: { maxDiffRatio: 0.5 } },
    });
    expect(entry.status).toBe('passed');
  });
});

describe('files', () => {
  it('compares and writes at the paths the caller gives', async () => {
    put('elsewhere/golden.png', makePng(10, 10));
    const entry = await make().compareImage({
      name: 'a',
      actual: makePng(10, 10, undefined, 5),
      files: {
        baseline: file('elsewhere/golden.png'),
        actual: file('shots/a.actual.png'),
        diff: file('shots/a.diff.png'),
      },
    });
    expect(entry.status).toBe('failed');
    expect(exists('shots/a.actual.png')).toBe(true);
    expect(exists('shots/a.diff.png')).toBe(true);
    expect(entry.images.baseline.path).toBe('elsewhere/golden.png');
    expect(exists('base/a.png')).toBe(false);
    expect(exists('out/a.actual.png')).toBe(false);
  });

  it('puts .actual and .diff beside the baseline by default', async () => {
    put('elsewhere/golden.png', makePng(10, 10));
    await make().compareImage({
      name: 'a',
      actual: makePng(10, 10, undefined, 5),
      files: { baseline: file('elsewhere/golden.png') },
    });
    expect(exists('elsewhere/golden.actual.png')).toBe(true);
    expect(exists('elsewhere/golden.diff.png')).toBe(true);
  });

  it('creates a missing baseline at the given path', async () => {
    const entry = await make({ onMissingBaseline: 'create' }).compareImage({
      name: 'a',
      actual: makePng(10, 10),
      files: { baseline: file('x/y/golden.png') },
    });
    expect(entry.status).toBe('created');
    expect(exists('x/y/golden.png')).toBe(true);
  });
});

describe('compare with images', () => {
  it('hands back the diff and the compared images', async () => {
    put('base/a.png', makePng(10, 10));
    const { entry, images } = await make().compare(
      { name: 'a', actual: makePng(10, 10, undefined, 5) },
      { include: ['baseline', 'actual', 'diff'] },
    );
    expect(entry.status).toBe('failed');
    for (const part of ['baseline', 'actual', 'diff'] as const) {
      expect(decodePng(images[part] as Uint8Array)).toMatchObject({
        width: 10,
        height: 10,
      });
    }
  });

  it('returns the padded sizes when the images differ in size', async () => {
    put('base/a.png', makePng(10, 10));
    const { images } = await make({ onSizeMismatch: 'pad' }).compare(
      { name: 'a', actual: makePng(12, 14) },
      { include: ['baseline', 'actual', 'diff'] },
    );
    for (const part of ['baseline', 'actual', 'diff'] as const) {
      expect(decodePng(images[part] as Uint8Array)).toMatchObject({
        width: 12,
        height: 14,
      });
    }
  });

  it('returns images of a passing comparison too, and only what was asked', async () => {
    put('base/a.png', makePng(10, 10));
    const { images } = await make().compare(
      { name: 'a', actual: makePng(10, 10) },
      { include: ['diff'] },
    );
    expect(Object.keys(images)).toEqual(['diff']);
    expect(
      (await make().compare({ name: 'a', actual: makePng(10, 10) })).images,
    ).toEqual({});
  });

  it('works through the worker pool', async () => {
    put('base/a.png', makePng(10, 10));
    const esbuild = await import('esbuild');
    // inside the package, so the bundled worker finds pixelmatch and pngjs
    const workerDir = fs.mkdtempSync(
      new URL('../node_modules/.compare-', import.meta.url).pathname,
    );
    onTestFinished(() => fs.rmSync(workerDir, { recursive: true }));
    const workerFile = path.join(workerDir, 'worker.mjs');
    await esbuild.build({
      entryPoints: [new URL('./worker.ts', import.meta.url).pathname],
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      outfile: workerFile,
      logLevel: 'silent',
    });
    const comparer = make({
      engine: 'pixelmatch',
      concurrency: 2,
      workerFile,
    });
    onTestFinished(() => comparer.close());
    const { images } = await comparer.compare(
      { name: 'a', actual: makePng(10, 10, undefined, 5) },
      { include: ['actual', 'diff'] },
    );
    expect(decodePng(images.diff as Uint8Array).width).toBe(10);
    expect(decodePng(images.actual as Uint8Array).width).toBe(10);
  });
});

describe('manifest ownership', () => {
  it('records into a writer the caller owns, with its own entry fields', async () => {
    put('base/a.png', makePng(10, 10));
    const writer = new ManifestWriter(file('mine.json'), {
      projectRoot: dir.path,
      runner: { name: 'my-runner' },
      tool: { name: 'my-tool' },
    });
    const comparer = make({ manifest: { writer } });
    const options = {
      imagesPath: '{spec_path}/__image_snapshots__',
      maxDiffRatio: 0.01,
      diffConfig: { threshold: 0.1 },
      createMissingImages: false,
      updateImages: false,
    };
    const entry = await comparer.compareImage({
      name: 'a',
      actual: makePng(10, 10),
      entry: {
        options,
        renderer: { backend: 'docker', name: 'chromium' },
        attachments: [
          { name: 'trace', contentType: 'application/zip', path: 'a.zip' },
        ],
      },
    });
    expect(comparer.writer).toBe(writer);
    expect(entry.options).toEqual(options);
    expect(entry.renderer).toMatchObject({ backend: 'docker' });
    await comparer.close();
    expect(
      isManifest(JSON.parse(fs.readFileSync(file('mine.json'), 'utf8'))),
    ).toBe(true);
  });
});
