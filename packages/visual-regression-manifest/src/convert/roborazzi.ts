import { ManifestBuilder, type ManifestHeaderInput } from '../builder';
import { readPngSize } from '../png';
import type { Manifest, ManifestRunner, ManifestStatus } from '../types';
import { stemOf } from './walk';

/** Roborazzi's `build/test-results/roborazzi/<variant>/results-summary.json`. */
export type RoborazziResults = {
  summary?: {
    total?: number;
    recorded?: number;
    added?: number;
    changed?: number;
    unchanged?: number;
  };
  results?: RoborazziResult[];
};

export type RoborazziResult = {
  type: 'recorded' | 'added' | 'changed' | 'unchanged' | string;
  /** Absolute. */
  golden_file_path?: string;
  /** Absolute; `added` and `changed` only. */
  actual_file_path?: string;
  /** Absolute; the golden | diff | actual composite, `added` and `changed` only. */
  compare_file_path?: string;
  /** Nanoseconds since the Unix epoch. */
  timestamp?: number;
  /** 0..1, `changed` only. */
  diff_percentage?: number;
  context_data?: Record<string, unknown>;
  ai_assertion_results?: unknown;
};

export type FromRoborazziResultsOptions = Omit<
  ManifestHeaderInput,
  'runner'
> & {
  /** Recorded as `runner`; defaults to `{ name: 'roborazzi' }`. */
  runner?: ManifestRunner;
  /** `changeThreshold` the tests used (a 0..1 ratio), recorded as `comparison.maxDiffRatio`; the results summary does not carry it. */
  maxDiffRatio?: number;
};

const STATUS: Record<string, ManifestStatus> = {
  // `record` writes the golden, whether or not one existed
  recorded: 'updated',
  // `compare` found no golden to compare against
  added: 'missing-baseline',
  changed: 'failed',
  unchanged: 'passed',
};

const isoFromNanos = (ns: number | undefined) =>
  ns === undefined || !Number.isFinite(ns)
    ? undefined
    : new Date(Math.floor(ns / 1e6)).toISOString();

/**
 * Converts Roborazzi's results summary (written by `compareRoborazzi*` and
 * `recordRoborazzi*`) into a manifest. Roborazzi renders Android UI under
 * Robolectric on the JVM, so entries carry an emulated Android target and a
 * `robolectric` renderer; its `_compare` composite is the entry's diff image.
 */
export const fromRoborazziResults = (
  results: RoborazziResults,
  { maxDiffRatio, runner, ...header }: FromRoborazziResultsOptions,
): Manifest => {
  if (!results || !Array.isArray(results.results)) {
    throw new TypeError(
      'Not a Roborazzi results summary: expected an object with a `results` array',
    );
  }
  const builder = new ManifestBuilder({
    ...header,
    runner: runner ?? { name: 'roborazzi' },
  });
  for (const result of results.results) {
    const golden = result.golden_file_path;
    if (!golden) continue;
    const status = STATUS[result.type];
    if (!status) continue;
    const actual =
      result.actual_file_path ?? golden.replace(/(\.[^./\\]+)$/, '_actual$1');
    builder.record({
      actualPath: actual,
      baselinePath: golden,
      diffPath: result.compare_file_path ?? null,
      name: stemOf(golden),
      status,
      diffRatio: result.diff_percentage ?? 0,
      maxDiffRatio,
      baselineWritten: result.type === 'recorded',
      recordedAt: isoFromNanos(result.timestamp),
      baselineSize: readPngSize(golden),
      actualSize: result.actual_file_path
        ? readPngSize(result.actual_file_path)
        : undefined,
      target: { kind: 'mobile', os: 'android', emulated: true },
      renderer: { backend: 'emulator', name: 'robolectric' },
      extra: result.context_data && { roborazzi: result.context_data },
    });
  }
  return builder.toJSON();
};
