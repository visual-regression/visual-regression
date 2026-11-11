import fs from 'fs';
import path from 'path';
import { ManifestBuilder, type ManifestHeaderInput } from '../builder';
import { resolveInProject } from '../paths';
import { entryLimits, type ComparisonLimitOptions } from '../limits';
import { readPngSize } from '../png';
import type { Manifest, ManifestRunner } from '../types';
import { isImage, listFiles, stemOf } from './walk';

export type FromCypressVisualRegressionOptions = Omit<
  ManifestHeaderInput,
  'runner'
> &
  ComparisonLimitOptions & {
    /** Recorded as `runner`; defaults to `{ name: 'cypress' }`. */
    runner?: ManifestRunner;
    /** `visualRegressionBaseDirectory`, relative to `projectRoot`. */
    baseDirectory?: string;
    /** `screenshotsFolder`, where the actual screenshots go. */
    actualDirectory?: string;
    /** `visualRegressionDiffDirectory`. */
    diffDirectory?: string;
    /** `visualRegressionGenerateDiff` the run used: with `always` a diff image does not mean a failure. */
    generateDiff?: 'fail' | 'always' | 'never';
  };

/**
 * The path of an actual screenshot relative to the base folder's layout.
 * cypress-visual-regression names a screenshot `<spec path>/<name>` and
 * Cypress puts it under its screenshots folder below the spec's path relative
 * to the specs' common ancestor: `actual/<spec file>/<spec path>/<name>.png`
 * for `base/<spec path>/<name>.png`. A known base or diff path that ends the
 * actual's path wins; otherwise the prefix is found by its shape: it ends with
 * the spec file name, which the spec path repeats.
 */
const baseRelativeOf = (rel: string, known: Set<string>) => {
  const segments = rel.split(path.sep);
  for (let i = 1; i < segments.length; i++) {
    const candidate = segments.slice(i).join(path.sep);
    if (known.has(candidate)) return candidate;
  }
  for (let i = segments.length - 2; i >= 1; i--) {
    const specFile = segments[i - 1];
    const again = segments.indexOf(specFile, i);
    if (again < 0) continue;
    const specPath = segments.slice(i, again + 1);
    const prefix = segments.slice(0, i);
    const isSuffix = prefix.every(
      (segment, j) => segment === specPath[specPath.length - prefix.length + j],
    );
    if (isSuffix) return segments.slice(i).join(path.sep);
  }
  return rel;
};

/**
 * Builds a manifest from the folders of cypress-visual-regression:
 * `cypress/snapshots/base/<spec>/<name>.png`, `.../diff/<spec>/<name>.png`,
 * and the actual screenshots Cypress wrote below its own spec prefix in
 * `.../actual/`. Cypress writes an actual image for every comparison, so the
 * diff image is what tells a failure, unless the run was configured to
 * generate diffs always or never, in which case every compared screenshot
 * with a baseline is reported as `passed` or `failed` respectively only when
 * the images say so (see `generateDiff`).
 */
export const fromCypressVisualRegression = ({
  baseDirectory = 'cypress/snapshots/base',
  actualDirectory = 'cypress/snapshots/actual',
  diffDirectory = 'cypress/snapshots/diff',
  generateDiff = 'fail',
  maxDiffRatio, // your errorThreshold, as a 0..1 ratio
  maxDiffPixels, // your errorThreshold when it counts pixels
  colorThreshold, // your pixelmatch `threshold`
  colorMetric = 'yiq',
  runner,
  ...header
}: FromCypressVisualRegressionOptions): Manifest => {
  const builder = new ManifestBuilder({
    ...header,
    runner: runner ?? { name: 'cypress' },
  });
  const projectRoot = builder.projectRoot;
  const baseDir = resolveInProject(projectRoot, baseDirectory);
  const actualDir = resolveInProject(projectRoot, actualDirectory);
  const diffDir = resolveInProject(projectRoot, diffDirectory);

  const relativeImages = (dir: string) =>
    listFiles(dir)
      .filter(isImage)
      .map((file) => path.relative(dir, file));
  const known = new Set([
    ...relativeImages(baseDir),
    ...relativeImages(diffDir),
  ]);
  const actuals = new Map<string, string>();
  for (const rel of relativeImages(actualDir)) {
    actuals.set(baseRelativeOf(rel, known), path.join(actualDir, rel));
  }
  const keys = new Set([...relativeImages(baseDir), ...actuals.keys()]);

  for (const rel of keys) {
    const baseline = path.join(baseDir, rel);
    const actual = actuals.get(rel) ?? path.join(actualDir, rel);
    const diff = path.join(diffDir, rel);
    const hasBaseline = fs.existsSync(baseline);
    const hasActual = fs.existsSync(actual);
    const hasDiff = fs.existsSync(diff);
    const status = !hasBaseline
      ? 'missing-baseline'
      : generateDiff === 'fail'
        ? hasDiff
          ? 'failed'
          : 'passed'
        : // without a reliable diff signal the images are all there is:
          // an actual without a diff on `always` means no comparison ran
          hasDiff && generateDiff === 'always'
          ? 'failed'
          : 'passed';
    const baselineSize = readPngSize(baseline);
    const actualSize = hasActual ? readPngSize(actual) : undefined;
    builder.record({
      actualPath: actual,
      baselinePath: baseline,
      diffPath: hasDiff ? diff : null,
      name: stemOf(rel),
      // cypress-visual-regression nests screenshots under the spec's path
      testFile: path.dirname(rel) === '.' ? '' : path.dirname(rel),
      status,
      ...entryLimits(
        { maxDiffRatio, maxDiffPixels, colorThreshold, colorMetric },
        actualSize ?? baselineSize,
      ),
      baselineSize,
      actualSize,
    });
  }
  return builder.toJSON();
};
