import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  expectRealOutput,
  fixtureJson,
  must,
  realOutput,
  tmpDir,
  writePng,
} from '../../__tests__/helpers';
import { validateManifest } from '../reader';
import { fromRegCli, type RegCliReport } from './reg-cli';

describe('fromRegCli', () => {
  // captured by examples/converters/reg-cli: reg-cli 0.18 on element screenshots
  // taken with the Playwright library; one expected image deleted, one orphaned
  describe.each(realOutput('reg-cli'))(
    'real output of a reg-cli $mode run',
    ({ mode, root, expectations }) => {
      it('converts reg.json, resolving its folders against the report', () => {
        const report = fixtureJson<RegCliReport>(root, 'reg.json');
        const manifest = fromRegCli(report, {
          projectRoot: root,
          ci: null,
          update: mode === 'update',
          maxDiffPixels: 0,
        });
        expectRealOutput(manifest, root, expectations);
        expect(manifest.runner).toEqual({ name: 'reg-cli' });
        expect(manifest.extra).toEqual({
          regCli: { deletedItems: ['box-d.png'] },
        });
        const changed = must(manifest.entries.find((e) => e.name === 'box-b'));
        expect(changed).toMatchObject({
          status: mode === 'update' ? 'updated' : 'failed',
          baselineWritten: mode === 'update',
          comparison: { maxDiffRatio: 0 },
          images: {
            baseline: { path: 'expected/box-b.png' },
            actual: { path: 'actual/box-b.png' },
            diff: { path: 'diff/box-b.png' },
          },
        });
        const added = must(manifest.entries.find((e) => e.name === 'box-c'));
        expect(added).toMatchObject({
          status: mode === 'update' ? 'created' : 'missing-baseline',
          images: {
            baseline: { path: 'expected/box-c.png' },
            actual: { path: 'actual/box-c.png' },
            diff: { path: null },
          },
        });
      });
    },
  );

  it('converts the items of a report, nested paths and other formats included', async () => {
    const root = await tmpDir();
    const reports = path.join(root, 'reports');
    writePng(path.join(root, 'shots', 'expected', 'home.png'), 3, 3, 1);
    writePng(path.join(root, 'shots', 'actual', 'home.png'), 3, 3, 2);
    writePng(path.join(root, 'shots', 'diff', 'home.png'), 3, 3, 3);
    writePng(path.join(root, 'shots', 'expected', 'pages', 'about.jpg'));
    writePng(path.join(root, 'shots', 'actual', 'pages', 'about.jpg'));
    writePng(path.join(root, 'shots', 'diff', 'pages', 'about.png'));
    writePng(path.join(root, 'shots', 'expected', 'footer.png'), 2, 2);
    writePng(path.join(root, 'shots', 'actual', 'footer.png'), 2, 2);
    writePng(path.join(root, 'shots', 'actual', 'new.png'), 1, 1);
    writePng(path.join(root, 'shots', 'expected', 'gone.png'));
    const report: RegCliReport = {
      failedItems: ['home.png', 'pages/about.jpg'],
      newItems: ['new.png'],
      deletedItems: ['gone.png'],
      passedItems: ['footer.png'],
      expectedItems: ['home.png', 'pages/about.jpg', 'footer.png', 'gone.png'],
      actualItems: ['home.png', 'pages/about.jpg', 'footer.png', 'new.png'],
      diffItems: ['home.png', 'pages/about.png'],
      actualDir: './../shots/actual',
      expectedDir: './../shots/expected',
      diffDir: './../shots/diff',
    };
    const manifest = fromRegCli(report, {
      projectRoot: root,
      ci: null,
      reportDir: reports,
      maxDiffRatio: 0.01,
      colorThreshold: 0.1,
    });
    expect(validateManifest(manifest)).toEqual([]);
    expect(manifest.runner).toEqual({ name: 'reg-cli' });
    expect(manifest.extra).toEqual({ regCli: { deletedItems: ['gone.png'] } });
    expect(
      manifest.entries.map((e) => [
        e.name,
        e.status,
        e.images.baseline.path,
        e.images.actual.path,
        e.images.diff.path,
      ]),
    ).toEqual([
      ['footer', 'passed', 'shots/expected/footer.png', null, null],
      [
        'home',
        'failed',
        'shots/expected/home.png',
        'shots/actual/home.png',
        'shots/diff/home.png',
      ],
      [
        'new',
        'missing-baseline',
        'shots/expected/new.png',
        'shots/actual/new.png',
        null,
      ],
      [
        'pages/about',
        'failed',
        'shots/expected/pages/about.jpg',
        'shots/actual/pages/about.jpg',
        'shots/diff/pages/about.png',
      ],
    ]);
    expect(manifest.entries[1]).toMatchObject({
      comparison: {
        diffRatio: 0,
        maxDiffRatio: 0.01,
        colorThreshold: 0.1,
        colorMetric: 'yiq',
      },
      images: {
        baseline: { width: 3, height: 3 },
        actual: { width: 3, height: 3 },
      },
      baselineWritten: false,
    });
    expect(manifest.entries[2].images.actual).toMatchObject({
      width: 1,
      height: 1,
    });
  });

  it('reports an --update run as updated and created baselines', async () => {
    const root = await tmpDir();
    writePng(path.join(root, 'expected', 'a.png'));
    writePng(path.join(root, 'actual', 'a.png'));
    writePng(path.join(root, 'diff', 'a.png'));
    writePng(path.join(root, 'expected', 'b.png'));
    writePng(path.join(root, 'actual', 'b.png'));
    const manifest = fromRegCli(
      {
        failedItems: ['a.png'],
        newItems: ['b.png'],
        deletedItems: [],
        passedItems: [],
        actualDir: './actual',
        expectedDir: './expected',
        diffDir: './diff',
      },
      { projectRoot: root, ci: null, update: true },
    );
    expect(manifest.entries.map((e) => [e.name, e.status])).toEqual([
      ['a', 'updated'],
      ['b', 'created'],
    ]);
    expect(manifest.entries.every((e) => e.baselineWritten)).toBe(true);
    expect(manifest.extra).toBeUndefined();
  });

  it('takes the folders from the options when the report names URLs', async () => {
    const root = await tmpDir();
    writePng(path.join(root, 'e', 'x.png'));
    const report: RegCliReport = {
      failedItems: [],
      newItems: [],
      deletedItems: [],
      passedItems: ['x.png'],
      actualDir: 'https://bucket.example/run/actual',
      expectedDir: 'https://bucket.example/run/expected',
      diffDir: 'https://bucket.example/run/diff',
    };
    expect(() => fromRegCli(report, { projectRoot: root, ci: null })).toThrow(
      /actualDir.*is not a path/,
    );
    const manifest = fromRegCli(report, {
      projectRoot: root,
      ci: null,
      actualDir: 'a',
      expectedDir: 'e',
      diffDir: 'd',
    });
    expect(manifest.entries[0]).toMatchObject({
      name: 'x',
      status: 'passed',
      images: { baseline: { path: 'e/x.png', width: 2, height: 2 } },
    });
  });

  it('rejects other JSON', async () => {
    const root = await tmpDir();
    expect(() => fromRegCli({} as never, { projectRoot: root })).toThrow(
      /Not a reg-cli JSON report/,
    );
  });
});
