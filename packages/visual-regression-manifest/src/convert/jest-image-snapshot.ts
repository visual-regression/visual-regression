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
    /** `customReceivedDir` folder name, inside the snapshots folder. */
    receivedDirName?: string;
    /**
     * The postfix of default snapshot identifiers (`<test file>-<test name>-<n>-snap`),
     * dropped from the entry name when present. A custom identifier keeps its name
     * even when it ends the same way; a default identifier next to a custom one of
     * the same bare name (`home-1-snap.png` and `home-1.png`) keeps its postfix.
     */
    snapshotPostfix?: string;
    /** The postfix of diff images. */
    diffPostfix?: string;
    /** `customReceivedPostfix`. */
    receivedPostfix?: string;
  };

type Found = { snapshotsDir: string; stem: string; file: string };

/**
 * Builds a manifest from the files jest-image-snapshot (and its Cypress port,
 * cypress-image-snapshot) leaves behind: `<id>.png` baselines in
 * `__image_snapshots__/`, where `<id>` is the `customSnapshotIdentifier` or
 * `<test file>-<test name>-<n>-snap`, and for failed comparisons
 * `<id>-diff.png` in `__image_snapshots__/__diff_output__/` (a baseline |
 * diff | received composite unless `onlyDiff` was set) plus, with
 * `storeReceivedOnFailure`, `__image_snapshots__/__received_output__/<id>-received.png`.
 * A baseline with no diff image passed; a diff whose baseline is gone (deleted
 * to re-record, then run with `--ci`, which writes nothing) is `missing-baseline`.
 */
export const fromJestImageSnapshots = ({
  roots,
  snapshotsDirName = '__image_snapshots__',
  diffDirName = '__diff_output__',
  receivedDirName = '__received_output__',
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
  const keyOf = (snapshotsDir: string, id: string) =>
    `${snapshotsDir}\u0000${id}`;

  const snapshots: Found[] = [];
  const diffFiles: Found[] = [];
  const receivedFiles: Found[] = [];
  for (const root of roots ?? [projectRoot]) {
    for (const file of listFiles(resolveInProject(projectRoot, root))) {
      if (!isImage(file)) continue;
      const dir = path.basename(path.dirname(file));
      const parent = path.basename(path.dirname(path.dirname(file)));
      const stem = stemOf(file);
      // every image directly in the snapshots folder is a baseline
      if (dir === snapshotsDirName) {
        snapshots.push({ snapshotsDir: path.dirname(file), stem, file });
        continue;
      }
      if (parent !== snapshotsDirName) continue;
      const snapshotsDir = path.dirname(path.dirname(file));
      if (dir === diffDirName) diffFiles.push({ snapshotsDir, stem, file });
      if (dir === receivedDirName)
        receivedFiles.push({ snapshotsDir, stem, file });
    }
  }

  // a baseline is named by its identifier: a custom one as is, a default one
  // without its postfix, unless a custom identifier of that bare name sits next
  // to it (then both stay apart under their own file names)
  const baselines = new Map<string, string>();
  const defaultNamed: Found[] = [];
  for (const found of snapshots) {
    if (strip(found.stem, snapshotPostfix) === null)
      baselines.set(keyOf(found.snapshotsDir, found.stem), found.file);
    else defaultNamed.push(found);
  }
  for (const { snapshotsDir, stem, file } of defaultNamed) {
    const bare = strip(stem, snapshotPostfix) ?? stem;
    const taken = baselines.has(keyOf(snapshotsDir, bare));
    baselines.set(keyOf(snapshotsDir, taken ? stem : bare), file);
  }
  // a diff or received image carries the identifier its baseline was named by
  const byBaseline = (files: Found[], postfix: string) => {
    const map = new Map<string, string>();
    for (const { snapshotsDir, stem, file } of files) {
      const id = strip(stem, postfix);
      if (id === null) continue;
      const bare = strip(id, snapshotPostfix);
      const key =
        bare !== null && !baselines.has(keyOf(snapshotsDir, id))
          ? keyOf(snapshotsDir, bare)
          : keyOf(snapshotsDir, id);
      map.set(key, file);
    }
    return map;
  };
  const diffs = byBaseline(diffFiles, diffPostfix);
  const received = byBaseline(receivedFiles, receivedPostfix);

  for (const key of new Set([...baselines.keys(), ...diffs.keys()])) {
    const [snapshotsDir, id] = key.split('\u0000');
    // a baseline that is gone can only be guessed at: a default identifier's file
    const baseline =
      baselines.get(key) ??
      path.join(snapshotsDir, `${id}${snapshotPostfix}.png`);
    const diff = diffs.get(key) ?? null;
    const actual = received.get(key);
    const hasBaseline = fs.existsSync(baseline);
    const baselineSize = readPngSize(baseline);
    builder.record({
      // the received image is the "actual" when stored; without it the builder
      // records `null` (the file does not exist), and the diff composite is what
      // reviewers see
      actualPath:
        actual ??
        path.join(snapshotsDir, receivedDirName, `${id}${receivedPostfix}.png`),
      baselinePath: baseline,
      diffPath: diff,
      name: id,
      // a missing baseline usually leaves nothing behind (not written with --ci,
      // written and passed otherwise); a diff of an earlier failure outlives a
      // baseline deleted to re-record, and that is the one case the files tell apart
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
