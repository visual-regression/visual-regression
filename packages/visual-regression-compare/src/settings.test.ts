import { describe, expect, it } from 'vitest';
import { resolveSettings } from './settings';

describe('resolveSettings', () => {
  it('defaults to exact, failing and not updating', () => {
    expect(resolveSettings({})).toEqual({
      limits: {},
      engineOptions: {},
      update: 'none',
      onMissingBaseline: 'fail',
      onSizeMismatch: 'fail',
    });
  });

  it('replaces the limits and policies, and merges the engine options', () => {
    expect(
      resolveSettings(
        {
          limits: { maxDiffPixels: 1 },
          engineOptions: { threshold: 0.1, includeAA: false },
          update: 'all',
        },
        {
          limits: { maxDiffRatio: 0.5 },
          engineOptions: { includeAA: true },
          update: 'none',
        },
      ),
    ).toMatchObject({
      limits: { maxDiffRatio: 0.5 },
      engineOptions: { threshold: 0.1, includeAA: true },
      update: 'none',
    });
  });
});
