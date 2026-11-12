import type { ManifestStatus } from 'visual-regression-manifest';
import type { ImageRef, WritePlan } from './types';

const REPLACES_BASELINE: readonly ManifestStatus[] = [
  'created',
  'updated',
  'approved',
];

/**
 * The files an outcome leaves behind: the screenshot and the diff for review
 * when it needs a human, the baseline when it is (re)written, nothing when it
 * passed.
 */
export const planWrites = ({
  status,
  baseline,
  actual,
  diff,
  bytes,
  diffPng,
}: {
  status: ManifestStatus;
  baseline: ImageRef;
  actual: ImageRef;
  diff: ImageRef;
  /** The screenshot. */
  bytes: Uint8Array;
  diffPng?: Uint8Array;
}): WritePlan => ({
  write:
    status === 'failed' || status === 'missing-baseline'
      ? [
          { ref: actual, bytes },
          ...(diffPng ? [{ ref: diff, bytes: diffPng }] : []),
        ]
      : REPLACES_BASELINE.includes(status)
        ? [{ ref: baseline, bytes }]
        : [],
});

/**
 * Whether the baseline was written. A status that replaces it says so even
 * when a hook sent the write elsewhere (a store that keeps baselines
 * remotely); a hook that adds a baseline write to another status (refreshing
 * the baseline of a passed comparison) says so through the plan.
 */
export const baselineWritten = (status: ManifestStatus, plan: WritePlan) =>
  REPLACES_BASELINE.includes(status) ||
  plan.write.some(({ ref }) => ref.kind === 'baseline');
