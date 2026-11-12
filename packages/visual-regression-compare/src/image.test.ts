import { describe, expect, it } from 'vitest';
import { cropToSame, decodePng, encodePng, padToSame, pngSize } from './image';
import { makePng } from './test-utils';

describe('image', () => {
  it('round-trips a PNG', () => {
    const image = decodePng(makePng(3, 2, [1, 2, 3, 255]));
    expect([image.width, image.height]).toEqual([3, 2]);
    expect([...image.data.slice(0, 4)]).toEqual([1, 2, 3, 255]);
    expect(decodePng(encodePng(image))).toEqual(image);
  });

  it('explains a Git LFS pointer', () => {
    const pointer = Buffer.from(
      'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 12\n',
    );
    expect(() => decodePng(pointer)).toThrow(/Git LFS pointer/);
  });

  it('pads both images to the larger size with transparent pixels', () => {
    const [a, b] = padToSame(
      decodePng(makePng(2, 1)),
      decodePng(makePng(1, 3)),
    );
    expect([a.width, a.height, b.width, b.height]).toEqual([2, 3, 2, 3]);
    expect([...a.data.slice(0, 4)]).toEqual([200, 200, 200, 255]);
    expect([...a.data.slice(8, 12)]).toEqual([0, 0, 0, 0]);
    expect([...b.data.slice(4, 8)]).toEqual([0, 0, 0, 0]);
  });

  it('crops both images to the smaller size', () => {
    const [a, b] = cropToSame(
      decodePng(makePng(4, 2)),
      decodePng(makePng(3, 5)),
    );
    expect([a.width, a.height, b.width, b.height]).toEqual([3, 2, 3, 2]);
  });

  it('reads the size of a PNG from its header', () => {
    expect(pngSize(makePng(7, 3))).toEqual({ width: 7, height: 3 });
    expect(pngSize(makePng(300, 1000))).toEqual({ width: 300, height: 1000 });
  });

  it('reads no size from bytes that are not a PNG', () => {
    expect(pngSize(new Uint8Array())).toBeUndefined();
    expect(
      pngSize(Buffer.from('not a png at all, just some text')),
    ).toBeUndefined();
    const damaged = Uint8Array.from(makePng(2, 2));
    damaged[1] = 0;
    expect(pngSize(damaged)).toBeUndefined();
  });
});
