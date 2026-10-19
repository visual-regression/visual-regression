import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  entry,
  manifest,
  png,
  tmpDir,
  writeFile,
  writeRun,
} from '../__tests__/helpers';
import { loadRun, urlOf } from './load';

describe('loadRun', () => {
  it('reads the manifest and links the images of the run', async () => {
    const root = await tmpDir();
    writeRun(root);
    const { data, files } = loadRun(root, 'Run');

    expect(data).toMatchObject({
      title: 'Run',
      manifests: 1,
      tool: { name: 'test-tool' },
      runner: { name: 'cypress' },
      counts: { failed: 1, passed: 0 },
      warnings: [],
    });
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]).toMatchObject({
      name: 'home',
      status: 'failed',
      needsHuman: true,
      platform: 'linux / chrome',
      images: {
        baseline: 'shots/home.png',
        actual: 'shots/home.actual.png',
        diff: 'shots/home.diff.png',
      },
    });
    expect([...files.keys()].sort()).toEqual([
      'shots/home.actual.png',
      'shots/home.diff.png',
      'shots/home.png',
    ]);
    expect(files.get('shots/home.png')).toBe(path.join(root, 'shots/home.png'));
  });

  it('merges several manifests and sorts the entries that need a human first', async () => {
    const root = await tmpDir();
    writeRun(root, [entry({ name: 'a', status: 'passed' })]);
    writeRun(
      root,
      [entry({ name: 'b' })],
      'visual-regression-manifest.w1.json',
    );
    const { data } = loadRun(root, 'Run');
    expect(data.manifests).toBe(2);
    expect(data.entries.map((e) => [e.name, e.needsHuman])).toEqual([
      ['a', false],
      ['b', true],
    ]);
  });

  it('finds images by the end of their path when the layout differs', async () => {
    const root = await tmpDir();
    writeFile(
      path.join(root, 'visual-regression-manifest.json'),
      JSON.stringify(manifest([entry()])),
    );
    // an unpacked artifact: the project directory is one level deeper
    writeFile(path.join(root, 'pkg/shots/home.png'), png(2, 2));
    writeFile(path.join(root, 'other/home.png'), png(2, 2));
    const { data } = loadRun(root, 'Run');
    expect(data.entries[0].images).toEqual({
      baseline: 'pkg/shots/home.png',
      actual: null,
      diff: null,
    });
  });

  it('never links files outside the run directory', async () => {
    const root = await tmpDir();
    const outside = await tmpDir();
    writeFile(path.join(outside, 'secret.png'), png(2, 2));
    const escaping = path.relative(root, path.join(outside, 'secret.png'));
    writeFile(
      path.join(root, 'visual-regression-manifest.json'),
      JSON.stringify(
        manifest([
          entry({
            images: {
              baseline: { path: escaping },
              actual: { path: path.join(outside, 'secret.png') },
              diff: { path: null },
            },
          }),
        ]),
      ),
    );
    const { data, files } = loadRun(root, 'Run');
    expect(files.size).toBe(0);
    expect(data.entries[0].images).toEqual({
      baseline: null,
      actual: null,
      diff: null,
    });
  });

  it('takes a single manifest file as the run', async () => {
    const root = await tmpDir();
    writeRun(root, [entry({ name: 'one' })]);
    writeRun(
      root,
      [entry({ name: 'two' })],
      'visual-regression-manifest.x.json',
    );
    const { data } = loadRun(
      path.join(root, 'visual-regression-manifest.x.json'),
      'Run',
    );
    expect(data.entries.map((e) => e.name)).toEqual(['two']);
  });

  it('explains missing directories and runs without a manifest', async () => {
    const root = await tmpDir();
    expect(() => loadRun(path.join(root, 'nope'), 'Run')).toThrow(
      /does not exist/,
    );
    expect(() => loadRun(root, 'Run')).toThrow(/No visual-regression-manifest/);
  });

  it('encodes URLs per segment', () => {
    expect(urlOf('a b/c#1/d?.png')).toBe('a%20b/c%231/d%3F.png');
  });
});
