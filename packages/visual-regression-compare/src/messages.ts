export type Size = { width: number; height: number };

/** What a comparison measured, when it compared. */
type Compared = {
  diffPixels: number;
  /** Share of differing pixels, 0..1. */
  diffRatio: number;
  /** The limit the ratio was held against, 0..1. */
  maxDiffRatio: number;
  baselineSize: Size;
  actualSize: Size;
  /** Set when the sizes differed and both images were brought to one size before comparing. */
  resized?: 'pad' | 'crop';
};

/**
 * Why an entry got its status, as data. Written to the entry's
 * `extra.visualRegressionCompare.reason`, so a viewer or a review UI can phrase
 * it in any language; the entry's `message` is the same reason in the words of
 * the comparer's `messages`.
 */
export type Reason =
  /** Passed with no differing pixel. */
  | ({ code: 'identical' } & Compared)
  /** Passed with differing pixels, within the limit. */
  | ({ code: 'within-limit' } & Compared)
  /** Failed: more differing pixels than the limit allows. */
  | ({ code: 'above-limit' } & Compared)
  /** Failed under `onSizeMismatch: 'fail'`: nothing was compared. */
  | { code: 'size-changed'; baselineSize: Size; actualSize: Size }
  /** There is no baseline and none is created. `baselinePath` is relative to the project root. */
  | { code: 'missing-baseline'; baselinePath: string }
  /** The baseline did not exist and was created from the screenshot. */
  | { code: 'created' }
  /**
   * The baseline was replaced by the screenshot: unconditionally
   * (`always`, `update: 'all'`), or because the comparison failed
   * (`above-limit`, `size-changed`) under `update: 'failures-only'`, with what
   * that comparison measured.
   */
  | ({
      code: 'updated';
      cause: 'always' | 'above-limit' | 'size-changed';
    } & Partial<Compared>);

export type ReasonCode = Reason['code'];

/** One function per reason: a language. */
export type Messages = {
  [Code in ReasonCode]: (reason: Extract<Reason, { code: Code }>) => string;
};

const size = ({ width, height }: Size) => `${width}x${height}`;
const percent = (ratio: number) => `${Number((ratio * 100).toPrecision(3))}%`;

const resizedText = (reason: Partial<Compared>) =>
  reason.resized && reason.baselineSize && reason.actualSize
    ? ` Both images were ${reason.resized === 'pad' ? 'padded' : 'cropped'} to the same size (baseline ${size(reason.baselineSize)}, actual ${size(reason.actualSize)}).`
    : '';

const counts = (reason: Compared) =>
  `${reason.diffPixels} pixels (${percent(reason.diffRatio)}) differ`;

const sizeChanged = (reason: { baselineSize: Size; actualSize: Size }) =>
  `The size changed: baseline ${size(reason.baselineSize)}, actual ${size(reason.actualSize)}.`;

const REPLACED = 'Baseline image was replaced with the actual screenshot.';

/** The built-in messages. A comparer uses them for every reason its `messages` option does not cover. */
export const englishMessages: Messages = {
  identical: (reason) => `Identical to the baseline.${resizedText(reason)}`,
  'within-limit': (reason) =>
    `${counts(reason)}, within the limit of ${percent(reason.maxDiffRatio)}.${resizedText(reason)}`,
  'above-limit': (reason) =>
    `${counts(reason)}; the limit is ${percent(reason.maxDiffRatio)}.${resizedText(reason)}`,
  'size-changed': sizeChanged,
  'missing-baseline': (reason) =>
    `There is no baseline image at "${reason.baselinePath}".`,
  created: () => 'Baseline image was created from the actual screenshot.',
  updated: (reason) => {
    if (reason.cause === 'above-limit' && reason.diffPixels !== undefined) {
      return `${counts(reason as Compared)}. ${REPLACED}${resizedText(reason)}`;
    }
    if (reason.cause === 'size-changed' && reason.baselineSize) {
      return `${sizeChanged(reason as Required<Pick<Compared, 'baselineSize' | 'actualSize'>>)} ${REPLACED}`;
    }
    return REPLACED;
  },
};
