import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { ManifestBuilder, type ManifestHeaderInput } from '../builder';
import { MANIFEST_STATUSES } from '../constants';
import { entryLimits, type ComparisonLimitOptions } from '../limits';
import { entryKey } from '../merge';
import {
  isSafeRelativePath,
  resolveInProject,
  toProjectRelative,
} from '../paths';
import { readPngSize } from '../png';
import type {
  Manifest,
  ManifestEntry,
  ManifestRunner,
  ManifestStatus,
} from '../types';
import { mimeOf } from './ctrf';

/**
 * Allure results (https://allurereport.org): the folder of files a test
 * framework's Allure adapter writes and `allure generate` turns into a report.
 * One `<uuid>-result.json` per test, with its attachments as files next to it.
 * These are the fields the converters read and write.
 */
export type AllureStatus =
  'passed' | 'failed' | 'broken' | 'skipped' | 'unknown';

export type AllureLabel = { name: string; value: string };

export type AllureParameter = {
  name: string;
  value: string;
  /** Left out of the test's identity across runs. */
  excluded?: boolean;
  mode?: 'default' | 'masked' | 'hidden';
};

export type AllureAttachment = {
  name: string;
  /** File name inside the results folder. */
  source: string;
  type: string;
};

export type AllureStep = {
  name?: string;
  status?: AllureStatus;
  attachments?: AllureAttachment[];
  steps?: AllureStep[];
};

export type AllureResult = AllureStep & {
  uuid: string;
  name: string;
  /** Same for every run of one test with one set of parameters. */
  historyId?: string;
  testCaseId?: string;
  fullName?: string;
  titlePath?: string[];
  statusDetails?: { message?: string; trace?: string };
  stage?: string;
  labels?: AllureLabel[];
  parameters?: AllureParameter[];
  links?: unknown[];
  /** Milliseconds since the Unix epoch. */
  start?: number;
  stop?: number;
};

/**
 * The content of an image diff attachment: each image as a `data:` URL. Allure
 * shows it as its side-by-side and overlay comparison.
 */
export type AllureImageDiff = {
  expected?: string;
  actual?: string;
  diff?: string;
  name?: string;
};

/** One file of an Allure results folder. */
export type AllureResultsFile = { name: string; content: string | Buffer };

/** Media type of an image diff attachment. */
export const ALLURE_IMAGE_DIFF_TYPE = 'application/vnd.allure.image.diff';
/** Label that keeps the manifest status, which Allure's statuses cannot hold. */
export const ALLURE_STATUS_LABEL = 'visualRegression.status';

/**
 * `missing-baseline` needs a human and must not turn a report green, so it is
 * `failed`; `created`, `updated` and `approved` mean the run got what it asked
 * for, so they are `passed`. The manifest status is kept in a label.
 */
export const toAllureStatus = (status: ManifestStatus): AllureStatus =>
  status === 'failed' || status === 'missing-baseline' ? 'failed' : 'passed';

export type ToAllureResultsOptions = {
  /** Where the manifest's image paths resolve; defaults to the manifest's `projectRoot`. */
  projectRoot?: string;
  /**
   * Called for a file the manifest lists that cannot be read, is not an image
   * where one is due, or lies outside the project: it is left out of the results. Defaults to
   * `process.emitWarning`.
   */
  onWarning?: (message: string) => void;
};

const compact = <T extends object>(obj: T): T =>
  Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as T;

const sha256 = (text: string) =>
  createHash('sha256').update(text).digest('hex');

