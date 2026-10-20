import path from 'path';
import { describe, expect, it } from 'vitest';
import { tmpDir, writePng } from '../../__tests__/helpers';
import { validateManifest } from '../reader';
import { fromJestImageSnapshots } from './jest-image-snapshot';

describe('fromJestImageSnapshots', () => {
  it('reads baselines, diff composites and received images', async () => {
    const root = await tmpDir();
    const snaps = path.join(root, 'src', '__image_snapshots__');
    writePng(path.join(snaps, 'home-1-snap.png'), 4, 4, 1);
    writePng(path.join(snaps, 'about-1-snap.png'), 2, 2, 1);
    writePng(path.join(snaps, '__diff_output__', 'home-1-diff.png'), 12, 4, 3);
    writePng(
      path.join(snaps, '__diff_output__', 'home-1-received.png'),
      4,
      4,
      2,
    );
    writePng(
      path.join(snaps, '__diff_output__', 'brand-new-diff.png'),
      3,
      3,
      3,
    );
    writePng(path.join(snaps, 'not-a-snapshot.png'));

    const manifest = fromJestImageSnapshots({
      projectRoot: root,
      ci: null,
      maxDiffRatio: 0.02,
    });
    expect(validateManifest(manifest)).toEqual([]);
    expect(manifest.runner).toEqual({ name: 'jest' });
    expect(
      manifest.entries.map((e) => [
        e.name,
        e.status,
        e.images.baseline.path,
        e.images.actual.path,
        e.images.diff.path,
      ]),
    ).toEqual([
      [
        'about-1',
        'passed',
        'src/__image_snapshots__/about-1-snap.png',
        null,
        null,
      ],
      [
        'brand-new',
        'missing-baseline',
        'src/__image_snapshots__/brand-new-snap.png',
        null,
        'src/__image_snapshots__/__diff_output__/brand-new-diff.png',
      ],
      [
        'home-1',
        'failed',
        'src/__image_snapshots__/home-1-snap.png',
        'src/__image_snapshots__/__diff_output__/home-1-received.png',
        'src/__image_snapshots__/__diff_output__/home-1-diff.png',
      ],
    ]);
    expect(manifest.entries[2].images.actual).toMatchObject({
      width: 4,
      height: 4,
    });
    expect(manifest.entries[2].comparison.maxDiffRatio).toBe(0.02);
  });

  it('honors cypress-image-snapshot style custom names and a received directory', async () => {
    const root = await tmpDir();
    const snaps = path.join(root, 'cypress', 'snapshots');
    writePng(path.join(snaps, 'home.png'));
    writePng(path.join(snaps, 'diffs', 'home.diff.png'));
    writePng(path.join(snaps, 'received', 'home.received.png'));

    const manifest = fromJestImageSnapshots({
      projectRoot: root,
      ci: null,
      runner: { name: 'cypress' },
      snapshotsDirName: 'snapshots',
      snapshotPostfix: '',
      diffDirName: 'diffs',
      diffPostfix: '.diff',
      receivedDirName: 'received',
      receivedPostfix: '.received',
    });
    expect(manifest.runner).toEqual({ name: 'cypress' });
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0]).toMatchObject({
      name: 'home',
      status: 'failed',
      images: {
        baseline: { path: 'cypress/snapshots/home.png' },
        actual: { path: 'cypress/snapshots/received/home.received.png' },
        diff: { path: 'cypress/snapshots/diffs/home.diff.png' },
      },
    });
  });
});
