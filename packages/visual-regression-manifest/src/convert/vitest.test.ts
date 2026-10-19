import path from 'path';
import { describe, expect, it } from 'vitest';
import { tmpDir, writePng } from '../../__tests__/helpers';
import { validateManifest } from '../reader';
import { fromVitestScreenshots, parseVitestScreenshotName } from './vitest';

describe('parseVitestScreenshotName', () => {
  it('splits the browser and platform suffix off', () => {
    expect(parseVitestScreenshotName('button-chromium-darwin')).toEqual({
      name: 'button',
      browser: 'chromium',
      os: 'darwin',
    });
    expect(parseVitestScreenshotName('my-button-webkit-linux')).toEqual({
      name: 'my-button',
      browser: 'webkit',
      os: 'linux',
    });
    expect(parseVitestScreenshotName('plain')).toEqual({ name: 'plain' });
  });
});

describe('fromVitestScreenshots', () => {
  it('pairs references with their attachments and infers the status', async () => {
    const root = await tmpDir();
    const tests = path.join(root, 'tests');
    const shots = path.join(tests, '__screenshots__', 'button.test.ts');
    const attachments = path.join(
      tests,
      '.vitest',
      'attachments',
      'button.test.ts',
    );
    writePng(path.join(shots, 'button-chromium-darwin.png'), 4, 4, 1);
    writePng(path.join(shots, 'card-chromium-darwin.png'), 2, 2, 1);
    writePng(
      path.join(attachments, 'button-chromium-darwin-actual.png'),
      4,
      4,
      2,
    );
    writePng(
      path.join(attachments, 'button-chromium-darwin-diff.png'),
      4,
      4,
      3,
    );
    writePng(path.join(attachments, 'new-chromium-darwin-actual.png'), 3, 3, 2);
    writePng(path.join(root, 'unrelated.png'));

    const manifest = fromVitestScreenshots({
      projectRoot: root,
      ci: null,
      maxDiffRatio: 0.01,
    });
    expect(validateManifest(manifest)).toEqual([]);
    expect(manifest.runner).toEqual({ name: 'vitest' });
    expect(manifest.summary).toMatchObject({
      entries: 3,
      failed: 1,
      missingBaseline: 1,
      passed: 1,
    });
    expect(
      manifest.entries.map((e) => [
        e.name,
        e.status,
        e.test.filePath,
        e.images.baseline.path,
        e.images.actual.path,
        e.images.diff.path,
        e.platform,
        e.comparison.maxDiffRatio,
      ]),
    ).toEqual([
      [
        'button-chromium-darwin',
        'failed',
        'tests/button.test.ts',
        'tests/__screenshots__/button.test.ts/button-chromium-darwin.png',
        'tests/.vitest/attachments/button.test.ts/button-chromium-darwin-actual.png',
        'tests/.vitest/attachments/button.test.ts/button-chromium-darwin-diff.png',
        { osPlatform: 'darwin', browser: { name: 'chromium' } },
        0.01,
      ],
      [
        'card-chromium-darwin',
        'passed',
        'tests/button.test.ts',
        'tests/__screenshots__/button.test.ts/card-chromium-darwin.png',
        null,
        null,
        { osPlatform: 'darwin', browser: { name: 'chromium' } },
        0.01,
      ],
      [
        'new-chromium-darwin',
        'missing-baseline',
        'tests/button.test.ts',
        'tests/__screenshots__/button.test.ts/new-chromium-darwin.png',
        'tests/.vitest/attachments/button.test.ts/new-chromium-darwin-actual.png',
        null,
        { osPlatform: 'darwin', browser: { name: 'chromium' } },
        0.01,
      ],
    ]);
    expect(manifest.entries[0].images.baseline).toMatchObject({
      width: 4,
      height: 4,
    });
    expect(manifest.entries[0].images.actual).toMatchObject({
      width: 4,
      height: 4,
    });
  });

  it('turns a pixel-count limit into a ratio of the image size', async () => {
    const root = await tmpDir();
    const shots = path.join(root, '__screenshots__', 'a.test.ts');
    const attachments = path.join(root, '.vitest', 'attachments', 'a.test.ts');
    writePng(path.join(shots, 'small-chromium-darwin.png'), 10, 10, 1);
    writePng(
      path.join(attachments, 'small-chromium-darwin-actual.png'),
      10,
      10,
      2,
    );
    writePng(path.join(attachments, 'new-chromium-darwin-actual.png'), 5, 4, 2);
    writePng(path.join(shots, 'both-chromium-darwin.png'), 10, 10, 1);
    writePng(
      path.join(attachments, 'both-chromium-darwin-actual.png'),
      10,
      10,
      2,
    );

    const byName = (options: object) =>
      Object.fromEntries(
        fromVitestScreenshots({
          projectRoot: root,
          ci: null,
          ...options,
        }).entries.map((e) => [e.name, e.comparison]),
      );
    expect(byName({ maxDiffPixels: 5 })).toMatchObject({
      'small-chromium-darwin': { maxDiffRatio: 0.05 },
      'new-chromium-darwin': { maxDiffRatio: 0.25 },
    });
    // a count and a ratio at once: the stricter limit
    expect(byName({ maxDiffPixels: 5, maxDiffRatio: 0.01 })).toMatchObject({
      'both-chromium-darwin': { maxDiffRatio: 0.01 },
    });
    // without a limit the field stays absent
    expect(byName({})['small-chromium-darwin']).toEqual({ diffRatio: 0 });
    expect(byName({ colorThreshold: 0.2 })['small-chromium-darwin']).toEqual({
      diffRatio: 0,
      colorThreshold: 0.2,
      colorMetric: 'yiq',
    });
  });

  it('honours custom folder names, scan roots and a runner', async () => {
    const root = await tmpDir();
    writePng(path.join(root, 'src', 'shots', 'a.test.ts', 'hero.png'));
    writePng(path.join(root, 'src', 'out', 'a.test.ts', 'hero-actual.png'));
    writePng(path.join(root, 'elsewhere', 'shots', 'b.test.ts', 'x.png'));

    const manifest = fromVitestScreenshots({
      projectRoot: root,
      ci: null,
      roots: ['src'],
      screenshotsDirName: 'shots',
      attachmentsDir: 'out',
      runner: { name: 'vitest', version: '4.0.0' },
    });
    expect(manifest.runner).toEqual({ name: 'vitest', version: '4.0.0' });
    expect(manifest.entries.map((e) => [e.name, e.status, e.platform])).toEqual(
      [['hero', 'failed', undefined]],
    );
  });

  it('yields an empty manifest for a project without screenshots', async () => {
    const root = await tmpDir();
    expect(
      fromVitestScreenshots({ projectRoot: root, ci: null }).entries,
    ).toEqual([]);
  });
});
