import path from 'path';
import { compareEntries, DEFAULT_TOOL, now } from '../builder';
import {
  EXTRA_NAMESPACE,
  MANIFEST_REPORT_FORMAT,
  MANIFEST_SPEC_VERSION,
  MANIFEST_STATUSES,
} from '../constants';
import { summarize } from '../summary';
import type {
  Manifest,
  ManifestAttachment,
  ManifestCi,
  ManifestEntry,
  ManifestExtra,
  ManifestPlatform,
  ManifestStatus,
  ManifestTool,
} from '../types';
import { inferStatus } from './triples';
import { toProjectRelative } from '../paths';

/**
 * CTRF (Common Test Report Format, https://ctrf.io): the subset of the schema
 * these converters read and write. Everything the manifest has and CTRF lacks
 * travels in the `visualRegression` namespace of the `extra` objects, so a
 * report made by `toCtrf` round-trips through `fromCtrf`, while any CTRF
 * consumer sees ordinary tests of `type: "visual"` with their images attached.
 */
export type CtrfTestStatus =
  'passed' | 'failed' | 'skipped' | 'pending' | 'other';

export type CtrfTool = { name: string; version?: string; extra?: object };

export type CtrfAttachment = {
  name: string;
  contentType: string;
  path: string;
  attachmentId?: string;
  extra?: object;
};

export type CtrfSummary = {
  tests: number;
  passed: number;
  failed: number;
  skipped: number;
  pending: number;
  other: number;
  /** Milliseconds since the Unix epoch. */
  start: number;
  stop: number;
  extra?: object;
};

export type CtrfEnvironment = {
  reportName?: string;
  appName?: string;
  appVersion?: string;
  buildId?: string;
  buildName?: string;
  buildNumber?: number;
  buildUrl?: string;
  repositoryName?: string;
  repositoryUrl?: string;
  commit?: string;
  branchName?: string;
  osPlatform?: string;
  osRelease?: string;
  osVersion?: string;
  testEnvironment?: string;
  shardId?: string;
  healthy?: boolean;
  extra?: object;
};

export type CtrfTest = {
  name: string;
  status: CtrfTestStatus;
  /** Milliseconds. */
  duration: number;
  rawStatus?: string;
  type?: string;
  /** Suite hierarchy, outermost first; never empty when present. */
  suite?: string[];
  filePath?: string;
  message?: string;
  /** Milliseconds since the Unix epoch. */
  start?: number;
  stop?: number;
  retries?: number;
  browser?: string;
  device?: string;
  attachments?: CtrfAttachment[];
  extra?: object;
};

export type CtrfResults = {
  tool: CtrfTool;
  summary: CtrfSummary;
  tests: CtrfTest[];
  environment?: CtrfEnvironment;
  extra?: object;
};

export type CtrfReport = {
  reportFormat: 'CTRF';
  specVersion: string;
  reportId?: string;
  runId?: string;
  timestamp?: string;
  generatedBy?: string;
  results: CtrfResults;
  extra?: object;
};

/** The CTRF specification version `toCtrf` writes. */
export const CTRF_SPEC_VERSION = '0.2.0';

/** Image roles, as recorded in `attachment.extra.visualRegression.role`. */
type ImageRole = 'baseline' | 'actual' | 'diff';
const IMAGE_ROLES: readonly ImageRole[] = ['baseline', 'actual', 'diff'];

/**
 * `missing-baseline` needs a human and must not turn a check green, so it is
 * `failed`; `created`, `updated` and `approved` mean the run got what it asked
 * for, so they are `passed`. The manifest status is kept in `rawStatus`.
 */
export const toCtrfStatus = (status: ManifestStatus): CtrfTestStatus =>
  status === 'failed' || status === 'missing-baseline' ? 'failed' : 'passed';

export type ToCtrfOptions = {
  /** `generatedBy` of the report; defaults to the manifest's `tool` as `name@version`. */
  generatedBy?: string;
  reportId?: string;
  /** CTRF `specVersion` to declare. */
  ctrfSpecVersion?: string;
};

const compact = <T extends object>(obj: T): T =>
  Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as T;

const epoch = (iso: string | undefined) => {
  const ms = iso === undefined ? NaN : Date.parse(iso);
  return Number.isNaN(ms) ? undefined : ms;
};

const integer = (value: string | undefined) =>
  value !== undefined && /^\d+$/.test(value) ? Number(value) : undefined;

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

const mimeOf = (file: string) =>
  MIME_BY_EXT[path.posix.extname(file).toLowerCase()] ??
  'application/octet-stream';

