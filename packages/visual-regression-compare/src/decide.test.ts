import { describe, expect, it } from 'vitest';
import { acceptedRatio, decide } from './decide';
import { englishMessages } from './messages';
import { resolveSettings } from './settings';
import type { Measurement, UpdatePolicy } from './types';

const size = { width: 10, height: 10 };
const compared = (diffPixels: number, extra: Partial<Measurement> = {}) =>
  ({
    kind: 'compared',
    baselineSize: size,
    actualSize: size,
    result: { diffPixels, diffRatio: diffPixels / 100 },
    ...extra,
  }) as Measurement;

const run = (
  measurement: Measurement,
  {
    limit,
    update = 'none' as UpdatePolicy,
    create = false,
  }: { limit?: number; update?: UpdatePolicy; create?: boolean } = {},
) =>
  decide({
    measurement,
    limit,
    settings: resolveSettings({
      update,
      onMissingBaseline: create ? 'create' : 'fail',
    }),
    baselinePath: 'base/a.png',
    messages: englishMessages,
  });

describe('acceptedRatio', () => {
  it('is the stricter of the ratio and the pixel count, for the size compared', () => {
    expect(
      acceptedRatio(compared(0), { maxDiffRatio: 0.5, maxDiffPixels: 10 }),
    ).toBe(0.1);
    expect(acceptedRatio(compared(0), { maxDiffRatio: 0.05 })).toBe(0.05);
  });

  it('is exact without limits and undefined without a comparison', () => {
    expect(acceptedRatio(compared(0), {})).toBe(0);
    expect(acceptedRatio({ kind: 'missing-baseline' }, {})).toBeUndefined();
    expect(acceptedRatio({ kind: 'replaced' }, {})).toBeUndefined();
  });

  it('measures a pixel limit against the padded size', () => {
    const padded = compared(0, {
      resized: 'pad',
      actualSize: { width: 20, height: 10 },
    });
    expect(acceptedRatio(padded, { maxDiffPixels: 10 })).toBe(0.05);
  });
});

describe('decide', () => {
  it.each([
    ['identical', compared(0), {}, 'passed', 'identical'],
    [
      'within the limit',
      compared(3),
      { limit: 0.05 },
      'passed',
      'within-limit',
    ],
    ['above the limit', compared(3), { limit: 0.01 }, 'failed', 'above-limit'],
    [
      'above the limit, updating failures',
      compared(3),
      { limit: 0.01, update: 'failures-only' as const },
      'updated',
      'updated',
    ],
    [
      'no baseline',
      { kind: 'missing-baseline' },
      {},
      'missing-baseline',
      'missing-baseline',
    ],
    [
      'no baseline, creating',
      { kind: 'missing-baseline' },
      { create: true },
      'created',
      'created',
    ],
    [
      'replacing',
      { kind: 'replaced' },
      { update: 'all' as const },
      'updated',
      'updated',
    ],
  ] as const)('%s', (_, measurement, options, status, code) => {
    expect(run(measurement as Measurement, options)).toMatchObject({
      status,
      reason: { code },
    });
  });

  it('fails a size change, or replaces the baseline when updating', () => {
    const changed: Measurement = {
      kind: 'size-mismatch',
      baselineSize: size,
      actualSize: { width: 20, height: 10 },
    };
    expect(run(changed)).toMatchObject({
      status: 'failed',
      reason: { code: 'size-changed' },
      message: 'The size changed: baseline 10x10, actual 20x10.',
    });
    expect(run(changed, { update: 'failures-only' })).toMatchObject({
      status: 'updated',
      reason: { code: 'updated', cause: 'size-changed' },
    });
  });

  it('says the reason in the messages it is given', () => {
    const decision = decide({
      measurement: compared(3),
      limit: 0.01,
      settings: resolveSettings({}),
      baselinePath: 'a.png',
      messages: {
        ...englishMessages,
        'above-limit': (r) => `${r.diffPixels}!`,
      },
    });
    expect(decision.message).toBe('3!');
  });
});
