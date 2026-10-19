import { describe, expect, it } from 'vitest';
import { entryLimits, maxRatioFrom } from './limits';

const size = { width: 100, height: 50 };

describe('maxRatioFrom', () => {
  it('passes a ratio through', () => {
    expect(maxRatioFrom({ ratio: 0.01 }, size)).toBe(0.01);
    expect(maxRatioFrom({ ratio: 0.01 }, undefined)).toBe(0.01);
  });

  it('divides a pixel count by the image area', () => {
    expect(maxRatioFrom({ pixels: 50 }, size)).toBe(0.01);
  });

  it('caps a count above the image area at 1', () => {
    expect(maxRatioFrom({ pixels: 99999 }, size)).toBe(1);
  });

  it('keeps the stricter limit when both are given', () => {
    expect(maxRatioFrom({ ratio: 0.02, pixels: 50 }, size)).toBe(0.01);
    expect(maxRatioFrom({ ratio: 0.005, pixels: 50 }, size)).toBe(0.005);
  });

  it('is undefined for a count without a usable size', () => {
    expect(maxRatioFrom({ pixels: 50 }, undefined)).toBeUndefined();
    expect(
      maxRatioFrom({ pixels: 50 }, { width: 0, height: 10 }),
    ).toBeUndefined();
    expect(maxRatioFrom({}, size)).toBeUndefined();
  });

  it('falls back to the ratio when the size is unknown', () => {
    expect(maxRatioFrom({ ratio: 0.02, pixels: 50 }, undefined)).toBe(0.02);
  });
});

describe('entryLimits', () => {
  it('returns the entry input fields', () => {
    expect(
      entryLimits(
        {
          maxDiffPixels: 50,
          colorThreshold: 0.1,
          colorMetric: 'yiq',
        },
        size,
      ),
    ).toEqual({ maxDiffRatio: 0.01, colorThreshold: 0.1, colorMetric: 'yiq' });
  });
});