const withoutNamespace = (extra: object | undefined): ManifestExtra => {
  const rest: ManifestExtra = {};
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (key !== EXTRA_NAMESPACE && value && typeof value === 'object') {
      rest[key] = value as Record<string, unknown>;
    }
  }
  return rest;
};

const namespaced = (
  payload: object | undefined,
  rest: ManifestExtra | undefined,
) => {
  const extra = { ...(payload && { [EXTRA_NAMESPACE]: payload }), ...rest };
  return Object.keys(extra).length > 0 ? extra : undefined;
};

const imageAttachments = (entry: ManifestEntry): CtrfAttachment[] =>
  IMAGE_ROLES.flatMap((role) => {
    const image = entry.images[role];
    if (image.path === null) return [];
    const size =
      'width' in image ? { width: image.width, height: image.height } : {};
    return [
      {
        name: role,
        contentType: mimeOf(image.path),
        path: image.path,
        extra: namespaced(
          compact({
            role,
            ...size,
            sha256: entry.hashes?.[role],
          }),
          'extra' in image ? image.extra : undefined,
        ),
      },
    ];
  });

const toCtrfTest = (entry: ManifestEntry): CtrfTest => {
  const {
    name,
    message,
    duration,
    extra,
    attachments,
    test,
    platform,
    target,
    ...visual
  } = entry;
  const stop = epoch(entry.recordedAt);
  const browser = platform?.browser;
  return compact({
    name,
    status: toCtrfStatus(entry.status),
    rawStatus: entry.status,
    duration: duration ?? 0,
    type: 'visual',
    // the test is the immediate parent of its screenshots
    suite: test.titlePath.length > 0 ? test.titlePath : undefined,
    filePath: test.filePath || undefined,
    message: message || undefined,
    start:
      stop !== undefined && duration !== undefined
        ? stop - duration
        : undefined,
    stop,
    retries: test.retry,
    browser: browser
      ? [browser.name, browser.version].filter(Boolean).join(' ')
      : undefined,
    device: target?.device?.model,
    attachments: [
      ...imageAttachments(entry),
      ...(attachments ?? []).map((a) => ({
        ...a,
        contentType: a.contentType,
      })),
    ],
    extra: namespaced(compact({ ...visual, test, platform, target }), extra),
  });
};

const toCtrfEnvironment = (manifest: Manifest): CtrfEnvironment => {
  const { ci, platform } = manifest;
  const {
    repositoryName,
    repositoryUrl,
    commit,
    branchName,
    buildId,
    buildName,
    buildNumber,
    buildUrl,
    ...rest
  } = ci ?? {};
  const { osPlatform, osRelease, osVersion, ...platformRest } = platform;
  return compact({
    repositoryName,
    repositoryUrl,
    commit,
    branchName,
    buildId,
    buildName,
    buildNumber: integer(buildNumber),
    buildUrl,
    osPlatform,
    osRelease,
    osVersion,
    extra: namespaced(
      compact({
        // `ci` is present exactly when the manifest was written on CI
        ci: ci ? compact({ ...rest, buildNumber }) : undefined,
        platform: platformRest,
      }),
      undefined,
    ),
  });
};

/**
 * A manifest as a CTRF report: one test of `type: "visual"` per entry, named
 * after the screenshot, with the baseline, actual and diff images attached
 * and everything CTRF has no field for under `extra.visualRegression`.
 */
export const toCtrf = (
  manifest: Manifest,
  opts: ToCtrfOptions = {},
): CtrfReport => {
  const tests = manifest.entries.map(toCtrfTest);
  const counts = { passed: 0, failed: 0 };
  for (const test of tests) counts[test.status as 'passed' | 'failed'] += 1;
  const start = epoch(manifest.createdAt) ?? 0;
  const stop = epoch(manifest.updatedAt) ?? start;
  const { tool, summary, options, runner, upload, projectRoot, specVersion } =
    manifest;
  return compact({
    reportFormat: 'CTRF',
    specVersion: opts.ctrfSpecVersion ?? CTRF_SPEC_VERSION,
    reportId: opts.reportId,
    runId: manifest.ci?.buildId,
    timestamp: manifest.updatedAt,
    generatedBy:
      opts.generatedBy ??
      (tool.version ? `${tool.name}@${tool.version}` : tool.name),
    results: {
      tool: compact({
        name: tool.name,
        version: tool.version,
        extra: tool.extra,
      }),
      summary: {
        tests: tests.length,
        passed: counts.passed,
        failed: counts.failed,
        skipped: 0,
        pending: 0,
        other: 0,
        start,
        stop,
        extra: { [EXTRA_NAMESPACE]: summary },
      },
      tests,
      environment: toCtrfEnvironment(manifest),
      extra: namespaced(
        compact({ specVersion, projectRoot, options, runner, upload }),
        manifest.extra,
      ),
    },
  });
};

