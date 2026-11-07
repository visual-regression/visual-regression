import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  expectRealOutput,
  must,
  realOutput,
  tmpDir,
  writePng,
} from '../../__tests__/helpers';
import { validateManifest } from '../reader';
import { fromLostPixel } from './lost-pixel';

describe('fromLostPixel', () => {
  // captured by examples/converters/lost-pixel: Lost Pixel 3 in page-shots mode with
  // pixelmatch; one run with meta.json, one without, one `lost-pixel update`
  describe.each(realOutput('lost-pixel'))(
    'real output of a lost-pixel $mode run',
    ({ mode, root, expectations }) => {
      it('reads the baseline, current and difference folders and the meta file', () => {
        const manifest = fromLostPixel({
          projectRoot: root,
          ci: null,
          update: mode === 'update',
          threshold: 0,
        });
        expectRealOutput(manifest, root, expectations);
        expect(manifest.runner).toEqual({ name: 'lost-pixel' });
        expect(manifest.extra).toBeUndefined();
        const withMeta = mode !== 'compare-no-meta';
        const changed = must(manifest.entries.find((e) => e.name === 'box-b'));
        expect(changed).toMatchObject({
          status: mode === 'update' ? 'updated' : 'failed',
          baselineWritten: mode === 'update',
          // 9600 of the 320x200 pixels: the recolored box
          comparison: { diffRatio: withMeta ? 0.15 : 0, maxDiffRatio: 0 },
          images: {
            baseline: { path: '.lostpixel/baseline/box-b.png' },
            actual: { path: '.lostpixel/current/box-b.png' },
            diff: { path: '.lostpixel/difference/box-b.png' },
          },
        });
        if (withMeta) {
          expect(changed.extra).toEqual({
            lostPixel: {
              pixelDifference: 9600,
              pixelDifferencePercentage: 0.15,
              isWithinThreshold: false,
            },
          });
        } else {
          expect(changed.extra).toBeUndefined();
        }
        const third = must(manifest.entries.find((e) => e.name === 'box-c'));
        expect(third).toMatchObject({
          status: mode === 'update' ? 'created' : 'missing-baseline',
          images: {
            baseline: { path: '.lostpixel/baseline/box-c.png' },
            actual: { path: '.lostpixel/current/box-c.png' },
            diff: { path: null },
          },
        });
        expect(third.variant).toBeUndefined();
      });
    },
  );

  it('reads the labels off the file names and lists baselines nobody shot', async () => {
    const root = await tmpDir();
    const shots = path.join(root, '.lostpixel');
    const name = 'home__[w320px|chromium]';
    writePng(path.join(shots, 'baseline', `${name}.png`), 4, 4, 1);
    writePng(path.join(shots, 'current', `${name}.png`), 4, 4, 2);
    writePng(path.join(shots, 'difference', `${name}.png`), 4, 4, 3);
    writePng(path.join(shots, 'baseline', 'about__[w1024px].png'));
    writePng(path.join(shots, 'current', 'about__[w1024px].png'));
    writePng(path.join(shots, 'baseline', 'gone.png'));
    const manifest = fromLostPixel({
      projectRoot: root,
      ci: null,
      threshold: 8, // a pixel count: half of the 4x4 images
    });
    expect(validateManifest(manifest)).toEqual([]);
    expect(manifest.extra).toEqual({
      lostPixel: { baselinesWithoutShot: ['gone.png'] },
    });
    expect(
      manifest.entries.map((e) => [e.name, e.status, e.variant, e.platform]),
    ).toEqual([
      ['about__[w1024px]', 'passed', 'w1024px', undefined],
      [
        name,
        'failed',
        'w320px|chromium',
        { osPlatform: process.platform, browser: { name: 'chromium' } },
      ],
    ]);
    expect(manifest.entries[1].comparison).toEqual({
      diffRatio: 0,
      maxDiffRatio: 0.5,
    });
  });

  it('takes the meta file from the options, as an object or a path, or ignores it', async () => {
    const root = await tmpDir();
    const shots = path.join(root, 'shots');
    writePng(path.join(shots, 'base', 'a.png'));
    writePng(path.join(shots, 'now', 'a.png'));
    writePng(path.join(shots, 'base', 'b.png'));
    writePng(path.join(shots, 'now', 'b.png'));
    writePng(path.join(shots, 'now', 'c.png'));
    const dirs = {
      projectRoot: root,
      ci: null,
      baselineDir: 'shots/base',
      currentDir: 'shots/now',
      differenceDir: 'shots/delta',
    };
    const meta = {
      a: {
        pixelDifference: 1,
        pixelDifferencePercentage: 0.25,
        isWithinThreshold: false,
      },
      b: {
        pixelDifference: 1,
        pixelDifferencePercentage: 0.25,
        isWithinThreshold: true,
      },
    };
    // the meta file's verdict counts, not a difference image (none here)
    const fromObject = fromLostPixel({ ...dirs, meta, threshold: 0.3 });
    expect(
      fromObject.entries.map((e) => [e.name, e.status, e.comparison]),
    ).toEqual([
      ['a', 'failed', { diffRatio: 0.25, maxDiffRatio: 0.3 }],
      ['b', 'passed', { diffRatio: 0.25, maxDiffRatio: 0.3 }],
      ['c', 'missing-baseline', { diffRatio: 0, maxDiffRatio: 0.3 }],
    ]);
    const file = path.join(root, 'run-meta.json');
    const fs = await import('fs');
    fs.writeFileSync(file, JSON.stringify(meta));
    expect(
      fromLostPixel({ ...dirs, meta: 'run-meta.json' }).entries.map(
        (e) => e.status,
      ),
    ).toEqual(['failed', 'passed', 'missing-baseline']);
    // without meta the files alone decide: nothing differs
    expect(
      fromLostPixel({ ...dirs, meta: false }).entries.map((e) => e.status),
    ).toEqual(['passed', 'passed', 'missing-baseline']);
  });

  it('tells an update run apart with and without the meta file', async () => {
    const root = await tmpDir();
    const shots = path.join(root, '.lostpixel');
    for (const name of ['a', 'b', 'c']) {
      writePng(path.join(shots, 'baseline', `${name}.png`));
      writePng(path.join(shots, 'current', `${name}.png`));
    }
    writePng(path.join(shots, 'difference', 'b.png'));
    const meta = {
      a: {
        pixelDifference: 0,
        pixelDifferencePercentage: 0,
        isWithinThreshold: true,
      },
      b: {
        pixelDifference: 4,
        pixelDifferencePercentage: 1,
        isWithinThreshold: false,
      },
    };
    expect(
      fromLostPixel({
        projectRoot: root,
        ci: null,
        update: true,
        meta,
      }).entries.map((e) => [e.name, e.status, e.baselineWritten]),
    ).toEqual([
      ['a', 'passed', false],
      ['b', 'updated', true],
      ['c', 'created', true],
    ]);
    // without the meta file a baseline the update just wrote looks like a passed shot
    expect(
      fromLostPixel({ projectRoot: root, ci: null, update: true }).entries.map(
        (e) => e.status,
      ),
    ).toEqual(['passed', 'updated', 'passed']);
  });
});
