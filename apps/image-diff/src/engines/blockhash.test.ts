import { describe, expect, it } from 'vitest';
import { blockhash } from './blockhash';

type Pixel = [number, number, number, number];

const image = (
  width: number,
  height: number,
  pixel: (x: number, y: number) => Pixel,
) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  }
  return { width, height, data } as ImageData;
};

const BLACK: Pixel = [0, 0, 0, 255];
const WHITE: Pixel = [255, 255, 255, 255];
const bits = (hash: Uint8Array) => Array.from(hash).join('');

describe('blockhash', () => {
  it('has bits² bits', () => {
    expect(
      blockhash(
        image(64, 64, () => BLACK),
        8,
      ),
    ).toHaveLength(64);
    expect(
      blockhash(
        image(37, 53, () => BLACK),
        16,
      ),
    ).toHaveLength(256);
  });

  it('hashes an all-black image to zeros (tie below half brightness)', () => {
    expect(
      bits(
        blockhash(
          image(16, 16, () => BLACK),
          4,
        ),
      ),
    ).toBe('0'.repeat(16));
  });

  it('hashes an all-white image to ones (tie above half brightness)', () => {
    expect(
      bits(
        blockhash(
          image(16, 16, () => WHITE),
          4,
        ),
      ),
    ).toBe('1'.repeat(16));
  });

  it('counts transparent pixels as white', () => {
    const clear = image(12, 12, () => [0, 0, 0, 0]);
    expect(bits(blockhash(clear, 4))).toBe('1'.repeat(16));
  });

  it('compares every block against the median of its quarter of the grid', () => {
    // 4×4 pixels, 4×4 blocks: each row is a band; dark left, bright right
    const split = image(4, 4, (x) => (x < 2 ? BLACK : WHITE));
    expect(bits(blockhash(split, 4))).toBe('0011'.repeat(4));
  });

  it('uses bands of a quarter of the grid, not four rows', () => {
    // 8 rows of blocks, so a band is two rows: row 0 is dark, row 1 is bright
    const rows = image(8, 8, (_, y) => (y % 2 ? WHITE : BLACK));
    expect(bits(blockhash(rows, 8))).toBe(
      ('0'.repeat(8) + '1'.repeat(8)).repeat(4),
    );
  });

  it('splits sizes the grid does not divide at fractional block edges', () => {
    // 10 px over 4 blocks: edges at 2.5, 5, 7.5; the dark half ends at 5
    const split = image(10, 10, (x) => (x < 5 ? BLACK : WHITE));
    expect(bits(blockhash(split, 4))).toBe('0011'.repeat(4));
  });

  it('is stable for a uniform image of an uneven size', () => {
    expect(
      bits(
        blockhash(
          image(37, 53, () => WHITE),
          8,
        ),
      ),
    ).toBe('1'.repeat(64));
    expect(
      bits(
        blockhash(
          image(37, 53, () => BLACK),
          8,
        ),
      ),
    ).toBe('0'.repeat(64));
  });

  it('flips bits for a different picture', () => {
    const a = blockhash(
      image(32, 32, (x) => (x < 16 ? BLACK : WHITE)),
      8,
    );
    const b = blockhash(
      image(32, 32, (x) => (x < 16 ? WHITE : BLACK)),
      8,
    );
    expect(a.some((bit, i) => bit !== b[i])).toBe(true);
  });
});