const uuidFrom = (hash: string) =>
  [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join('-');

const epoch = (iso: string) => {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : ms;
};

const IMAGE_ROLES = ['baseline', 'actual', 'diff'] as const;

const toAllureParameters = (entry: ManifestEntry): AllureParameter[] => {
  const { comparison, platform, viewport, variant } = entry;
  const browser = platform?.browser;
  // only the variant tells two runs of one screenshot apart; the rest describes this run
  const described: [string, string | number | undefined][] = [
    [
      'browser',
      browser && [browser.name, browser.version].filter(Boolean).join(' '),
    ],
    ['os', platform?.osPlatform || undefined],
    ['viewport', viewport && `${viewport.width}x${viewport.height}`],
    ['diffRatio', comparison.diffRatio],
    ['maxDiffRatio', comparison.maxDiffRatio],
    ['colorThreshold', comparison.colorThreshold],
    ['colorMetric', comparison.colorMetric],
  ];
  return [
    ...(variant ? [{ name: 'variant', value: variant }] : []),
    ...described
      .filter(([, value]) => value !== undefined)
      .map(([name, value]) => ({ name, value: String(value), excluded: true })),
  ];
};

const toAllureLabels = (
  entry: ManifestEntry,
  manifest: Manifest,
): AllureLabel[] => {
  // the screenshot is the test here, so its test file and titles are the suites above it
  const suites = [entry.test.filePath, ...entry.test.titlePath].filter(Boolean);
  const labels: [string, string | undefined][] = [
    ['framework', manifest.runner.name],
    ['parentSuite', suites[0]],
    ['suite', suites[1]],
    ['subSuite', suites.slice(2).join(' > ') || undefined],
    ['tag', 'visual'],
    [ALLURE_STATUS_LABEL, entry.status],
  ];
  return labels
    .filter((label): label is [string, string] => label[1] !== undefined)
    .map(([name, value]) => ({ name, value }));
};

const isInside = (root: string, file: string) => {
  const relative = path.relative(root, file);
  return (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
};

/** Reads a file of the project; throws when it is not a regular file or a link leads out of the project. */
const readInProject = (root: string, relative: string) => {
  const file = fs.realpathSync(path.join(root, relative));
  if (!isInside(fs.realpathSync(root), file)) {
    throw new Error('it is a link to a file outside the project');
  }
  if (!fs.statSync(file).isFile()) throw new Error('it is not a file');
  return fs.readFileSync(file);
};

/** The files of one entry after another, so a large run is never in memory as a whole. */
function* allureResultsOf(
  manifest: Manifest,
  opts: ToAllureResultsOptions,
): Generator<AllureResultsFile> {
  const root = opts.projectRoot ?? manifest.projectRoot;
  const warn =
    opts.onWarning ?? ((message: string) => process.emitWarning(message));
  const seen = new Set<string>();

  for (const entry of manifest.entries) {
    const read = (relative: string | null, what: string, image = false) => {
      if (relative === null) return undefined;
      const leftOut = (why: string) => {
        warn(
          `"${entry.name}": the ${what} "${relative}" ${why} and was left out`,
        );
        return undefined;
      };
      if (!isSafeRelativePath(relative)) {
        return leftOut('is not a path inside the project');
      }
      if (image && !mimeOf(relative).startsWith('image/')) {
        return leftOut('is not an image');
      }
      try {
        return readInProject(root, relative);
      } catch (error) {
        return leftOut(`could not be read (${(error as Error).message})`);
      }
    };

    const key = entryKey(entry);
    let identity = `${key}\u0000${entry.test.retry}`;
    // two entries of one identity would write one file; keep both
    for (let n = 2; seen.has(identity); n++) {
      identity = `${key}\u0000${entry.test.retry}\u0000${n}`;
    }
    seen.add(identity);
    const uuid = uuidFrom(sha256(identity));

    const files: AllureResultsFile[] = [];
    const attachments: AllureAttachment[] = [];
    const attach = (
      name: string,
      suffix: string,
      type: string,
      content: string | Buffer,
    ) => {
      const source = `${uuid}-${suffix}`;
      files.push({ name: source, content });
      attachments.push({ name, source, type });
    };

    const images = IMAGE_ROLES.map((role) => {
      const relative = entry.images[role].path;
      // an entry without a baseline names where it would be: nothing to read there
      if (role === 'baseline' && entry.status === 'missing-baseline') {
        return undefined;
      }
      const content = read(relative, `${role} image`, true);
      return content && relative !== null
        ? {
            role,
            content,
            type: mimeOf(relative),
            ext: path.posix.extname(relative),
          }
        : undefined;
    });
    const [baseline, actual, diff] = images;
    const dataUrl = (image: typeof baseline) =>
      image && `data:${image.type};base64,${image.content.toString('base64')}`;
    let imageDiff: string | undefined;
    if (actual) {
      // an actual image alone is how Allure adapters report a missing baseline
      const payload: AllureImageDiff = compact({
        expected: dataUrl(baseline),
        actual: dataUrl(actual),
        diff: dataUrl(diff),
        name: entry.name,
      });
      try {
        imageDiff = JSON.stringify(payload);
      } catch (error) {
        warn(
          `"${entry.name}": the images are too large for one image diff and were left out (${(error as Error).message})`,
        );
      }
    }
    if (imageDiff !== undefined) {
      attach(
        entry.name,
        'attachment.imagediff',
        ALLURE_IMAGE_DIFF_TYPE,
        imageDiff,
      );
    } else if (!actual) {
      for (const image of images) {
        if (!image) continue;
        attach(
          image.role,
          `${image.role}-attachment${image.ext}`,
          image.type,
          image.content,
        );
      }
    }
    (entry.attachments ?? []).forEach((attachment, index) => {
      const content = read(attachment.path, `attachment "${attachment.name}"`);
      if (!content) return;
      attach(
        attachment.name,
        `${index}-attachment${path.posix.extname(attachment.path)}`,
        attachment.contentType,
        content,
      );
    });

    const stop = epoch(entry.recordedAt);
    const result: AllureResult = compact({
      uuid,
      historyId: sha256(key).slice(0, 32),
      testCaseId: sha256(
        [entry.test.filePath, ...entry.test.titlePath, entry.name].join(
          '\u0000',
        ),
      ).slice(0, 32),
      name: entry.name,
      fullName: [
        entry.test.filePath,
        [...entry.test.titlePath, entry.name].join(' '),
      ]
        .filter(Boolean)
        .join('#'),
      titlePath: [entry.test.filePath, ...entry.test.titlePath].filter(Boolean),
      status: toAllureStatus(entry.status),
      statusDetails: entry.message ? { message: entry.message } : {},
      stage: 'finished',
      steps: [],
      attachments,
      parameters: toAllureParameters(entry),
      labels: toAllureLabels(entry, manifest),
      links: [],
      start:
        stop !== undefined && entry.duration !== undefined
          ? stop - entry.duration
          : stop,
      stop,
    });
    yield* files;
    yield {
      name: `${uuid}-result.json`,
      content: JSON.stringify(result, null, 2),
    };
  }
}

/**
 * A manifest as the files of an Allure results folder, in memory: one test per
 * entry, named after the screenshot. An entry with an actual image gets
 * Allure's image diff attachment (the images are embedded, so the folder
 * stands on its own; a missing baseline is a diff with the actual image
 * alone); an entry without one gets its baseline as a plain attachment. The
 * diff ratio, the limits, the browser and the viewport become parameters, the
 * manifest status a `visualRegression.status` label.
 *
 * The manifest says which files are read: its `projectRoot` and its paths.
 * Only regular files inside the project root are read, and only images for
 * the three image roles, but export a manifest only when you trust where it
 * comes from. Every image is held in memory at once; `writeAllureResults`
 * writes a run of any size entry by entry.
 */
export const toAllureResults = (
  manifest: Manifest,
  opts: ToAllureResultsOptions = {},
): AllureResultsFile[] => [...allureResultsOf(manifest, opts)];

/**
 * Writes a manifest as Allure results (see `toAllureResults`) into `dir`,
 * created when needed, and returns the paths of the files it wrote. The files
 * are added to whatever results are already there, and the same entry always
 * gets the same file names: exporting a run again overwrites its own files,
 * but the files of entries that are gone stay until you empty the folder.
 */
export const writeAllureResults = (
  dir: string,
  manifest: Manifest,
  opts: ToAllureResultsOptions = {},
): string[] => {
  fs.mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  for (const { name, content } of allureResultsOf(manifest, opts)) {
    const file = path.join(dir, name);
    fs.writeFileSync(file, content);
    written.push(file);
  }
  return written;
};

export type FromAllureResultsOptions = Omit<ManifestHeaderInput, 'runner'> &
  ComparisonLimitOptions & {
    /** Recorded as `runner`; defaults to the `framework` label of the results, else `{ name: 'allure' }`. */
    runner?: ManifestRunner;
    /** The Allure results folder, relative to `projectRoot`; defaults to `allure-results`. */
    resultsDir?: string;
    /**
     * Where the images are written, relative to `projectRoot`: the results
     * hold them inside JSON files, a manifest needs image files. Defaults to
     * `visual-regression-images` inside `resultsDir`.
     */
    imagesDir?: string;
    /**
     * Called for a result or an image diff that cannot be read: it is left
     * out. Defaults to `process.emitWarning`.
     */
    onWarning?: (message: string) => void;
  };

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
};

/** The bytes and file extension of an image `data:` URL; `undefined` for anything else. */
const decodeImage = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const match = /^data:([^;,]*)((?:;[^;,]*)*),/.exec(value);
  const ext = match && EXT_BY_MIME[match[1].toLowerCase()];
  if (!match || !ext) return undefined;
  const body = value.slice(match[0].length);
  return {
    ext,
    content: /;base64$/i.test(match[2])
      ? Buffer.from(body, 'base64')
      : // percent-encoded bytes, not text
        Buffer.from(
          body.replace(/%([0-9a-f]{2})/gi, (_, hex: string) =>
            String.fromCharCode(parseInt(hex, 16)),
          ),
          'latin1',
        ),
  };
};

