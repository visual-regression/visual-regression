import fs from 'fs';
import path from 'path';
import { ManifestBuilder, type ManifestHeaderInput } from '../builder';
import { resolveInProject } from '../paths';
import { entryLimits, type ComparisonLimitOptions } from '../limits';
import { readPngSize } from '../png';
import type { Manifest, ManifestRunner } from '../types';
import { isImage, listFiles, stemOf } from './walk';

export type FromJestImageSnapshotOptions = Omit<ManifestHeaderInput, 'runner'> &
  ComparisonLimitOptions & {
    /** Recorded as `runner`; defaults to `{ name: 'jest' }` (pass `{ name: 'cypress' }` for cypress-image-snapshot). */
    runner?: ManifestRunner;
    /** Directories to scan; default `[projectRoot]`. */
    roots?: string[];
    /** `customSnapshotsDir` folder name. */
    snapshotsDirName?: string;
    /** `customDiffDir` folder name, inside the snapshots folder. */
    diffDirName?: string;
    /** `customReceivedDir` folder name, inside the snapshots folder; defaults to the diff folder. */
    receivedDirName?: string;
    /** `customSnapshotIdentifier` postfix of baselines. */
    snapshotPostfix?: string;
    /** `customDiffPostfix`. */
    diffPostfix?: string;
    /** `customReceivedPostfix`. */
    receivedPostfix?: string;
  };

/**
 * Builds a manifest from the files jest-image-snapshot (and its Cypress port,
 * cypress-image-snapshot) leaves behind: `<id>-snap.png` baselines in
 * `__image_snapshots__/`, and for failed comparisons `<id>-diff.png` in
 * `__image_snapshots__/__diff_output__/` (a baseline | diff | received
 * composite unless `onlyDiff` was set) plus, with `storeReceivedOnFailure`,
 * `<id>-received.png`. A baseline with no diff image passed.
 */
export const fromJestImageSnapshots = ({
  roots,
  snapshotsDirName = '__image_snapshots__',
  diffDirName = '__diff_output__',
  receivedDirName,
  snapshotPostfix = '-snap',
  diffPostfix = '-diff',
  receivedPostfix = '-received',
  maxDiffRatio, // your failureThreshold with failureThresholdType 'percent', as a 0..1 ratio
  maxDiffPixels, // your failureThreshold with failureThresholdType 'pixel'
  colorThreshold, // your customDiffConfig.threshold (pixelmatch)
  colorMetric = 'yiq',
  runner,
  ...header
}: FromJestImageSnapshotOptions): Manifest => {
  const builder = new ManifestBuilder({
    ...header,
    runner: runner ?? { name: 'jest' },
  });
  const projectRoot = builder.projectRoot;
  const strip = (stem: string, postfix: string) =>
    postfix && stem.endsWith(postfix) ? stem.slice(0, -postfix.length) : null;

  const baselines = new Map<string, string>();
  const diffs = new Map<string, string>();
  const received = new Map<string, string>();
  for (const root of roots ?? [projectRoot]) {
    for (const file of listFiles(resolveInProject(projectRoot, root))) {
      if (!isImage(file)) continue;
      const dir = path.basename(path.dirname(file));
      const parent = path.basename(path.dirname(path.dirname(file)));
      const stem = stemOf(file);
      if (dir === snapshotsDirName) {
        const id = strip(stem, snapshotPostfix);
        if (id !== null)
          baselines.set(`${path.dirname(file)}\u0000${id}`, file);
        continue;
      }
      if (parent !== snapshotsDirName) continue;
      const snapshotsDir = path.dirname(path.dirname(file));
      if (dir === diffDirName) {
        const id = strip(stem, diffPostfix);
        if (id !== null) diffs.set(`${snapshotsDir}\u0000${id}`, file);
      }
      if (dir === (receivedDirName ?? diffDirName)) {
        const id = strip(stem, receivedPostfix);
        if (id !== null) received.set(`${snapshotsDir}\u0000${id}`, file);
      }
    }
  }

  for (const key of new Set([...baselines.keys(), ...diffs.keys()])) {
    const [snapshotsDir, id] = key.split('\u0000');
    const baseline =
      baselines.get(key) ??
      path.join(snapshotsDir, `${id}${snapshotPostfix}.png`);
    const diff = diffs.get(key) ?? null;
    const actual = received.get(key);
    const hasBaseline = fs.existsSync(baseline);
    const baselineSize = readPngSize(baseline);
    builder.record({
      // the received image is the "actual" when stored; without it the entry
      // points at where it would be, and the diff composite is what reviewers see
      actualPath:
        actual ??
        path.join(
          snapshotsDir,
          receivedDirName ?? diffDirName,
          `${id}${receivedPostfix}.png`,
        ),
      baselinePath: baseline,
      diffPath: diff,
      name: id,
      status: diff ? (hasBaseline ? 'failed' : 'missing-baseline') : 'passed',
      // a failed comparison's received image can be a different size than the baseline
      ...entryLimits(
        { maxDiffRatio, maxDiffPixels, colorThreshold, colorMetric },
        baselineSize,
      ),
      baselineSize,
      actualSize: actual ? readPngSize(actual) : undefined,
      // the test file lives in the folder that holds `__image_snapshots__`
      testFile: '',
    });
  }
  return builder.toJSON();
};
