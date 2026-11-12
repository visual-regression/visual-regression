import path from 'path';
import type { ManifestEntryInput } from 'visual-regression-manifest';
import type { Settings } from './settings';
import type {
  CompareInput,
  Decision,
  DiffEngine,
  ImageRef,
  Measurement,
  Store,
} from './types';

/** Where a file is, as an absolute path: the store's, else under the project root. */
export const locator = (store: Store, projectRoot: string) => (ref: ImageRef) =>
  store.locate(ref) ?? path.join(projectRoot, ref.path);

/** `/` separators, relative to the project root: how the manifest names a file. */
export const projectPath = (projectRoot: string, file: string) =>
  path.relative(projectRoot, file).split(path.sep).join('/');

const compareMeta = (measurement: Measurement, decision: Decision) => {
  const compared = measurement.kind === 'compared' ? measurement : undefined;
  return {
    ...(compared && { diffPixels: compared.result.diffPixels }),
    ...(compared?.result.score && { score: compared.result.score }),
    ...(compared?.resized && { sizeMismatch: compared.resized }),
    ...(decision.reason && { reason: decision.reason }),
    ...(measurement.kind === 'size-mismatch' && {
      sizeMismatch: 'fail',
      baselineSize: measurement.baselineSize,
      actualSize: measurement.actualSize,
    }),
  };
};

/** The options block an entry records when the runner states none of its own. */
const defaultOptions = ({
  settings: { limits, engineOptions, update, onMissingBaseline },
  engine,
  imagesDir,
}: {
  settings: Settings;
  engine: DiffEngine;
  imagesDir: string;
}): NonNullable<ManifestEntryInput['options']> => ({
  imagesPath: `${imagesDir || '.'}/{name}.png`,
  maxDiffRatio: limits.maxDiffRatio ?? 0,
  diffConfig: { engine: engine.name, ...engineOptions },
  createMissingImages: onMissingBaseline === 'create',
  updateImages: update === 'failures-only' ? 'failures-only' : update === 'all',
});

/** The manifest entry of one comparison. */
export const entryInput = ({
  input,
  name,
  settings,
  measurement,
  decision,
  limit,
  engine,
  baselineWritten,
  duration,
  files,
  imagesDir,
  defaults,
}: {
  input: CompareInput;
  name: string;
  settings: Settings;
  measurement: Measurement;
  decision: Decision;
  limit: number | undefined;
  engine: DiffEngine;
  baselineWritten: boolean;
  duration: number;
  /** Absolute paths of the three files. */
  files: { baseline: string; actual: string; diff: string };
  /** The directory of the baselines, relative to the project root. */
  imagesDir: string;
  /** What the comparer records on entries that do not state their own. */
  defaults: Pick<CompareInput, 'platform' | 'variant'>;
}): ManifestEntryInput => {
  const sized =
    measurement.kind === 'compared' || measurement.kind === 'size-mismatch'
      ? measurement
      : undefined;
  return {
    actualPath: files.actual,
    baselinePath: files.baseline,
    diffPath: files.diff,
    name,
    testFile: input.test?.filePath,
    titlePath: input.test?.titlePath,
    retry: input.test?.retry,
    status: decision.status,
    diffRatio:
      measurement.kind === 'size-mismatch'
        ? 1
        : measurement.kind === 'compared'
          ? measurement.result.diffRatio
          : undefined,
    maxDiffRatio: limit ?? settings.limits.maxDiffRatio ?? 0,
    colorThreshold: engine.colorThreshold,
    colorMetric: engine.colorMetric,
    baselineWritten,
    message: decision.message,
    baselineSize: sized?.baselineSize,
    actualSize: sized?.actualSize,
    platform: input.platform ?? defaults.platform,
    viewport: input.viewport,
    variant: input.variant ?? defaults.variant,
    extra: {
      ...input.extra,
      visualRegressionCompare: {
        engine: engine.name,
        ...compareMeta(measurement, decision),
        ...decision.extra,
      },
    },
    ...input.entry,
    options:
      input.entry?.options ?? defaultOptions({ settings, engine, imagesDir }),
    duration: input.duration ?? duration,
  };
};