const isManifestStatus = (value: unknown): value is ManifestStatus =>
  typeof value === 'string' &&
  (MANIFEST_STATUSES as readonly string[]).includes(value);

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

/** The parameters that carry a comparison's numbers; they are not part of what a test is. */
const COMPARISON_PARAMETERS: readonly string[] = ['diffRatio', 'maxDiffRatio'];

/** What the converter reads of a result, with every field of the type it expects. */
type ReadResult = {
  id: string;
  uuid?: string;
  name: string;
  status?: string;
  historyId?: string;
  fullName?: string;
  message: string;
  labels: AllureLabel[];
  parameters: AllureParameter[];
  imageDiffs: AllureAttachment[];
  start?: number;
  stop?: number;
};

const text = (value: unknown) =>
  typeof value === 'string' ? value : undefined;

const objects = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === 'object' && !Array.isArray(item),
      )
    : [];

/** A time a `Date` can hold, else `undefined`. */
const time = (value: unknown) =>
  typeof value === 'number' && Math.abs(value) <= 8.64e15 ? value : undefined;

const imageDiffsOf = (step: Record<string, unknown>): AllureAttachment[] => [
  ...objects(step.attachments).flatMap((attachment) => {
    const source = text(attachment.source);
    return attachment.type === ALLURE_IMAGE_DIFF_TYPE && source
      ? [
          {
            name: text(attachment.name) ?? '',
            source,
            type: ALLURE_IMAGE_DIFF_TYPE,
          },
        ]
      : [];
  }),
  ...objects(step.steps).flatMap(imageDiffsOf),
];

