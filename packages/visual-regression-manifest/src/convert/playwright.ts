import fs from 'fs';
import path from 'path';
import { ManifestBuilder, actualSiblingOf } from '../builder';
import type { EnvLike } from '../ci';
import { entryLimits, type ComparisonLimitOptions } from '../limits';
import { readPngSize } from '../png';
import type {
  Manifest,
  ManifestBrowser,
  ManifestCi,
  ManifestPlatform,
  ManifestStatus,
  ManifestTool,
} from '../types';

/**
 * The subset of Playwright's JSON reporter output (`--reporter=json`) the
 * converter reads. Paths in the report are POSIX and absolute.
 */
export type PlaywrightJsonReport = {
  config?: {
    rootDir?: string;
    version?: string;
    projects?: PlaywrightProject[];
  };
  suites?: PlaywrightSuite[];
};

export type PlaywrightProject = {
  id?: string;
  name?: string;
  testDir?: string;
  outputDir?: string;
};

export type PlaywrightSuite = {
  title: string;
  file: string;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
};

export type PlaywrightSpec = {
  title: string;
  file: string;
  tests?: PlaywrightTest[];
};

export type PlaywrightTest = {
  projectId?: string;
  projectName?: string;
  results?: PlaywrightResult[];
};

export type PlaywrightResult = {
  status?: string;
  retry?: number;
  startTime?: string;
  error?: { message?: string };
  errors?: { message?: string }[];
  attachments?: PlaywrightAttachment[];
};

export type PlaywrightAttachment = {
  name: string;
  contentType?: string;
  path?: string;
};

export type FromPlaywrightReportOptions = ComparisonLimitOptions & {
  /** Defaults to `config.rootDir` of the report. */
  projectRoot?: string;
  /**
   * `snapshotPathTemplate` of the Playwright config, when changed from the
   * default `{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{-snapshotSuffix}{ext}`.
   * Needed to locate the baseline files, which the report does not mention.
   */
  snapshotPathTemplate?: string;
  /** `snapshotDir` of the Playwright config; defaults to each project's `testDir`, like Playwright. */
  snapshotDir?: string;
  /** The OS the tests ran on (`{snapshotSuffix}` / `{platform}` of the template); defaults to this machine's. */
  platform?: string;
  /** Browser per Playwright project name, for the entries' `platform.browser`; defaults to the project name. */
  browsers?: Record<string, ManifestBrowser>;
  /** Run-level `platform`; defaults to this machine's. */
  hostPlatform?: ManifestPlatform;
  /** `null` for "not on CI"; when absent, detected from `env`. */
  ci?: ManifestCi | null;
  env?: EnvLike;
  /** Recorded as the manifest's `tool`; defaults to this library. */
  tool?: ManifestTool;
  options?: Record<string, unknown>;
  createdAt?: string;
};

export const DEFAULT_SNAPSHOT_PATH_TEMPLATE =
  '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{-snapshotSuffix}{ext}';

type AttachmentKind = 'expected' | 'actual' | 'diff' | 'previous';
type ImageGroup = Partial<Record<AttachmentKind, string>> & {
  /** Snapshot name without suffix and extension, `home` for `home-actual.png`. */
  arg: string;
  ext: string;
};

const DIFF_RATIO_REGEX =
  /(\d+) pixels \(ratio ([\d.]+) of all image pixels\) are different/;
/** The error of a comparison without a baseline; with `, writing actual` when the baseline was written. */
const MISSING_SNAPSHOT_REGEX =
  /A snapshot doesn't exist at (.+?)(, writing actual)?\.(?:\n|$)/g;
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

// mirrors Playwright's `sanitizeForFilePath`: everything but alphanumerics, `_` and `.` becomes `-`
const sanitizeForFilePath = (s: string) =>
  // eslint-disable-next-line no-control-regex
  s.replace(/[\x00-\x2C\x2E-\x2F\x3A-\x40\x5B-\x60\x7B-\x7F]+/g, '-');

const posix = (p: string) => p.replace(/\\/g, '/');

/** Groups a result's image attachments by snapshot: `home-actual.png`, `home-expected.png`, `home-diff.png` -> `home`. */
const groupAttachments = (attachments: PlaywrightAttachment[]) => {
  const groups = new Map<string, ImageGroup>();
  for (const attachment of attachments) {
    if (!attachment.path) continue;
    const ext = path.posix.extname(attachment.name);
    const stem = attachment.name.slice(0, ext ? -ext.length : undefined);
    const match = stem.match(/^(.*)-(expected|actual|diff|previous)$/);
    if (!match) continue;
    const [, arg, kind] = match;
    const group = groups.get(arg) ?? { arg, ext };
    group[kind as AttachmentKind] = attachment.path;
    groups.set(arg, group);
  }
  return [...groups.values()];
};

