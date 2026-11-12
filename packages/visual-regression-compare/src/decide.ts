import { maxRatioFrom } from 'visual-regression-manifest';
import type { Messages, Reason } from './messages';
import type { Settings } from './settings';
import type { Decision, Limits, Measurement } from './types';

type Size = { width: number; height: number };

/** The size the pixels were actually compared at. */
const comparedSize = ({
  baselineSize: b,
  actualSize: a,
  resized,
}: Extract<Measurement, { kind: 'compared' }>): Size =>
  resized === 'pad'
    ? {
        width: Math.max(a.width, b.width),
        height: Math.max(a.height, b.height),
      }
    : resized === 'crop'
      ? {
          width: Math.min(a.width, b.width),
          height: Math.min(a.height, b.height),
        }
      : a;

/** The largest accepted share of differing pixels: the stricter of the ratio and the pixel count; `undefined` when nothing was compared. */
export const acceptedRatio = (
  measurement: Measurement,
  { maxDiffRatio, maxDiffPixels }: Limits,
): number | undefined =>
  measurement.kind === 'compared'
    ? // a pixel limit alone is the limit; the default exactness only applies to neither
      (maxRatioFrom(
        { ratio: maxDiffRatio, pixels: maxDiffPixels },
        comparedSize(measurement),
      ) ?? 0)
    : undefined;

/** The status of a measurement, with the reason and its sentence. */
export const decide = ({
  measurement,
  limit = 0,
  settings: { update, onMissingBaseline },
  baselinePath,
  messages,
}: {
  measurement: Measurement;
  limit: number | undefined;
  settings: Settings;
  baselinePath: string;
  messages: Messages;
}): Decision => {
  const say = (status: Decision['status'], reason: Reason): Decision => ({
    status,
    reason,
    message: (messages[reason.code] as (reason: Reason) => string)(reason),
  });

  switch (measurement.kind) {
    case 'missing-baseline':
      return onMissingBaseline === 'create'
        ? say('created', { code: 'created' })
        : say('missing-baseline', { code: 'missing-baseline', baselinePath });
    case 'replaced':
      return say('updated', { code: 'updated', cause: 'always' });
    case 'size-mismatch': {
      const { baselineSize, actualSize } = measurement;
      return update === 'none'
        ? say('failed', { code: 'size-changed', baselineSize, actualSize })
        : say('updated', {
            code: 'updated',
            cause: 'size-changed',
            baselineSize,
            actualSize,
          });
    }
    case 'compared': {
      const { diffPixels, diffRatio } = measurement.result;
      const compared = {
        diffPixels,
        diffRatio,
        maxDiffRatio: limit,
        baselineSize: measurement.baselineSize,
        actualSize: measurement.actualSize,
        ...(measurement.resized && { resized: measurement.resized }),
      };
      if (diffRatio <= limit) {
        return say('passed', {
          code: diffPixels === 0 ? 'identical' : 'within-limit',
          ...compared,
        });
      }
      return update === 'none'
        ? say('failed', { code: 'above-limit', ...compared })
        : say('updated', {
            code: 'updated',
            cause: 'above-limit',
            ...compared,
          });
    }
  }
};
