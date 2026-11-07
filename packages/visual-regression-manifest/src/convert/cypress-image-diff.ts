import fs from 'fs';
import path from 'path';
import { ManifestBuilder, type ManifestHeaderInput } from '../builder';
import { resolveInProject } from '../paths';
import { readPngSize } from '../png';
import type { Manifest, ManifestRunner, ManifestStatus } from '../types';

/** One `compareSnapshot` call in cypress-image-diff-js's JSON report. */
export type CypressImageDiffTest = {
  status: 'pass' | 'fail' | string;
  /** The screenshot name, `<spec name>-<given name>` unless `exactName` or a `nameTemplate` was used. */
  name: string;
  /** The plugin's "percentage": the square root of the share of differing pixels, 0..1; absent when the baseline was missing. */
  percentage?: number;
  /** The `testThreshold`, on the same scale as `percentage`. */
  failureThreshold?: number;
  specFilename?: string;
  specPath?: string;
  /** Relative to the Cypress working directory; empty when the file did not exist when the report was written. */
  baselinePath?: string;
  diffPath?: string;
  comparisonPath?: string;
  baselineDataUrl?: string;
  diffDataUrl?: string;
  comparisonDataUrl?: string;
};

export type CypressImageDiffSuite = {
  /** The spec file name. */
  name?: string;
  /** The spec path. */
  path?: string;
  tests: CypressImageDiffTest[];
};

/** `cypress-image-diff-html-report/report_<date>.json` (or `<JSON_REPORT.FILENAME>.json`). */
export type CypressImageDiffReport = {
  total?: number;
  totalPassed?: number;
  totalFailed?: number;
  totalSuites?: number;
  suites: CypressImageDiffSuite[];
  startedAt?: string;
  endedAt?: string;
  duration?: number;
  browserName?: string;
  browserVersion?: string;
  cypressVersion?: string;
};

export type FromCypressImageDiffOptions = Omit<
  ManifestHeaderInput,
  'runner'
> & {
  /** Recorded as `runner`; defaults to `{ name: 'cypress', version }` with the report's Cypress version. */
  runner?: ManifestRunner;
  /** Directory the report's paths resolve against (the Cypress working directory); defaults to `projectRoot`. */
  reportDir?: string;
  /**
   * The plugin's screenshots folder (`<ROOT_DIR>/<SCREENSHOTS_DIR>`, holding
   * `baseline/`, `comparison/` and `diff/`), relative to `projectRoot`. Used for
   * images the report does not name: it leaves a path empty when the file did
   * not exist, such as the baseline of a missing-baseline failure. Defaults to
   * `cypress-image-diff-screenshots`, or to the folder of another image of the same entry.
   */
  screenshotsDir?: string;
  /** `COMPARISON_OPTIONS.threshold`, pixelmatch's per-pixel color tolerance (the plugin defaults to 0.1). */
  colorThreshold?: number;
};

const FOLDERS = ['baseline', 'comparison', 'diff'] as const;

/** `<dir>/comparison/<name>.png` -> `<dir>`, when the path has that shape. */
const screenshotsDirOf = (file: string | undefined) => {
  if (!file) return undefined;
  const folder = path.basename(path.dirname(file));
  return (FOLDERS as readonly string[]).includes(folder)
    ? path.dirname(path.dirname(file))
    : undefined;
};

/**
 * Converts the JSON report cypress-image-diff-js writes after a run
 * (`JSON_REPORT` in its config) into a manifest: one entry per
 * `compareSnapshot`, named after the screenshot, in the spec that took it.
 * The plugin's "percentage" is the square root of the share of differing
 * pixels, and so is its threshold; the converter squares both back into the
 * manifest's `diffRatio` and `maxDiffRatio` and keeps the plugin's numbers
 * under `extra.cypressImageDiff`. A failed test whose baseline does not exist
 * is `missing-baseline` (`FAIL_ON_MISSING_BASELINE`); without that option the
 * plugin copies the comparison to the baseline and the test passes.
 */
export const fromCypressImageDiff = (
  report: CypressImageDiffReport,
  {
    reportDir,
    screenshotsDir = 'cypress-image-diff-screenshots',
    colorThreshold,
    runner,
    ...header
  }: FromCypressImageDiffOptions,
): Manifest => {
  if (!report || !Array.isArray(report.suites)) {
    throw new TypeError(
      'Not a cypress-image-diff-js JSON report: expected an object with a `suites` array',
    );
  }
  const builder = new ManifestBuilder({
    createdAt: report.startedAt,
    ...header,
    runner: runner ?? {
      name: 'cypress',
      ...(report.cypressVersion && { version: report.cypressVersion }),
    },
  });
  const projectRoot = builder.projectRoot;
  const base = resolveInProject(projectRoot, reportDir ?? projectRoot);
  const defaultDir = resolveInProject(projectRoot, screenshotsDir);
  const browser = report.browserName
    ? {
        name: report.browserName,
        ...(report.browserVersion && { version: report.browserVersion }),
      }
    : undefined;

  for (const suite of report.suites) {
    if (!Array.isArray(suite?.tests)) continue;
    for (const test of suite.tests) {
      if (!test?.name) continue;
      const named = (file: string | undefined) =>
        file ? path.resolve(base, file) : undefined;
      // the report names only the files that existed; the others sit in the
      // same folders, next to the ones it names
      const dir =
        screenshotsDirOf(named(test.comparisonPath)) ??
        screenshotsDirOf(named(test.baselinePath)) ??
        screenshotsDirOf(named(test.diffPath)) ??
        defaultDir;
      const image = (folder: (typeof FOLDERS)[number]) =>
        path.join(dir, folder, `${test.name}.png`);
      const baseline = named(test.baselinePath) ?? image('baseline');
      const actual = named(test.comparisonPath) ?? image('comparison');
      const diff = named(test.diffPath) ?? image('diff');
      const passed = test.status === 'pass';
      const status: ManifestStatus = passed
        ? 'passed'
        : fs.existsSync(baseline)
          ? 'failed'
          : 'missing-baseline';
      const square = (value: number | undefined) =>
        typeof value === 'number' && Number.isFinite(value)
          ? value * value
          : undefined;
      builder.record({
        actualPath: actual,
        baselinePath: baseline,
        diffPath: fs.existsSync(diff) ? diff : null,
        name: test.name,
        testFile: test.specPath ?? suite.path ?? '',
        status,
        diffRatio: square(test.percentage),
        maxDiffRatio: square(test.failureThreshold),
        ...(colorThreshold !== undefined && {
          colorThreshold,
          colorMetric: 'yiq',
        }),
        message:
          status === 'missing-baseline'
            ? 'Missing baseline image'
            : status === 'failed'
              ? `Image difference ${test.percentage} greater than threshold ${test.failureThreshold}`
              : undefined,
        baselineSize: readPngSize(baseline),
        actualSize: readPngSize(actual),
        // the report names the browser; the host is where the converter runs
        platform: browser && {
          osPlatform: builder.header.platform.osPlatform,
          browser,
        },
        extra: {
          cypressImageDiff: {
            ...(test.percentage !== undefined && {
              percentage: test.percentage,
            }),
            ...(test.failureThreshold !== undefined && {
              failureThreshold: test.failureThreshold,
            }),
            specFilename: test.specFilename ?? suite.name,
          },
        },
      });
    }
  }
  return builder.toJSON();
};