/** A result file's content as a `ReadResult`; `undefined` when it is not a result. */
const readResult = (json: unknown, file: string): ReadResult | undefined => {
  const [result] = objects([json]);
  const name = text(result?.name);
  if (!result || name === undefined) return undefined;
  const named = (list: unknown) =>
    objects(list).flatMap((item) => {
      const itemName = text(item.name);
      const value =
        typeof item.value === 'number' || typeof item.value === 'boolean'
          ? String(item.value)
          : text(item.value);
      return itemName !== undefined && value !== undefined
        ? [{ ...item, name: itemName, value }]
        : [];
    });
  const uuid = text(result.uuid);
  const historyId = text(result.historyId);
  const fullName = text(result.fullName);
  const [statusDetails] = objects([result.statusDetails]);
  return {
    // what the attempts of one test share; a result without it is a test of its own
    id: historyId ?? fullName ?? uuid ?? file,
    uuid,
    name,
    status: text(result.status),
    historyId,
    fullName,
    message: (text(statusDetails?.message) ?? '').replace(ANSI_REGEX, ''),
    labels: named(result.labels),
    parameters: named(result.parameters) as AllureParameter[],
    imageDiffs: imageDiffsOf(result),
    start: time(result.start),
    stop: time(result.stop),
  };
};

