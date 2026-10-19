import path from 'path';
import { ManifestBuilder, type ManifestHeaderInput } from '../builder';
import { resolveInProject } from '../paths';
import { readPngSize } from '../png';
import type { Manifest, ManifestRunner, ManifestStatus } from '../types';
import { stemOf } from './walk';

/** The parts of BackstopJS's JSON report (`backstop_data/json_report/jsonReport.json`) the converter reads. */
export type BackstopReport = {
  testSuite?: string;
  tests?: BackstopTest[];
};

export type BackstopTest = {
  pair: BackstopPair;
  status?: 'pass' | 'fail' | string;
};

export type BackstopPair = {
  /** Relative to the report directory. */
  reference: string;
  /** Relative to the report directory. */
  test: string;
  selector?: string;
  fileName?: string;
  label?: string;
  requireSameDimensions?: boolean;
  /** Percent, 0..100. */
  misMatchThreshold?: number;
  url?: string;
  referenceUrl?: string;
  expect?: number;
  viewportLabel?: string;
  diff?: {
    isSameDimensions?: boolean;
    dimensionDifference?: { width?: number; height?: number };
    rawMisMatchPercentage?: number | string;
    /** Percent, 0..100; resemble reports it as a string. */
    misMatchPercentage?: number | string;
    analysisTime?: number;
  };
  /** Relative to the report directory. */
  diffImage?: string;
  error?: string;
};

export type FromBackstopReportOptions = Omit<ManifestHeaderInput, 'runner'> & {
  /** Recorded as `runner`; defaults to `{ name: 'backstopjs' }`. */
  runner?: ManifestRunner;
  /** Directory the report's relative paths resolve against (where `jsonReport.json` lives); defaults to `backstop_data/json_report` under `projectRoot`. */
  reportDir?: string;
};

const percent = (value: number | string | undefined) => {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  return n === undefined || Number.isNaN(n) ? 0 : n / 100;
};

const statusOf = (test: BackstopTest): ManifestStatus => {
  if (/reference file not found/i.test(test.pair.error ?? ''))
    return 'missing-baseline';
  return test.status === 'pass' ? 'passed' : 'failed';
};

/**
 * Converts BackstopJS's JSON report (`report: ["json"]` in `backstop.json`)
 * into a manifest: one entry per scenario and viewport, with the mismatch
 * percentage as the diff ratio. The report's paths are relative to the
 * directory it was written to, so pass `reportDir` when it is not the default.
 */
export const fromBackstopReport = (
  report: BackstopReport,
  { reportDir, runner, ...header }: FromBackstopReportOptions,
): Manifest => {
  if (!report || !Array.isArray(report.tests)) {
    throw new TypeError(
      'Not a BackstopJS JSON report: expected an object with a `tests` array',
    );
  }
  const builder = new ManifestBuilder({
    ...header,
    runner: runner ?? { name: 'backstopjs' },
  });
  const dir = resolveInProject(
    builder.projectRoot,
    reportDir ?? path.join('backstop_data', 'json_report'),
  );
  for (const test of report.tests) {
    const { pair } = test;
    if (!pair?.test || !pair.reference) continue;
    const baseline = path.resolve(dir, pair.reference);
    const actual = path.resolve(dir, pair.test);
    const diff = pair.diffImage ? path.resolve(dir, pair.diffImage) : null;
    const status = statusOf(test);
    builder.record({
      actualPath: actual,
      baselinePath: baseline,
      diffPath: diff,
      name: stemOf(pair.fileName ?? pair.test),
      titlePath: [pair.label, pair.viewportLabel].filter(
        (part): part is string => !!part,
      ),
      status,
      diffRatio: percent(pair.diff?.misMatchPercentage),
      maxDiffRatio:
        pair.misMatchThreshold === undefined
          ? undefined
          : percent(pair.misMatchThreshold),
      message: pair.error ?? '',
      baselineSize: readPngSize(baseline),
      actualSize: readPngSize(actual),
      variant: pair.viewportLabel,
      subject: pair.url ? { id: pair.url, kind: 'page' } : undefined,
      extra: {
        backstop: {
          label: pair.label,
          viewportLabel: pair.viewportLabel,
          selector: pair.selector,
          url: pair.url,
          referenceUrl: pair.referenceUrl,
          expect: pair.expect,
          requireSameDimensions: pair.requireSameDimensions,
          diff: pair.diff,
        },
      },
    });
  }
  return builder.toJSON();
};