export type FromCtrfOptions = {
  /** Needed for reports that were not made by `toCtrf` (they carry no `projectRoot`). */
  projectRoot?: string;
  /**
   * Also convert tests that carry no `extra.visualRegression`, from their
   * image attachments: the role comes from `extra.visualRegression.role` or
   * from the attachment name (`baseline`/`expected`, `actual`, `diff`), the
   * status from `rawStatus` when it is a manifest status, else from which
   * images exist. Off by default: a plain CTRF report has no comparisons.
   */
  lenient?: boolean;
};

type VisualExtra = Partial<
  Omit<ManifestEntry, 'name' | 'message' | 'duration' | 'extra' | 'attachments'>
>;

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const visualOf = (extra: object | undefined) =>
  record(record(extra)?.[EXTRA_NAMESPACE]);

const isManifestStatus = (value: unknown): value is ManifestStatus =>
  typeof value === 'string' &&
  (MANIFEST_STATUSES as readonly string[]).includes(value);

const roleOf = (attachment: CtrfAttachment): ImageRole | undefined => {
  const explicit = visualOf(attachment.extra)?.role;
  if (explicit === 'baseline' || explicit === 'actual' || explicit === 'diff')
    return explicit;
  const stem = path.posix.basename(
    attachment.name,
    path.posix.extname(attachment.name),
  );
  const match = stem.match(/(?:^|[-_. ])(baseline|expected|actual|diff)$/i);
  const word = match?.[1].toLowerCase();
  if (word === 'expected') return 'baseline';
  return word === 'baseline' || word === 'actual' || word === 'diff'
    ? word
    : undefined;
};

const iso = (ms: number | undefined, fallback: string) =>
  ms === undefined ? fallback : new Date(ms).toISOString();

const fromCtrfTest = (
  test: CtrfTest,
  fallbackTime: string,
  lenient: boolean,
  projectRoot: string,
): ManifestEntry | undefined => {
  const visual = visualOf(test.extra) as VisualExtra | undefined;
  // reporters of other tools write absolute paths; a manifest's are project-relative
  const relative = (p: string) =>
    path.isAbsolute(p) ? toProjectRelative(projectRoot, p) : p;
  const byRole: Partial<Record<ImageRole, CtrfAttachment>> = {};
  const others: ManifestAttachment[] = [];
  for (const attachment of test.attachments ?? []) {
    const role = roleOf(attachment);
    if (role && !byRole[role]) byRole[role] = attachment;
    else {
      const extra = withoutNamespace(attachment.extra);
      others.push(
        compact({
          name: attachment.name,
          contentType: attachment.contentType,
          path: relative(attachment.path),
          attachmentId: attachment.attachmentId,
          extra: Object.keys(extra).length > 0 ? extra : undefined,
        }),
      );
    }
  }

  let images = visual?.images;
  if (!images) {
    if (!lenient || !byRole.baseline) return undefined;
    const dimensions = (attachment: CtrfAttachment | undefined) => {
      const v = visualOf(attachment?.extra);
      return compact({
        width: typeof v?.width === 'number' ? v.width : undefined,
        height: typeof v?.height === 'number' ? v.height : undefined,
      });
    };
    images = {
      baseline: {
        path: relative(byRole.baseline.path),
        ...dimensions(byRole.baseline),
      },
      actual: {
        path: byRole.actual ? relative(byRole.actual.path) : null,
        ...dimensions(byRole.actual),
      },
      diff: { path: byRole.diff ? relative(byRole.diff.path) : null },
    };
  }
  const status = isManifestStatus(visual?.status)
    ? visual.status
    : isManifestStatus(test.rawStatus)
      ? test.rawStatus
      : inferStatus({
          baseline: !!byRole.baseline,
          actual: images.actual.path !== null,
        });
  const hashes =
    visual?.hashes ??
    compact({
      baseline: visualOf(byRole.baseline?.extra)?.sha256 as string | undefined,
      actual: visualOf(byRole.actual?.extra)?.sha256 as string | undefined,
      diff: visualOf(byRole.diff?.extra)?.sha256 as string | undefined,
    });
  const extra = withoutNamespace(test.extra);
  return compact({
    name: test.name,
    test: visual?.test ?? {
      filePath: test.filePath ? relative(test.filePath) : '',
      titlePath: test.suite ?? [],
      retry: test.retries ?? 0,
    },
    status,
    comparison: visual?.comparison ?? { diffRatio: 0 },
    images,
    attachments: others.length > 0 ? others : undefined,
    baselineWritten: visual?.baselineWritten ?? false,
    recordedAt: visual?.recordedAt ?? iso(test.stop, fallbackTime),
    duration: test.duration > 0 ? test.duration : undefined,
    platform:
      visual?.platform ??
      (test.browser
        ? { osPlatform: '', browser: { name: test.browser } }
        : undefined),
    target: visual?.target,
    variant: visual?.variant,
    subject: visual?.subject,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
    viewport: visual?.viewport,
    options: visual?.options,
    renderer: visual?.renderer,
    hashes: Object.keys(hashes).length > 0 ? hashes : undefined,
    message: test.message ?? '',
  });
};

