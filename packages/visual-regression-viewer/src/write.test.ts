import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { png, tmpDir, writeFile } from '../__tests__/helpers';
import { writeOutput } from './write';

describe('writeOutput', () => {
  it('writes index.html and copies the images, keeping their paths', async () => {
    const src = await tmpDir();
    const out = path.join(await tmpDir(), 'report');
    writeFile(path.join(src, 'a/b.png'), png(2, 2, 1));
    writeOutput(
      out,
      '<html></html>',
      new Map([['a/b.png', path.join(src, 'a/b.png')]]),
    );
    expect(fs.readFileSync(path.join(out, 'index.html'), 'utf8')).toBe(
      '<html></html>',
    );
    expect(fs.readFileSync(path.join(out, 'a/b.png'))).toEqual(png(2, 2, 1));
  });

  it('leaves images that are already in place alone', async () => {
    const root = await tmpDir();
    writeFile(path.join(root, 'a.png'), png(2, 2, 3));
    writeOutput(root, 'x', new Map([['a.png', path.join(root, 'a.png')]]));
    expect(fs.readFileSync(path.join(root, 'a.png'))).toEqual(png(2, 2, 3));
  });
});
