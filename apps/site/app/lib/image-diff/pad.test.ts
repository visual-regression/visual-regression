import { describe, expect, it } from 'vitest';
import { padPixels } from './pad';

const red = (width: number, height: number) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([255, 0, 0, 255], i);
  return { width, height, data };
};

const at = (data: Uint8ClampedArray, width: number, x: number, y: number) =>
  Array.from(data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4));

describe('padPixels', () => {
  it('keeps the image in the top-left corner and fills the rest with magenta', () => {
    const out = padPixels(red(2, 1), 3, 2, 'magenta');
    expect(out).toHaveLength(3 * 2 * 4);
    expect(at(out, 3, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(at(out, 3, 1, 0)).toEqual([255, 0, 0, 255]);
    expect(at(out, 3, 2, 0)).toEqual([255, 0, 255, 255]);
    expect(at(out, 3, 0, 1)).toEqual([255, 0, 255, 255]);
    expect(at(out, 3, 2, 1)).toEqual([255, 0, 255, 255]);
  });

  it('fills the rest with transparent pixels', () => {
    const out = padPixels(red(1, 2), 2, 2, 'transparent');
    expect(at(out, 2, 0, 1)).toEqual([255, 0, 0, 255]);
    expect(at(out, 2, 1, 0)).toEqual([0, 0, 0, 0]);
    expect(at(out, 2, 1, 1)).toEqual([0, 0, 0, 0]);
  });

  it('keeps rows aligned when the image is narrower than the target', () => {
    const image = red(2, 2);
    image.data.set([0, 255, 0, 255], (1 * 2 + 1) * 4); // pixel (1, 1) green
    const out = padPixels(image, 4, 2, 'transparent');
    expect(at(out, 4, 1, 1)).toEqual([0, 255, 0, 255]);
    expect(at(out, 4, 2, 1)).toEqual([0, 0, 0, 0]);
    expect(at(out, 4, 0, 1)).toEqual([255, 0, 0, 255]);
  });

  it('copies the image unchanged when the size already matches', () => {
    const image = red(2, 2);
    expect(Array.from(padPixels(image, 2, 2, 'magenta'))).toEqual(
      Array.from(image.data),
    );
  });
});
