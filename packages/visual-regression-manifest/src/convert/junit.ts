import { needsHuman } from '../constants';
import { isSafeRelativePath, projectDirInRepo, toRepoPath } from '../paths';
import type { Manifest, ManifestEntry } from '../types';

export type ToJUnitOptions = {
  /** `name` of the root `<testsuites>`; defaults to the manifest's `tool.name`. */
  name?: string;
  /**
   * How the image paths are written into `<system-out>` as
   * `[[ATTACHMENT|path]]` lines, the convention GitLab and the Jenkins JUnit
   * Attachments plugin read. `repository` (the default): relative to the
   * repository root, which GitLab expects (the project root when the manifest
   * does not know the repository). `absolute`: under the manifest's
   * `projectRoot`, which Jenkins expects. `false`: no attachment lines.
   */
  attachmentPaths?: 'repository' | 'absolute' | false;
};

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/** Escaped for XML text; characters XML 1.0 cannot hold are dropped. */
const text = (value: string | number) =>
  String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/[&<>"']/g, (char) => ESCAPES[char]);

/** Escaped for an attribute value, where a parser turns a bare line break or tab into a space. */
const attribute = (value: string | number) =>
  text(value).replace(/[\t\n\r]/g, (char) => `&#${char.charCodeAt(0)};`);

const attributes = (values: Record<string, string | number | undefined>) =>
  Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${name}="${attribute(value as string | number)}"`)
    .join('');

const seconds = (ms: number | undefined) => ((ms ?? 0) / 1000).toFixed(3);

const percent = (ratio: number) => {
  const rounded = Number((ratio * 100).toFixed(2));
  return ratio > 0 && rounded === 0 ? 'under 0.01%' : `${rounded}%`;
};

const failureMessage = (entry: ManifestEntry) => {
  if (entry.message) return entry.message;
  if (entry.status === 'missing-baseline') {
    return `Screenshot "${entry.name}" has no baseline to compare against.`;
  }
  const { diffRatio, maxDiffRatio } = entry.comparison;
  return `Screenshot "${entry.name}" differs from its baseline: ${percent(diffRatio)} of the pixels${
    maxDiffRatio === undefined ? '' : ` (limit ${percent(maxDiffRatio)})`
  }.`;
};

/**
 * A manifest as a JUnit XML report, the format most CI systems read: one
 * `<testsuite>` per test file and one `<testcase>` per entry. `failed` and
 * `missing-baseline` entries carry a `<failure>`; every other status passes.
 *
 * JUnit XML has no place for a comparison: the status, the diff ratio, the
 * limit and the variant are written as `<properties>` of the test case, which
 * most readers ignore, and the images as `[[ATTACHMENT|path]]` lines, which
 * name files without saying which is the baseline. A manifest cannot be read
 * back from this report.
 */
export const toJUnit = (
  manifest: Manifest,
  { name, attachmentPaths = 'repository' }: ToJUnitOptions = {},
): string => {
  if (
    attachmentPaths !== 'repository' &&
    attachmentPaths !== 'absolute' &&
    attachmentPaths !== false
  ) {
    throw new TypeError(
      `attachmentPaths is ${JSON.stringify(attachmentPaths)}; expected "repository", "absolute" or false`,
    );
  }
  const projectDir = projectDirInRepo(manifest);
  /**
   * The path a reader of the report is told to pick up, or `null` for one that
   * must not be written: a reader copies whatever file a line names, so a path
   * that leaves the project, or that would end the line and start another, is
   * left out.
   */
  const imagePath = (relative: string | null) => {
    if (
      relative === null ||
      !isSafeRelativePath(relative) ||
      /[\r\n]|\]\]/.test(relative)
    ) {
      return null;
    }
    if (attachmentPaths === 'absolute') {
      return `${manifest.projectRoot.replace(/[\\/]+$/, '')}/${relative}`;
    }
    // a project outside the checked-out repository has no repository path
    return projectDir === null ? relative : toRepoPath(projectDir, relative);
  };

  const testCase = (entry: ManifestEntry) => {
    const { comparison, images } = entry;
    const properties: [string, string | number | undefined][] = [
      ['visualRegression.status', entry.status],
      ['visualRegression.diffRatio', comparison.diffRatio],
      ['visualRegression.maxDiffRatio', comparison.maxDiffRatio],
      ['visualRegression.variant', entry.variant],
    ];
    // a reader that shows one attachment takes the first: the diff says the most
    const attached =
      attachmentPaths === false
        ? []
        : [images.diff.path, images.actual.path, images.baseline.path]
            .map(imagePath)
            .filter((file): file is string => file !== null)
            .map((file) => `[[ATTACHMENT|${file}]]`);
    const failed = needsHuman(entry.status);
    const message = failed ? failureMessage(entry) : '';
    return [
      `    <testcase${attributes({
        name: `${[...entry.test.titlePath, entry.name].join(' > ')}${
          entry.variant ? ` [${entry.variant}]` : ''
        }`,
        classname: entry.test.filePath || manifest.runner.name,
        file: entry.test.filePath || undefined,
        time: seconds(entry.duration),
      })}>`,
      '      <properties>',
      ...properties
        .filter(([, value]) => value !== undefined)
        .map(
          ([property, value]) =>
            `        <property${attributes({ name: property, value })}/>`,
        ),
      '      </properties>',
      ...(failed
        ? [
            `      <failure${attributes({ message, type: entry.status })}>${text(message)}</failure>`,
          ]
        : []),
      ...(attached.length > 0
        ? [`      <system-out>${text(attached.join('\n'))}</system-out>`]
        : []),
      '    </testcase>',
    ];
  };

  const byFile = new Map<string, ManifestEntry[]>();
  for (const entry of manifest.entries) {
    const file = entry.test.filePath;
    byFile.set(file, [...(byFile.get(file) ?? []), entry]);
  }
  const counts = (entries: ManifestEntry[]) => ({
    tests: entries.length,
    failures: entries.filter((entry) => needsHuman(entry.status)).length,
    errors: 0,
    skipped: 0,
    time: seconds(
      entries.reduce((total, entry) => total + (entry.duration ?? 0), 0),
    ),
  });
  // JUnit timestamps are UTC with no milliseconds and no zone
  const created = Date.parse(manifest.createdAt);
  const timestamp = Number.isNaN(created)
    ? undefined
    : new Date(created).toISOString().slice(0, 19);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites${attributes({
      name: name ?? manifest.tool.name,
      ...counts(manifest.entries),
      timestamp,
    })}>`,
    ...[...byFile].flatMap(([file, entries]) => [
      `  <testsuite${attributes({
        name: file || manifest.runner.name,
        ...counts(entries),
        timestamp,
        file: file || undefined,
      })}>`,
      ...entries.flatMap(testCase),
      '  </testsuite>',
    ]),
    '</testsuites>',
    '',
  ].join('\n');
};