const labelOf = (result: ReadResult, name: string) =>
  result.labels.find((label) => label.name === name)?.value;

const parameterOf = (result: ReadResult, name: string) =>
  result.parameters.find((parameter) => parameter.name === name)?.value;

const ratioOf = (result: ReadResult, name: string) => {
  const value = parameterOf(result, name);
  if (value === undefined || value.trim() === '') return undefined;
  const ratio = Number(value);
  return ratio >= 0 && ratio <= 1 ? ratio : undefined;
};

/** A `variant` parameter, else the parameters that tell runs of one test apart (a project, a browser). */
const variantOf = (result: ReadResult) =>
  parameterOf(result, 'variant') ??
  (result.parameters
    .filter(
      ({ name, excluded, mode }) =>
        !excluded &&
        (mode ?? 'default') === 'default' &&
        !COMPARISON_PARAMETERS.includes(name),
    )
    .map(({ value }) => value)
    .join('-') ||
    undefined);

const readJson = (file: string): unknown => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
};

/** Writes an image where nothing but a regular file may be: a link someone left there is replaced, never followed. */
const writeImage = (file: string, content: Buffer) => {
  const existing = fs.lstatSync(file, { throwIfNoEntry: false });
  if (existing?.isFile()) {
    if (fs.readFileSync(file).equals(content)) return;
  } else if (existing) {
    fs.rmSync(file, { recursive: true, force: true });
  }
  fs.writeFileSync(file, content);
};

/**
 * Converts an Allure results folder into a manifest: one entry per image diff
 * attachment (`application/vnd.allure.image.diff`), whatever framework and
 * language wrote the results. The images sit inside those attachments, so
 * this converter, unlike the others, writes files: the images go into
 * `imagesDir`, and the manifest's baseline is that copy, not the file your
 * tool compares against.
 *
 * A diff without an expected image is `missing-baseline`; any other is
 * `failed`, or `passed` when the test passed; a `visualRegression.status`
 * label with a manifest status wins. Only the last attempt of a retried test
 * is converted. Allure records no diff ratio: it is read from a `diffRatio`
 * parameter when there is one, the limits from `maxDiffRatio` or the options.
 */
