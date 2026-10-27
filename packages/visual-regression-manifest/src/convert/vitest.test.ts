import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  expectRealOutput,
  must,
  realOutput,
  tmpDir,
  writePng,
} from '../../__tests__/helpers';
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
  // captured by examples/converters/vitest-browser: Vitest 5, Chromium through
  // Playwright, element screenshots, a compare run on CI and one off CI
  describe.each(realOutput('vitest-browser'))(
    'real output of a $mode run',
    ({ mode, root, expectations }) => {
      it('converts the references and attachments on disk', () => {
        const manifest = fromVitestScreenshots({
          projectRoot: root,
          ci: null,
          maxDiffRatio: 0,
        });
        expectRealOutput(manifest, root, expectations);
        expect(manifest.runner).toEqual({ name: 'vitest' });
        const failed = must(
          manifest.entries.find((e) => e.status === 'failed'),
        );
        const { browser, os } = parseVitestScreenshotName(failed.name);
        const suffix = `${browser}-${os}`;
        expect(failed).toMatchObject({
          name: `box-b-${suffix}`,
          test: { filePath: 'tests/box.test.ts' },
          images: {
            baseline: {
              path: `tests/__screenshots__/box.test.ts/box-b-${suffix}.png`,
              width: 80,
              height: 120,
            },
            actual: {
              path: `.vitest/attachments/tests/box.test.ts/box-b-actual-${suffix}.png`,
              width: 80,
              height: 120,
            },
            diff: {
              path: `.vitest/attachments/tests/box.test.ts/box-b-diff-${suffix}.png`,
            },
          },
          platform: { osPlatform: os, browser: { name: browser } },
        });
        const missing = must(
          manifest.entries.find((e) => e.name === `box-c-${suffix}`),
        );
        if (mode === 'ci') {
          // no reference was written; the screenshot is the `-reference-` attachment
          expect(missing).toMatchObject({
            status: 'missing-baseline',
            images: {
              actual: {
                path: `.vitest/attachments/tests/box.test.ts/box-c-reference-${suffix}.png`,
              },
              diff: { path: null },
            },
          });
        } else {
          // the reference was written; the `-reference-` attachment of the CI run is a leftover
          expect(missing).toMatchObject({
            status: 'passed',
            images: { actual: { path: null }, diff: { path: null } },
          });
        }
      });
    },
  );

  it('turns a pixel-count limit into a ratio of the image size', async () => {
    const root = await tmpDir();
    const shots = path.join(root, '__screenshots__', 'a.test.ts');
    const attachments = path.join(root, '.vitest', 'attachments', 'a.test.ts');
    writePng(path.join(shots, 'small-chromium-darwin.png'), 10, 10, 1);
    writePng(
      path.join(attachments, 'small-actual-chromium-darwin.png'),
      10,
      10,
      2,
    );
    writePng(
      path.join(attachments, 'new-reference-chromium-darwin.png'),
      5,
      4,
      2,
    );
    writePng(path.join(shots, 'both-chromium-darwin.png'), 10, 10, 1);
    writePng(
      path.join(attachments, 'both-actual-chromium-darwin.png'),
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

  it('honors custom folder names, scan roots and a runner, and the kind-last attachment names', async () => {
    const root = await tmpDir();
    writePng(path.join(root, 'src', 'shots', 'a.test.ts', 'hero.png'));
    writePng(path.join(root, 'out', 'src', 'a.test.ts', 'hero-actual.png'));
    writePng(path.join(root, 'elsewhere', 'shots', 'b.test.ts', 'x.png'));
    writePng(path.join(root, 'out', 'cafe1234.png'));

    const manifest = fromVitestScreenshots({
      projectRoot: root,
      ci: null,
      roots: ['src', 'out'],
      screenshotsDirName: 'shots',
      attachmentsDir: 'out',
      runner: { name: 'vitest', version: '4.0.0' },
    });
    expect(manifest.runner).toEqual({ name: 'vitest', version: '4.0.0' });
    expect(
      manifest.entries.map((e) => [
        e.name,
        e.status,
        e.test.filePath,
        e.images.actual.path,
        e.platform,
      ]),
    ).toEqual([
      [
        'hero',
        'failed',
        'src/a.test.ts',
        'out/src/a.test.ts/hero-actual.png',
        undefined,
      ],
    ]);
  });

  it('yields an empty manifest for a project without screenshots', async () => {
    const root = await tmpDir();
    expect(
      fromVitestScreenshots({ projectRoot: root, ci: null }).entries,
    ).toEqual([]);
  });
});
