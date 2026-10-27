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
    /** Folder under the project root that holds the actual, diff and reference images of failed comparisons (`attachmentsDir` of the Vitest config). */
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

type AttachmentKind = 'actual' | 'diff' | 'reference';
/** `button-actual-chromium-darwin`: the kind sits between the name and the browser/platform suffix. */
const ATTACHMENT = new RegExp(
  `^(.*)-(actual|diff|reference)-(${BROWSERS.join('|')})-(${PLATFORMS.join('|')})$`,
);
/** `button-chromium-darwin-actual`: the kind last, as in older attachment names. */
const LEGACY_ATTACHMENT = /^(.*)-(actual|diff)$/;

const parseAttachmentName = (
  stem: string,
): { stem: string; kind: AttachmentKind } | undefined => {
  const match = stem.match(ATTACHMENT);
  if (match) {
    return {
      stem: `${match[1]}-${match[3]}-${match[4]}`,
      kind: match[2] as AttachmentKind,
    };
  }
  const legacy = stem.match(LEGACY_ATTACHMENT);
  return legacy
    ? { stem: legacy[1], kind: legacy[2] as AttachmentKind }
    : undefined;
};

/** Index of the last occurrence of `needle` as a run of consecutive segments, or -1. */
const lastIndexOfSegments = (segments: string[], needle: string[]) => {
  for (let i = segments.length - needle.length; i >= 0; i--) {
    if (needle.every((segment, j) => segments[i + j] === segment)) return i;
  }
  return -1;
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
 * next to the tests, and `<name>-actual-<browser>-<platform>.png` /
 * `<name>-diff-...png` under `.vitest/attachments/<test file dir>/<test file>/`
 * at the project root for the comparisons that failed. A reference with no
 * attachments passed; a `<name>-reference-...png` attachment is the screenshot
 * of a comparison that had no reference (on CI, where Vitest writes none).
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
    Found & Partial<Record<AttachmentKind, string>>
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
      // <root>/.vitest/attachments/<testFileDir>/<testFile>/<name>-(actual|diff|reference)-<browser>-<platform>.png
      // (the files directly in the attachments folder are copies named by hash)
      const at = lastIndexOfSegments(segments, attachmentsSegments);
      if (at < 0) continue;
      const below = segments.slice(at + attachmentsSegments.length, -1);
      if (below.length < 1) continue;
      const parsed = parseAttachmentName(stem);
      if (!parsed) continue;
      const found = {
        testDir: [...segments.slice(0, at), ...below.slice(0, -1)].join(
          path.sep,
        ),
        testFile: below.at(-1) ?? '',
        stem: parsed.stem,
      };
      const key = keyOf(found);
      const group: Found & Partial<Record<AttachmentKind, string>> =
        attachments.get(key) ?? found;
      group[parsed.kind] = file;
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
    const parsed = parseVitestScreenshotName(stem);
    // the reference attachment is the screenshot of a comparison that had no
    // reference; next to a reference that exists by now it is a leftover
    const taken =
      group?.actual ?? (baselines.has(key) ? undefined : group?.reference);
    const actual =
      taken ??
      path.join(
        projectRoot,
        ...attachmentsSegments,
        path.relative(projectRoot, testDir),
        testFile,
        parsed.os
          ? `${parsed.name}-actual-${parsed.browser}-${parsed.os}.png`
          : `${stem}-actual.png`,
      );
    const status: ManifestStatus = taken
      ? baselines.has(key)
        ? 'failed'
        : 'missing-baseline'
      : 'passed';
    const baselineSize = readPngSize(baseline);
    const actualSize = taken ? readPngSize(taken) : undefined;
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
