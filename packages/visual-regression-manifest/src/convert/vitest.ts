import path from 'path';
import { ManifestBuilder, type ManifestHeaderInput } from '../builder';
import { resolveInProject, toPosix } from '../paths';
import { entryLimits, type ComparisonLimitOptions } from '../limits';
import { readPngSize } from '../png';
import type { Manifest, ManifestRunner, ManifestStatus } from '../types';
import { isImage, listFiles, stemOf } from './walk';

export type FromVitestScreenshotsOptions = Omit<ManifestHeaderInput, 'runner'> &
  ComparisonLimitOptions & {
    /** Recorded as `runner`; defaults to `{ name: 'vitest' }`. */
    runner?: ManifestRunner;
    /** Directories to scan, absolute or relative to `projectRoot`; default `[projectRoot]`. */
    roots?: string[];
    /** Name of the reference screenshot folders next to the test files. */
    screenshotsDirName?: string;
    /** Folder that holds the `-actual` and `-diff` images of failed comparisons, as a path relative to the directory it sits in. */
    attachmentsDir?: string;
  };

const BROWSERS = ['chrome', 'chromium', 'firefox', 'webkit', 'edge', 'safari'];
const PLATFORMS = [
  'aix',
  'darwin',
  'freebsd',
  'linux',
  'openbsd',
  'sunos',
  'win32',
];
const SUFFIX = new RegExp(
  `^(.*)-(${BROWSERS.join('|')})-(${PLATFORMS.join('|')})$`,
);

/** `button-chromium-darwin` -> `{ name: 'button', browser: 'chromium', os: 'darwin' }`; an unknown suffix is left in `name`. */
export const parseVitestScreenshotName = (stem: string) => {
  const match = stem.match(SUFFIX);
  return match
    ? { name: match[1], browser: match[2], os: match[3] }
    : { name: stem };
};

type Found = {
  /** Directory that holds the `__screenshots__` or `.vitest/attachments` folder: the test file's directory. */
  testDir: string;
  /** The test file's name, which Vitest uses as a folder name. */
  testFile: string;
  stem: string;
};

const keyOf = ({ testDir, testFile, stem }: Found) =>
  [testDir, testFile, stem].join('\u0000');

/**
 * Builds a manifest from the files Vitest's `toMatchScreenshot` (browser
 * mode) leaves behind: reference images in `__screenshots__/<test file>/`
 * next to the tests, and `<name>-actual.png` / `<name>-diff.png` under
 * `.vitest/attachments/<test file>/` for the comparisons that failed. A
 * reference with no attachments passed; attachments with no reference mean
 * there was nothing to compare against.
 */
export const fromVitestScreenshots = ({
  roots,
  screenshotsDirName = '__screenshots__',
  attachmentsDir = '.vitest/attachments',
  maxDiffRatio, // your allowedMismatchedPixelRatio
  maxDiffPixels, // your allowedMismatchedPixels
  colorThreshold, // your pixelmatch `threshold`
  colorMetric = 'yiq',
  runner,
  ...header
}: FromVitestScreenshotsOptions): Manifest => {
  const builder = new ManifestBuilder({
    ...header,
    runner: runner ?? { name: 'vitest' },
  });
  const projectRoot = builder.projectRoot;
  const attachmentsSegments = toPosix(attachmentsDir, path.sep)
    .split('/')
    .filter(Boolean);

  const baselines = new Map<string, Found & { file: string }>();
  const attachments = new Map<
    string,
    Found & { actual?: string; diff?: string }
  >();

  for (const root of roots ?? [projectRoot]) {
    for (const file of listFiles(resolveInProject(projectRoot, root))) {
      if (!isImage(file)) continue;
      const segments = file.split(path.sep);
      const stem = stemOf(file);
      const testFile = segments.at(-2) ?? '';
      // <testDir>/__screenshots__/<testFile>/<stem>.png
      if (segments.at(-3) === screenshotsDirName) {
        const found = {
          testDir: segments.slice(0, -3).join(path.sep),
          testFile,
          stem,
        };
        baselines.set(keyOf(found), { ...found, file });
        continue;
      }
      // <testDir>/.vitest/attachments/<testFile>/<stem>-(actual|diff).png
      const folder = segments.slice(-2 - attachmentsSegments.length, -2);
      if (folder.join('/') !== attachmentsSegments.join('/')) continue;
      const kind = stem.match(/^(.*)-(actual|diff)$/);
      if (!kind) continue;
      const found = {
        testDir: segments
          .slice(0, -2 - attachmentsSegments.length)
          .join(path.sep),
        testFile,
        stem: kind[1],
      };
      const key = keyOf(found);
      const group: Found & { actual?: string; diff?: string } =
        attachments.get(key) ?? found;
      group[kind[2] as 'actual' | 'diff'] = file;
      attachments.set(key, group);
    }
  }

  for (const key of new Set([...baselines.keys(), ...attachments.keys()])) {
    const found = baselines.get(key) ?? attachments.get(key);
    if (!found) continue;
    const { testDir, testFile, stem } = found;
    const baseline =
      baselines.get(key)?.file ??
      path.join(testDir, screenshotsDirName, testFile, `${stem}.png`);
    const group = attachments.get(key);
    const actual =
      group?.actual ??
      path.join(
        testDir,
        ...attachmentsSegments,
        testFile,
        `${stem}-actual.png`,
      );
    const status: ManifestStatus = group?.actual
      ? baselines.has(key)
        ? 'failed'
        : 'missing-baseline'
      : 'passed';
    const parsed = parseVitestScreenshotName(stem);
    const baselineSize = readPngSize(baseline);
    const actualSize = group?.actual ? readPngSize(group.actual) : undefined;
    builder.record({
      actualPath: actual,
      baselinePath: baseline,
      diffPath: group?.diff ?? null,
      name: stem,
      testFile: path.join(testDir, testFile),
      status,
      ...entryLimits(
        { maxDiffRatio, maxDiffPixels, colorThreshold, colorMetric },
        actualSize ?? baselineSize,
      ),
      baselineSize,
      actualSize,
      platform: parsed.os
        ? {
            osPlatform: parsed.os,
            ...(parsed.browser && { browser: { name: parsed.browser } }),
          }
        : undefined,
    });
  }
  return builder.toJSON();
};
