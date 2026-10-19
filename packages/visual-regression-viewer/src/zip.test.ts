import fs from 'fs';
import os from 'os';
import path from 'path';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { tmpDir, writeFile } from '../__tests__/helpers';
import { isZipPath, openInput, unzipInto } from './zip';

const text = (value: string) => new TextEncoder().encode(value);

describe('isZipPath', () => {
  it('goes by the extension', () => {
    expect(isZipPath('artifact.zip')).toBe(true);
    expect(isZipPath('ARTIFACT.ZIP')).toBe(true);
    expect(isZipPath('run')).toBe(false);
    expect(isZipPath('zip')).toBe(false);
  });
});

describe('unzipInto', () => {
  it('unpacks files at any depth and ignores directory entries', async () => {
    const dir = await tmpDir();
    unzipInto(
      zipSync({
        'a.txt': text('a'),
        'b/c/d.txt': text('d'),
        'e/': new Uint8Array(),
      }),
      dir,
    );
    expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8')).toBe('a');
    expect(fs.readFileSync(path.join(dir, 'b/c/d.txt'), 'utf8')).toBe('d');
    expect(fs.existsSync(path.join(dir, 'e'))).toBe(false);
  });

  it.each([
    '../escape.txt',
    'a/../../escape.txt',
    '/abs.txt',
    'C:/abs.txt',
    'a\\b.txt',
  ])('refuses the entry %s', async (name) => {
    const dir = await tmpDir();
    expect(() => unzipInto(zipSync({ [name]: text('x') }), dir)).toThrow(
      /outside of itself/,
    );
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('refuses a zip that is not one', async () => {
    const dir = await tmpDir();
    expect(() => unzipInto(text('not a zip'), dir)).toThrow();
  });
});

describe('openInput', () => {
  it('uses a directory as it is', async () => {
    const dir = await tmpDir();
    const input = openInput(dir);
    expect(input.dir).toBe(dir);
    input.cleanup();
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('leaves a missing zip to the loader to report', () => {
    expect(openInput('/nope/missing.zip').dir).toBe('/nope/missing.zip');
  });

  it('unpacks a zip into a temporary directory that cleanup removes', async () => {
    const zip = writeFile(
      path.join(await tmpDir(), 'artifact.zip'),
      Buffer.from(zipSync({ 'run/a.txt': text('a') })),
    );
    const input = openInput(zip);
    expect(fs.realpathSync(path.dirname(input.dir))).toBe(
      fs.realpathSync(os.tmpdir()),
    );
    expect(fs.readFileSync(path.join(input.dir, 'run/a.txt'), 'utf8')).toBe(
      'a',
    );
    input.cleanup();
    expect(fs.existsSync(input.dir)).toBe(false);
    input.cleanup(); // twice is fine
  });

  it('removes the directory when the zip is bad', async () => {
    const zip = writeFile(path.join(await tmpDir(), 'bad.zip'), 'not a zip');
    const before = fs
      .readdirSync(os.tmpdir())
      .filter((n) => n.startsWith('visual-regression-viewer-'));
    expect(() => openInput(zip)).toThrow();
    const after = fs
      .readdirSync(os.tmpdir())
      .filter((n) => n.startsWith('visual-regression-viewer-'));
    expect(after).toEqual(before);
  });
});
