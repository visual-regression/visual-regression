import type { ManifestEntryInput } from './builder';
import type { ManifestColorMetric } from './types';

type Size = { width: number; height: number };

/**
 * The limits a converter's caller states, because the files a tool leaves
 * behind do not say what it was configured with. Recorded on every entry the
 * converter writes.
 */
export type ComparisonLimitOptions = {
  /** Largest accepted share of differing pixels, 0..1 (`maxDiffPixelRatio`, `allowedMismatchedPixelRatio`, ...). */
  maxDiffRatio?: number;
  /** Largest accepted number of differing pixels (`maxDiffPixels`, ...); stored as a ratio of each image's size. */
  maxDiffPixels?: number;
  /** Per-pixel color tolerance the tool used; needs `colorMetric`. */
  colorThreshold?: number;
  colorMetric?: ManifestColorMetric;
};

/**
 * A comparison's pixel limits as one `maxDiffRatio`. Tools take the limit as a
 * share of all pixels or as a count; the manifest stores the share, so a count
 * is divided by the image area. When both are given the stricter one wins, as
 * the tools fail on either. `undefined` when only a count is given and the
 * size is unknown.
 */
export const maxRatioFrom = (
  limits: { ratio?: number; pixels?: number },
  size: Size | undefined,
): number | undefined => {
  const area = size ? size.width * size.height : 0;
  const fromCount =
    limits.pixels !== undefined && area > 0
      ? Math.min(1, limits.pixels / area)
      : undefined;
  if (limits.ratio === undefined) return fromCount;
  return fromCount === undefined
    ? limits.ratio
    : Math.min(limits.ratio, fromCount);
};

/** The limit fields of a `ManifestEntryInput` for one image, from the options a converter was given. */
export const entryLimits = (
  {
    maxDiffRatio,
    maxDiffPixels,
    colorThreshold,
    colorMetric,
  }: ComparisonLimitOptions,
  size: Size | undefined,
): Pick<
  ManifestEntryInput,
  'maxDiffRatio' | 'colorThreshold' | 'colorMetric'
> => ({
  maxDiffRatio: maxRatioFrom(
    { ratio: maxDiffRatio, pixels: maxDiffPixels },
    size,
  ),
  colorThreshold,
  colorMetric,
});
