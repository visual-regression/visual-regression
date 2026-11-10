import fs from 'fs';
import path from 'path';
import tmp from 'tmp-promise';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fsStore } from './store';

describe('fsStore', () => {
  let dir: tmp.DirectoryResult;
  beforeEach(async () => {
    dir = await tmp.dir({ unsafeCleanup: true });
  });
  afterEach(() => dir.cleanup());

  const store = () =>
    fsStore({
      baselineDir: path.join(dir.path, 'base'),
      actualDir: path.join(dir.path, 'in'),
      diffDir: path.join(dir.path, 'out'),
    });

  it('writes, reads and removes', async () => {
    const ref = { kind: 'baseline', path: 'a/b.png' } as const;
    expect(await store().read(ref)).toBeNull();
    await store().write(ref, Buffer.from('x'));
    expect(String(await store().read(ref))).toBe('x');
    await store().remove(ref);
    await store().remove(ref);
    expect(await store().read(ref)).toBeNull();
  });

  it('puts .actual and .diff files in the diff directory', () => {
    expect(store().locate({ kind: 'actual', path: 'a.actual.png' })).toBe(
      path.join(dir.path, 'out', 'a.actual.png'),
    );
  });

  it('defaults the diff directory to the baseline directory', () => {
    const next = fsStore({ baselineDir: path.join(dir.path, 'base') });
    expect(next.locate({ kind: 'diff', path: 'a.diff.png' })).toBe(
      path.join(dir.path, 'base', 'a.diff.png'),
    );
    expect(() => next.locate({ kind: 'incoming', path: 'a.png' })).toThrow(
      /no directory/,
    );
  });

  it('refuses paths that leave the root', () => {
    expect(() =>
      store().locate({ kind: 'baseline', path: '../x.png' }),
    ).toThrow(/Unsafe/);
  });

  it('lists only source PNGs, sorted', async () => {
    const root = path.join(dir.path, 'in');
    fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
    fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    for (const file of [
      'b.png',
      'a.png',
      'a.actual.png',
      'a.diff.png',
      'sub/c.png',
      'notes.txt',
      'node_modules/d.png',
    ]) {
      fs.writeFileSync(path.join(root, file), '');
    }
    const listed: string[] = [];
    for await (const ref of store().list('incoming')) listed.push(ref.path);
    expect(listed).toEqual(['a.png', 'b.png', 'sub/c.png']);
  });
});
