import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  expectRealOutput,
  must,
  realOutput,
  tmpDir,
  writePng,
} from '../../__tests__/helpers';
import { fromJestImageSnapshots } from './jest-image-snapshot';

describe('fromJestImageSnapshots', () => {
  // captured by examples/converters/jest-image-snapshot: Jest 30 with custom and default
  // snapshot identifiers, storeReceivedOnFailure, run with --ci and without
  describe.each(realOutput('jest-image-snapshot'))(
    'real output of a $mode run',
    ({ root, expectations }) => {
      it('converts what jest-image-snapshot leaves behind', () => {
        const manifest = fromJestImageSnapshots({
          projectRoot: root,
          ci: null,
          maxDiffRatio: 0.02,
        });
        expectRealOutput(manifest, root, expectations);
        expect(manifest.runner).toEqual({ name: 'jest' });
        const failed = must(manifest.entries.find((e) => e.name === 'box-b'));
        expect(failed).toMatchObject({
          status: 'failed',
          images: {
            baseline: {
              path: 'tests/__image_snapshots__/box-b.png',
              width: 80,
              height: 120,
            },
            actual: {
              path: 'tests/__image_snapshots__/__received_output__/box-b-received.png',
              width: 80,
              height: 120,
            },
            diff: {
              path: 'tests/__image_snapshots__/__diff_output__/box-b-diff.png',
            },
          },
          comparison: { maxDiffRatio: 0.02 },
          test: { filePath: '' },
        });
        // the default identifier's `-snap` is not part of the name
        expect(manifest.entries.map((e) => e.name)).toContain(
          'default-names-test-js-box-a-with-the-default-identifier-1',
        );
      });
    },
  );

  it('records no actual image when the received image was not stored', async () => {
    const root = await tmpDir();
    const snaps = path.join(root, '__image_snapshots__');
    // a default identifier keeps its `-snap` in every file name
    writePng(path.join(snaps, 'home-1-snap.png'), 4, 4, 1);
    writePng(
      path.join(snaps, '__diff_output__', 'home-1-snap-diff.png'),
      12,
      4,
      3,
    );

    const manifest = fromJestImageSnapshots({ projectRoot: root, ci: null });
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0]).toMatchObject({
      name: 'home-1',
      status: 'failed',
      images: {
        baseline: { path: '__image_snapshots__/home-1-snap.png' },
        actual: { path: null },
        diff: {
          path: '__image_snapshots__/__diff_output__/home-1-snap-diff.png',
        },
      },
    });
  });

  it('honors custom folder names and postfixes', async () => {
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
