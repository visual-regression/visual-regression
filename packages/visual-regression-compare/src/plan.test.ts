import { describe, expect, it } from 'vitest';
import { baselineWritten, planWrites } from './plan';
import type { ImageRef } from './types';

const refs = {
  baseline: { kind: 'baseline', path: 'a.png' } as ImageRef,
  actual: { kind: 'actual', path: 'a.actual.png' } as ImageRef,
  diff: { kind: 'diff', path: 'a.diff.png' } as ImageRef,
};
const bytes = new Uint8Array([1]);
const diffPng = new Uint8Array([2]);
const plan = (status: Parameters<typeof planWrites>[0]['status']) =>
  planWrites({ status, ...refs, bytes, diffPng });

describe('planWrites', () => {
  it('keeps the screenshot and the diff of what needs a human', () => {
    expect(plan('failed').write).toEqual([
      { ref: refs.actual, bytes },
      { ref: refs.diff, bytes: diffPng },
    ]);
    expect(plan('missing-baseline').write.map((w) => w.ref.kind)).toEqual([
      'actual',
      'diff',
    ]);
  });

  it('keeps no diff when the engine made none', () => {
    expect(
      planWrites({ status: 'failed', ...refs, bytes }).write.map(
        (w) => w.ref.kind,
      ),
    ).toEqual(['actual']);
  });

  it.each(['created', 'updated', 'approved'] as const)(
    'writes the baseline for %s',
    (status) => {
      expect(plan(status).write).toEqual([{ ref: refs.baseline, bytes }]);
    },
  );

  it('writes nothing for a pass', () => {
    expect(plan('passed').write).toEqual([]);
  });
});

describe('baselineWritten', () => {
  it('follows the status, even when a hook sent the write elsewhere', () => {
    expect(baselineWritten('updated', { write: [] })).toBe(true);
  });

  it('follows the plan when a hook added a baseline write to a pass', () => {
    expect(baselineWritten('passed', plan('passed'))).toBe(false);
    expect(
      baselineWritten('passed', { write: [{ ref: refs.baseline, bytes }] }),
    ).toBe(true);
  });
});
