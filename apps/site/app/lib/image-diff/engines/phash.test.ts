import { describe, expect, it } from 'vitest';
import { hex, phash, reduce } from './phash';

const image = (
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number],
): ImageData => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set(pixel(x, y), (y * width + x) * 4);
    }
  }
  return { width, height, data, colorSpace: 'srgb' } as ImageData;
};

// a smooth picture with structure at several scales
const picture = (width: number, height: number) =>
  image(width, height, (x, y) => {
    const u = x / width;
    const v = y / height;
    const l = Math.round(
      127 + 80 * Math.sin(u * 9) * Math.cos(v * 6) + 40 * (u > 0.6 ? 1 : -1),
    );
    return [l, l, l, 255];
  });

const distance = (a: Uint8Array, b: Uint8Array) =>
  a.reduce((sum, bit, i) => sum + (bit !== b[i] ? 1 : 0), 0);

describe('reduce', () => {
  it('averages a two-tone image into a matching square', () => {
    const left = image(8, 8, (x) =>
      x < 4 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    );
    const gray = reduce(left, 2);
    expect(Array.from(gray)).toEqual([0, 255, 0, 255]);
  });

  it('weights fractional coverage when the size does not divide', () => {
    const flat = image(7, 5, () => [100, 100, 100, 255]);
    for (const value of reduce(flat, 4)) expect(value).toBeCloseTo(100, 6);
  });

  it('counts transparent pixels as white', () => {
    const clear = image(4, 4, () => [0, 0, 0, 0]);
    for (const value of reduce(clear, 2)) expect(value).toBe(255);
  });

  it('upsamples images smaller than the square', () => {
    const tiny = image(2, 2, (x, y) =>
      x === y ? [0, 0, 0, 255] : [255, 255, 255, 255],
    );
    const gray = reduce(tiny, 4);
    expect(gray[0]).toBe(0);
    expect(gray[3]).toBe(255);
    expect(gray[12]).toBe(255);
    expect(gray[15]).toBe(0);
  });
});

describe('phash', () => {
  it('has bits² bits and a hex string a quarter as long', () => {
    for (const bits of [8, 16]) {
      const hash = phash(picture(100, 80), bits);
      expect(hash).toHaveLength(bits * bits);
      expect(hex(hash)).toHaveLength((bits * bits) / 4);
    }
  });

  it('is identical for identical images and stable between runs', () => {
    expect(phash(picture(120, 90), 8)).toEqual(phash(picture(120, 90), 8));
  });

  it('survives resizing the same picture', () => {
    const small = phash(picture(160, 120), 8);
    const large = phash(picture(640, 480), 8);
    expect(distance(small, large)).toBeLessThanOrEqual(4);
  });

  it('survives a small brightness change', () => {
    const base = picture(200, 150);
    const brighter = image(200, 150, (x, y) => {
      const i = (y * 200 + x) * 4;
      const l = Math.min(255, base.data[i] + 6);
      return [l, l, l, 255];
    });
    expect(distance(phash(base, 8), phash(brighter, 8))).toBeLessThanOrEqual(4);
  });

  it('differs a lot for a different picture', () => {
    const base = picture(160, 120);
    const inverted = image(160, 120, (x, y) => {
      const l = 255 - base.data[(y * 160 + x) * 4];
      return [l, l, l, 255];
    });
    expect(distance(phash(base, 8), phash(inverted, 8))).toBeGreaterThan(20);
  });

  it('gives flat images only the zero-frequency bit, without noise bits', () => {
    const white = phash(
      image(64, 64, () => [255, 255, 255, 255]),
      8,
    );
    const black = phash(
      image(64, 64, () => [0, 0, 0, 255]),
      8,
    );
    // every other coefficient is zero, so only the first one can rise above the median
    expect(Array.from(white)).toEqual([1, ...new Array(63).fill(0)]);
    expect(Array.from(black)).toEqual(new Array(64).fill(0));
  });
});
