import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  expectRealOutput,
  must,
  realOutput,
  tmpDir,
  writePng,
} from '../../__tests__/helpers';
import { isManifest } from '../reader';
import { fromImageTriples, inferStatus } from './triples';

describe('inferStatus', () => {
  it('reads the outcome off the files that exist', () => {
    expect(inferStatus({ baseline: true, actual: false })).toBe('passed');
    expect(inferStatus({ baseline: true, actual: true })).toBe('failed');
    expect(inferStatus({ baseline: false, actual: true })).toBe(
      'missing-baseline',
    );
    expect(inferStatus({ baseline: false, actual: false })).toBe(
      'missing-baseline',
    );
  });
});

describe('fromImageTriples', () => {
  it('builds a valid manifest from baselines and their siblings', async () => {
    const root = await tmpDir();
    writePng(path.join(root, 'shots', 'home.png'), 4, 3);
    writePng(path.join(root, 'shots', 'home.actual.png'), 4, 3, 1);
    writePng(path.join(root, 'shots', 'home.diff.png'), 4, 3, 2);
    writePng(path.join(root, 'shots', 'about.png'), 2, 2);
    writePng(path.join(root, 'shots', 'new.actual.png'), 1, 1);

    const manifest = fromImageTriples({
      projectRoot: root,
      runner: { name: 'my-tool', version: '2' },
      ci: null,
      triples: [
        {
          baseline: 'shots/home.png',
          testFile: 'e2e/home.spec.ts',
          titlePath: ['home'],
          diffRatio: 0.2,
          maxDiffRatio: 0.1,
        },
        { baseline: path.join(root, 'shots', 'about.png') },
        { baseline: 'shots/new.png', message: 'no baseline yet' },
      ],
    });

    expect(isManifest(manifest)).toBe(true);
    expect(manifest.runner).toEqual({ name: 'my-tool', version: '2' });
    expect(manifest.entries).toMatchObject([
      {
        name: 'about',
        test: { filePath: '' },
        status: 'passed',
        images: {
          baseline: { path: 'shots/about.png', width: 2, height: 2 },
          actual: { path: null },
          diff: { path: null },
        },
        hashes: { baseline: expect.any(String) },
      },
      {
        name: 'new',
        status: 'missing-baseline',
        images: {
          baseline: { path: 'shots/new.png' },
          actual: { path: 'shots/new.actual.png', width: 1, height: 1 },
          diff: { path: null },
        },
        message: 'no baseline yet',
      },
      {
        name: 'home',
        test: { filePath: 'e2e/home.spec.ts', titlePath: ['home'] },
        status: 'failed',
        comparison: { diffRatio: 0.2, maxDiffRatio: 0.1 },
        images: {
          baseline: { path: 'shots/home.png', width: 4, height: 3 },
          actual: { path: 'shots/home.actual.png', width: 4, height: 3 },
          diff: { path: 'shots/home.diff.png' },
        },
        hashes: {
          baseline: expect.any(String),
          actual: expect.any(String),
          diff: expect.any(String),
        },
      },
    ]);
    expect(manifest.entries[0]?.images.baseline).not.toHaveProperty('actual');
  });

  it('takes explicit paths, names and statuses over the conventions', async () => {
    const root = await tmpDir();
    writePng(path.join(root, 'expected', 'a.png'));
    writePng(path.join(root, 'out', 'a-received.png'));
    writePng(path.join(root, 'out', 'a-delta.png'));
    const manifest = fromImageTriples({
      projectRoot: root,
      runner: { name: 'other' },
      ci: null,
      triples: [
        {
          baseline: 'expected/a.png',
          actual: 'out/a-received.png',
          diff: 'out/a-delta.png',
          name: 'a (mobile)',
          status: 'updated',
          baselineWritten: true,
          retry: 1,
        },
        {
          baseline: 'expected/b.png',
          actual: 'out/b.png',
          diff: null,
          status: 'created',
        },
      ],
    });
    expect(manifest.entries.map((e) => e.name)).toEqual(['a (mobile)', 'b']);
    expect(manifest.entries[0]).toMatchObject({
      status: 'updated',
      baselineWritten: true,
      test: { retry: 1 },
      images: {
        actual: { path: 'out/a-received.png' },
        diff: { path: 'out/a-delta.png' },
      },
    });
    expect(manifest.entries[1]).toMatchObject({
      status: 'created',
      images: { actual: { path: null }, diff: { path: null } },
    });
  });
});

// captured by examples/converters/cypress: pixsame (@pixsame/cypress-plugin-visual-regression-diff
// 1.0 on Cypress 16) leaves `<title>_#0.png` baselines with `.actual` and `.diff` siblings
describe.each(
  realOutput('cypress').filter(({ mode }) => mode.startsWith('pixsame')),
)('real output of pixsame, $mode', ({ mode, root, expectations }) => {
  it('converts the triples, `#` in the names included', () => {
    const dir = path.join(
      root,
      'cypress',
      'e2e',
      'pixsame',
      '__image_snapshots__',
    );
    const stems = new Set(
      fs
        .readdirSync(dir)
        .filter((file) => file.endsWith('.png'))
        .map((file) => file.replace(/(\.actual|\.diff)?\.png$/, '')),
    );
    const manifest = fromImageTriples({
      projectRoot: root,
      ci: null,
      runner: { name: 'cypress' },
      triples: [...stems].map((stem) => ({
        baseline: path.join(dir, `${stem}.png`),
        testFile: 'cypress/e2e/pixsame/box.cy.js',
        maxDiffRatio: 0,
      })),
    });
    expectRealOutput(manifest, root, expectations);
    const failed = must(manifest.entries.find((e) => e.name === 'box-b_#0'));
    expect(failed).toMatchObject({
      status: 'failed',
      test: { filePath: 'cypress/e2e/pixsame/box.cy.js' },
      images: {
        baseline: {
          path: 'cypress/e2e/pixsame/__image_snapshots__/box-b_#0.png',
        },
        actual: {
          path: 'cypress/e2e/pixsame/__image_snapshots__/box-b_#0.actual.png',
        },
        diff: {
          path: 'cypress/e2e/pixsame/__image_snapshots__/box-b_#0.diff.png',
        },
      },
    });
    const third = must(manifest.entries.find((e) => e.name === 'box-c_#0'));
    // with createMissingImages off only the actual exists; on, the baseline was written
    expect(third.status).toBe(
      mode === 'pixsame' ? 'missing-baseline' : 'passed',
    );
  });
});
