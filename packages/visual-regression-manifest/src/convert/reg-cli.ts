import path from 'path';
import { ManifestBuilder, type ManifestHeaderInput } from '../builder';
import { entryLimits, type ComparisonLimitOptions } from '../limits';
import { resolveInProject, toPosix } from '../paths';
import { readPngSize } from '../png';
import type { Manifest, ManifestRunner, ManifestStatus } from '../types';

/**
 * reg-cli's JSON report (`reg.json`, `-J`), also what reg-suit's core keeps.
 * Every item is an image path relative to its folder (`home.png`,
 * `pages/about.png`); the folders are relative to the report file, with the
 * `--urlPrefix` (`./` by default) in front.
 */
export type RegCliReport = {
  /** Compared and over the threshold; a diff image was written. */
  failedItems: string[];
  /** In the actual folder only. */
  newItems: string[];
  /** In the expected folder only. */
  deletedItems: string[];
  passedItems: string[];
  expectedItems?: string[];
  actualItems?: string[];
  /** The diff images of `failedItems`, always `.png`. */
  diffItems?: string[];
  actualDir: string;
  expectedDir: string;
  diffDir: string;
};

export type FromRegCliOptions = Omit<ManifestHeaderInput, 'runner'> &
  ComparisonLimitOptions & {
    /** Recorded as `runner`; defaults to `{ name: 'reg-cli' }`. */
    runner?: ManifestRunner;
    /** Directory the report's folders resolve against (where `reg.json` lives); defaults to `projectRoot`. */
    reportDir?: string;
    /** The actual folder, when the report's one is not a path (an `--urlPrefix` URL). Relative to `projectRoot`. */
    actualDir?: string;
    expectedDir?: string;
    diffDir?: string;
    /**
     * The run was `-U` (`--update`): the failed and new actuals were copied
     * over the expected images after the comparison, so they are `updated`
     * and `created` rather than `failed` and `missing-baseline`.
     */
    update?: boolean;
  };

const isUrl = (value: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(value);

/** `pages/about.png` -> `pages/about`: the item without its extension, the entry's name. */
const nameOf = (item: string) => {
  const posix = toPosix(item);
  const ext = path.posix.extname(posix);
  return ext ? posix.slice(0, -ext.length) : posix;
};

/**
 * Converts the JSON report reg-cli writes (`reg-cli actual expected diff -J
 * reg.json`) into a manifest. `failedItems` are `failed` (with the diff image
 * from the diff folder), `newItems` are `missing-baseline` (an actual with no
 * expected image), `passedItems` are `passed`; after an `--update` run they are
 * `updated` and `created` instead. `deletedItems`, expected images with no
 * actual, have no status in the manifest and get no entry; they are listed under
 * `extra.regCli.deletedItems` on the manifest. The report carries no diff
 * ratio; the thresholds the run used come from the options.
 */
export const fromRegCli = (
  report: RegCliReport,
  {
    reportDir,
    actualDir,
    expectedDir,
    diffDir,
    update = false,
    maxDiffRatio, // your --thresholdRate
    maxDiffPixels, // your --thresholdPixel
    colorThreshold, // your --matchingThreshold (pixelmatch)
    colorMetric = 'yiq',
    runner,
    extra,
    ...header
  }: FromRegCliOptions,
): Manifest => {
  if (
    !report ||
    !Array.isArray(report.failedItems) ||
    !Array.isArray(report.newItems) ||
    !Array.isArray(report.passedItems)
  ) {
    throw new TypeError(
      'Not a reg-cli JSON report: expected an object with `failedItems`, `newItems` and `passedItems` arrays',
    );
  }
  const deletedItems = Array.isArray(report.deletedItems)
    ? report.deletedItems
    : [];
  const builder = new ManifestBuilder({
    ...header,
    runner: runner ?? { name: 'reg-cli' },
    extra:
      deletedItems.length > 0
        ? {
            ...extra,
            regCli: {
              ...extra?.regCli,
              deletedItems: deletedItems.map((item) => toPosix(item)),
            },
          }
        : extra,
  });
  const projectRoot = builder.projectRoot;
  const base = resolveInProject(projectRoot, reportDir ?? projectRoot);
  const folder = (
    override: string | undefined,
    reported: string,
    which: string,
  ) => {
    if (override !== undefined) return resolveInProject(projectRoot, override);
    if (typeof reported !== 'string' || isUrl(reported)) {
      throw new TypeError(
        `The report's ${which} (${JSON.stringify(reported)}) is not a path; pass \`${which}\` to say where the images are`,
      );
    }
    return path.resolve(base, reported);
  };
  const actuals = folder(actualDir, report.actualDir, 'actualDir');
  const expected = folder(expectedDir, report.expectedDir, 'expectedDir');
  const diffs = folder(diffDir, report.diffDir, 'diffDir');

  const record = (item: string, status: ManifestStatus, withDiff: boolean) => {
    const baseline = path.join(expected, item);
    const actual = path.join(actuals, item);
    // the diff is always a PNG, whatever the compared format
    const diff = withDiff
      ? path.join(diffs, item.replace(/\.[^.]+$/, '.png'))
      : null;
    const baselineSize = readPngSize(baseline);
    const actualSize = readPngSize(actual);
    builder.record({
      actualPath: actual,
      baselinePath: baseline,
      diffPath: diff,
      name: nameOf(item),
      status,
      ...entryLimits(
        { maxDiffRatio, maxDiffPixels, colorThreshold, colorMetric },
        actualSize ?? baselineSize,
      ),
      baselineWritten: update && status !== 'passed',
      baselineSize,
      actualSize,
    });
  };
  for (const item of report.passedItems) record(item, 'passed', false);
  for (const item of report.failedItems)
    record(item, update ? 'updated' : 'failed', true);
  for (const item of report.newItems)
    record(item, update ? 'created' : 'missing-baseline', false);
  return builder.toJSON();
};