const fromCtrfCi = (
  environment: CtrfEnvironment | undefined,
): ManifestCi | null => {
  const extra = visualOf(environment?.extra);
  const ci = record(extra?.ci) as Partial<ManifestCi> | undefined;
  const fromEnvironment = compact({
    repositoryName: environment?.repositoryName,
    repositoryUrl: environment?.repositoryUrl,
    commit: environment?.commit,
    branchName: environment?.branchName,
    buildId: environment?.buildId,
    buildName: environment?.buildName,
    buildNumber:
      environment?.buildNumber === undefined
        ? undefined
        : String(environment.buildNumber),
    buildUrl: environment?.buildUrl,
  });
  if (!ci && Object.keys(fromEnvironment).length === 0) return null;
  return { provider: null, ...fromEnvironment, ...ci } as ManifestCi;
};

const fromCtrfPlatform = (
  environment: CtrfEnvironment | undefined,
): ManifestPlatform => {
  const extra = record(visualOf(environment?.extra)?.platform);
  return compact({
    osPlatform: environment?.osPlatform ?? '',
    arch: typeof extra?.arch === 'string' ? extra.arch : '',
    osRelease: environment?.osRelease,
    osVersion: environment?.osVersion,
  });
};

/**
 * A CTRF report as a manifest. Reports made by `toCtrf` convert back without
 * loss (apart from entry order, which is re-sorted, and the summary, which is
 * recomputed); other CTRF reports convert their visual tests when `lenient`
 * is set and a `projectRoot` is given.
 */
export const fromCtrf = (
  report: CtrfReport,
  opts: FromCtrfOptions = {},
): Manifest => {
  if (
    !report ||
    report.reportFormat !== 'CTRF' ||
    !report.results ||
    !Array.isArray(report.results.tests)
  ) {
    throw new TypeError(
      'Not a CTRF report: expected `reportFormat: "CTRF"` and a `results.tests` array',
    );
  }
  const { results } = report;
  const visual = visualOf(results.extra) ?? {};
  const projectRoot =
    (typeof visual.projectRoot === 'string' ? visual.projectRoot : undefined) ??
    opts.projectRoot;
  if (!projectRoot) {
    throw new TypeError(
      'The report carries no `extra.visualRegression.projectRoot`; pass `projectRoot`',
    );
  }
  const { start, stop } = results.summary ?? {};
  const updatedAt = iso(stop, report.timestamp ?? now());
  const createdAt = iso(start, updatedAt);
  const entries = results.tests
    .map((test) =>
      fromCtrfTest(test, updatedAt, opts.lenient ?? false, projectRoot),
    )
    .filter((entry): entry is ManifestEntry => entry !== undefined)
    .sort(compareEntries);
  const tool: ManifestTool = results.tool
    ? compact({
        name: results.tool.name,
        version: results.tool.version,
        extra: results.tool.extra as ManifestExtra | undefined,
      })
    : DEFAULT_TOOL;
  const extra = withoutNamespace(results.extra);
  return compact({
    reportFormat: MANIFEST_REPORT_FORMAT,
    specVersion: MANIFEST_SPEC_VERSION,
    createdAt,
    updatedAt,
    projectRoot,
    platform: fromCtrfPlatform(results.environment),
    ci: fromCtrfCi(results.environment),
    tool,
    options: record(visual.options) ?? {},
    runner: (record(visual.runner) as Manifest['runner'] | undefined) ?? {
      name: tool.name,
    },
    upload: visual.upload as Manifest['upload'] | undefined,
    summary: summarize(entries),
    entries,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  });
};