export const fromAllureResults = ({
  resultsDir = 'allure-results',
  imagesDir,
  maxDiffRatio,
  maxDiffPixels,
  colorThreshold,
  colorMetric,
  runner,
  onWarning,
  ...header
}: FromAllureResultsOptions): Manifest => {
  const warn = onWarning ?? ((message: string) => process.emitWarning(message));
  const results = resolveInProject(header.projectRoot, resultsDir);
  const images = resolveInProject(
    header.projectRoot,
    imagesDir ?? path.join(results, 'visual-regression-images'),
  );
  const outside = () =>
    new TypeError(
      `The images folder ${images} is outside the project root ${header.projectRoot}; a manifest only holds paths inside it. Pass \`imagesDir\``,
    );
  const imagesInProject = toProjectRelative(header.projectRoot, images);
  if (imagesInProject !== '' && !isSafeRelativePath(imagesInProject)) {
    throw outside();
  }
  let names: string[];
  try {
    names = fs.readdirSync(results);
  } catch (error) {
    throw new TypeError(
      `Cannot read the Allure results folder ${results}: ${(error as Error).message}`,
      { cause: error },
    );
  }
  let imagesReady = false;
  const ensureImagesDir = () => {
    if (imagesReady) return;
    fs.mkdirSync(images, { recursive: true });
    // the folder may have been put there as a link: it must still be in the project
    if (
      !isInside(fs.realpathSync(header.projectRoot), fs.realpathSync(images))
    ) {
      throw outside();
    }
    imagesReady = true;
  };

  // every attempt of a retried test is a result of its own, with the same history id
  const attempts = new Map<string, ReadResult[]>();
  for (const name of names.filter((n) => n.endsWith('-result.json')).sort()) {
    const result = readResult(readJson(path.join(results, name)), name);
    if (!result) {
      warn(`${name} is not an Allure result and was left out`);
      continue;
    }
    attempts.set(result.id, [...(attempts.get(result.id) ?? []), result]);
  }
  const last = [...attempts.values()]
    .map((runs) => {
      const sorted = [...runs].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
      return { result: sorted[sorted.length - 1], retry: sorted.length - 1 };
    })
    // the builder drops the entries a test left in an earlier attempt, which it
    // tells by the titles alone; recording the retried ones first keeps a test
    // that ran once under another parameter (a second browser) from being dropped
    .sort((a, b) => b.retry - a.retry);

  const builder = new ManifestBuilder({
    ...header,
    runner: runner ?? {
      name:
        last.map(({ result }) => labelOf(result, 'framework')).find(Boolean) ??
        'allure',
    },
  });

  for (const { result, retry } of last) {
    const labelStatus = labelOf(result, ALLURE_STATUS_LABEL);
    for (const attachment of result.imageDiffs) {
      // a results folder may come from anywhere: never follow a source out of it
      if (path.basename(attachment.source) !== attachment.source) {
        warn(
          `"${result.name}": the attachment source "${attachment.source}" is not a file name and was left out`,
        );
        continue;
      }
      const [payload] = objects([
        readJson(path.join(results, attachment.source)),
      ]);
      if (!payload) {
        warn(
          `"${result.name}": the image diff ${attachment.source} could not be read and was left out`,
        );
        continue;
      }
      const expected = decodeImage(payload.expected);
      const actual = decodeImage(payload.actual);
      const diff = decodeImage(payload.diff);
      // some adapters attach an empty diff next to the real one
      if (!expected && !actual) continue;

      const status = isManifestStatus(labelStatus)
        ? labelStatus
        : !expected
          ? 'missing-baseline'
          : result.status === 'passed'
            ? 'passed'
            : 'failed';
      // the whole source name: two attachments may differ in their extension only
      const fileOf = (role: string, image: typeof expected) =>
        path.join(
          images,
          `${attachment.source}-${role}${image?.ext ?? '.png'}`,
        );
      const files = {
        expected: fileOf('expected', expected),
        actual: fileOf('actual', actual),
        diff: fileOf('diff', diff),
      };
      ensureImagesDir();
      if (expected) writeImage(files.expected, expected.content);
      // a passed entry lists no actual and no diff image: none to leave behind
      if (status !== 'passed') {
        if (actual) writeImage(files.actual, actual.content);
        if (diff) writeImage(files.diff, diff.content);
      }

      const baselineSize = readPngSize(files.expected);
      const actualSize = readPngSize(files.actual);
      const stopped = result.stop ?? result.start;
      builder.record({
        actualPath: files.actual,
        baselinePath: files.expected,
        diffPath: diff ? files.diff : null,
        name: text(payload.name) || attachment.name || result.name,
        titlePath: [
          labelOf(result, 'parentSuite'),
          labelOf(result, 'suite'),
          labelOf(result, 'subSuite'),
          result.name,
        ].filter((title): title is string => !!title),
        retry,
        status,
        diffRatio: ratioOf(result, 'diffRatio'),
        ...entryLimits(
          {
            maxDiffRatio: ratioOf(result, 'maxDiffRatio') ?? maxDiffRatio,
            maxDiffPixels,
            colorThreshold,
            colorMetric,
          },
          actualSize ?? baselineSize,
        ),
        message: result.message,
        baselineSize,
        actualSize,
        variant: variantOf(result),
        recordedAt:
          stopped === undefined ? undefined : new Date(stopped).toISOString(),
        duration:
          result.start !== undefined && result.stop !== undefined
            ? Math.max(0, result.stop - result.start)
            : undefined,
        extra: {
          allure: compact({
            uuid: result.uuid,
            historyId: result.historyId,
            fullName: result.fullName,
            status: result.status,
          }),
        },
      });
    }
  }
  return builder.toJSON();
};