const resolveSnapshotPath = (
  template: string,
  tokens: {
    testDir: string;
    snapshotDir: string;
    snapshotSuffix: string;
    testFile: string;
    projectName: string;
    testName: string;
    arg: string;
    ext: string;
  },
) => {
  const relativeTestFile = path.posix.relative(tokens.testDir, tokens.testFile);
  const parsed = path.posix.parse(relativeTestFile);
  const projectSegment = sanitizeForFilePath(tokens.projectName);
  const resolved = template
    .replace(/\{(.)?testDir\}/g, `$1${tokens.testDir}`)
    .replace(/\{(.)?snapshotDir\}/g, `$1${tokens.snapshotDir}`)
    .replace(/\{(.)?snapshotSuffix\}/g, (_, sep = '') =>
      tokens.snapshotSuffix ? `${sep}${tokens.snapshotSuffix}` : '',
    )
    .replace(/\{(.)?testFileDir\}/g, `$1${parsed.dir}`)
    .replace(/\{(.)?platform\}/g, `$1${tokens.snapshotSuffix}`)
    .replace(/\{(.)?projectName\}/g, (_, sep = '') =>
      projectSegment ? `${sep}${projectSegment}` : '',
    )
    .replace(/\{(.)?testName\}/g, `$1${tokens.testName}`)
    .replace(/\{(.)?testFileName\}/g, `$1${parsed.base}`)
    .replace(/\{(.)?testFilePath\}/g, `$1${relativeTestFile}`)
    .replace(/\{(.)?arg\}/g, `$1${tokens.arg}`)
    .replace(/\{(.)?ext\}/g, (_, sep = '') =>
      tokens.ext ? `${sep}${tokens.ext}` : '',
    );
  // an empty `{testFileDir}` leaves a double slash behind
  return path.posix.normalize(resolved);
};

// the JSON reporter lists the first error under `error` and all of them under `errors`
const errorMessages = (result: PlaywrightResult) => [
  ...new Set(
    [...(result.errors ?? []), ...(result.error ? [result.error] : [])]
      .map((e) => (e.message ?? '').replace(ANSI_REGEX, ''))
      .filter(Boolean),
  ),
];

/** The error message about one snapshot: the one naming it (`Snapshot: home.png`, or its actual or baseline file), else the only one there is. */
const messageFor = (
  messages: string[],
  group: ImageGroup,
  baselinePath: string,
) => {
  const names = [group.actual, baselinePath]
    .filter((p): p is string => !!p)
    .map((p) => path.posix.basename(p));
  const own = messages.find(
    (m) =>
      m.includes(`Snapshot: ${group.arg}${group.ext}`) ||
      names.some((name) => m.includes(name)),
  );
  return own ?? (messages.length === 1 ? messages[0] : undefined) ?? '';
};

/**
 * A freshly written baseline is attached as `-expected` too, so the message
 * decides first: `, writing actual` means the baseline did not exist.
 */
const statusOf = (group: ImageGroup, message: string): ManifestStatus => {
  if (/writing actual/i.test(message)) return 'created';
  return group.expected ? 'failed' : 'missing-baseline';
};

/**
 * Converts Playwright's JSON report (`npx playwright test --reporter=json`)
 * into a manifest, for teams using `toHaveScreenshot` without a visual
 * regression package. Only comparisons that left files behind can be
 * recovered (`failed`, `missing-baseline`, `created`): a passing
 * `toHaveScreenshot` leaves no trace in the report. Of a retried test only
 * the last attempt counts. Baseline paths are computed from the snapshot path
 * template, as the report only lists the copies in the output directory.
 */
export const fromPlaywrightReport = (
  report: PlaywrightJsonReport,
  opts: FromPlaywrightReportOptions = {},
): Manifest => {
  if (!report || !Array.isArray(report.suites)) {
    throw new TypeError(
      'Not a Playwright JSON report: expected an object with a `suites` array',
    );
  }
  // test files in the report are relative to Playwright's rootDir; the
  // manifest's paths are relative to the (possibly different) projectRoot
  const rootDir = posix(
    report.config?.rootDir ?? opts.projectRoot ?? process.cwd(),
  );
  const projectRoot = opts.projectRoot ?? rootDir;
  const projects = report.config?.projects ?? [];
  const projectByName = new Map(projects.map((p) => [p.name ?? '', p]));
  const template = opts.snapshotPathTemplate ?? DEFAULT_SNAPSHOT_PATH_TEMPLATE;
  const snapshotSuffix = opts.platform ?? process.platform;

  const builder = new ManifestBuilder({
    projectRoot,
    runner: {
      name: 'playwright',
      version: report.config?.version,
      mode: 'run',
      projects: projects.map((p) => p.name ?? ''),
    },
    tool: opts.tool,
    options: opts.options,
    platform: opts.hostPlatform,
    ci: opts.ci,
    env: opts.env,
    createdAt: opts.createdAt,
  });

  const visitSpec = (spec: PlaywrightSpec, describes: string[]) => {
    const testFileAbs = path.posix.resolve(rootDir, posix(spec.file));
    const titlePath = [...describes, spec.title];
    for (const test of spec.tests ?? []) {
      const projectName = test.projectName ?? '';
      const project = projectByName.get(projectName);
      const testDir = posix(project?.testDir ?? rootDir);
      const snapshotDir = opts.snapshotDir
        ? path.posix.resolve(rootDir, posix(opts.snapshotDir))
        : testDir;
      const result = test.results?.at(-1);
      if (!result) continue;
      const messages = errorMessages(result);
      const browser =
        opts.browsers?.[projectName] ??
        (projectName ? { name: projectName } : undefined);
      // baselines the attachments account for: by the configured template and,
      // in case the template is not the one the run used, by the default naming
      const recorded = new Set<string>();
      for (const group of groupAttachments(result.attachments ?? [])) {
        if (!group.actual) continue;
        const tokens = {
          testDir,
          snapshotDir,
          snapshotSuffix,
          testFile: testFileAbs,
          projectName,
          testName: sanitizeForFilePath(titlePath.join(' ')),
          arg: group.arg,
          ext: group.ext,
        };
        const baselinePath = resolveSnapshotPath(template, tokens);
        const message = messageFor(messages, group, baselinePath);
        const status = statusOf(group, message);
        recorded.add(baselinePath);
        recorded.add(
          path.posix.basename(
            resolveSnapshotPath(DEFAULT_SNAPSHOT_PATH_TEMPLATE, tokens),
          ),
        );
        const ratio = message.match(DIFF_RATIO_REGEX);
        const baselineSize = fs.existsSync(baselinePath)
          ? readPngSize(baselinePath)
          : readPngSize(group.expected ?? '');
        const actualSize = readPngSize(group.actual);
        builder.record({
          actualPath: group.actual,
          baselinePath,
          diffPath: group.diff ?? null,
          name: path.posix.basename(baselinePath, group.ext),
          testFile: testFileAbs,
          titlePath,
          retry: result.retry ?? 0,
          status,
          diffRatio: ratio ? Number(ratio[2]) : 0,
          // the report does not carry the limits: `maxDiffPixelRatio` and
          // `maxDiffPixels` of your config, and the pixelmatch `threshold`
          ...entryLimits(
            {
              maxDiffRatio: opts.maxDiffRatio,
              maxDiffPixels: opts.maxDiffPixels,
              colorThreshold: opts.colorThreshold,
              colorMetric: opts.colorMetric ?? 'yiq',
            },
            actualSize ?? baselineSize,
          ),
          baselineWritten: status === 'created',
          message: message.split('\n')[0]?.trim() ?? '',
          baselineSize,
          actualSize,
          platform: browser && { osPlatform: snapshotSuffix, browser },
          recordedAt: result.startTime,
        });
      }
      // with `updateSnapshots: 'none'` a missing baseline attaches nothing: only
      // the error names the file that should have been there
      for (const message of messages) {
        for (const match of message.matchAll(MISSING_SNAPSHOT_REGEX)) {
          const baselinePath = path.posix.normalize(posix(match[1]));
          if (
            match[2] ||
            recorded.has(baselinePath) ||
            recorded.has(path.posix.basename(baselinePath))
          )
            continue;
          recorded.add(baselinePath);
          const ext = path.posix.extname(baselinePath);
          builder.record({
            actualPath: actualSiblingOf(baselinePath), // never written: recorded as `null`
            baselinePath,
            diffPath: null,
            name: path.posix.basename(baselinePath, ext),
            testFile: testFileAbs,
            titlePath,
            retry: result.retry ?? 0,
            status: 'missing-baseline',
            diffRatio: 0,
            ...entryLimits(
              {
                maxDiffRatio: opts.maxDiffRatio,
                maxDiffPixels: opts.maxDiffPixels,
                colorThreshold: opts.colorThreshold,
                colorMetric: opts.colorMetric ?? 'yiq',
              },
              undefined,
            ),
            message: message.split('\n')[0]?.trim() ?? '',
            platform: browser && { osPlatform: snapshotSuffix, browser },
            recordedAt: result.startTime,
          });
        }
      }
    }
  };

  const visitSuite = (suite: PlaywrightSuite, describes: string[]) => {
    for (const spec of suite.specs ?? []) visitSpec(spec, describes);
    for (const child of suite.suites ?? []) {
      visitSuite(child, [...describes, child.title]);
    }
  };
  for (const fileSuite of report.suites) visitSuite(fileSuite, []);

  return builder.toJSON();
};
