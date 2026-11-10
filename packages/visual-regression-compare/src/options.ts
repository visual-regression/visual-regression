import { parseArgs } from 'util';
import {
  MANIFEST_STATUSES,
  type ManifestStatus,
} from 'visual-regression-manifest';
import type { OnMissingBaseline, SizeMismatch, UpdatePolicy } from './types';

export class UsageError extends Error {}

export type CompareCliOptions = {
  actualDir: string;
  baselineDir: string;
  diffDir?: string;
  engine: string;
  engineOptions: Record<string, unknown>;
  maxDiffRatio?: number;
  maxDiffPixels?: number;
  onMissingBaseline: OnMissingBaseline;
  onSizeMismatch: SizeMismatch;
  update: UpdatePolicy;
  match?: string;
  layout: string;
  manifest?: string;
  runner?: string;
  variant?: string;
  platform?: string;
  report: string;
  concurrency?: number;
  failOn: ManifestStatus[];
  /** `record` copies every screenshot over its baseline. */
  record: boolean;
};

export type ApproveCliOptions = {
  manifests: string[];
  names: string[];
  all: boolean;
  test?: string;
  force: boolean;
  dryRun: boolean;
};

export type Command =
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'compare'; options: CompareCliOptions }
  | { kind: 'approve'; options: ApproveCliOptions };

/** The keys a config file may set; the flags override them. */
export type ConfigFile = Partial<
  Omit<CompareCliOptions, 'actualDir' | 'record'> & { actualDir: string }
>;

export const helpText = `Compare folders of screenshots against their baselines and write a visual-regression-manifest.

Usage:
  visual-regression-compare [compare] <actual-dir> --baseline <dir> [options]
  visual-regression-compare record <actual-dir> --baseline <dir> [options]
  visual-regression-compare approve --manifest <path>... [<name>...|--all] [options]

compare options:
  --baseline <dir>          directory of baseline images (required)
  --diff <dir>              where .actual and .diff files go (default: next to the baselines)
  --engine <id>             pixelmatch, or a module path or package name (default: pixelmatch)
  --max-diff-ratio <n>      largest accepted share of differing pixels, 0..1 (default: 0)
  --max-diff-pixels <n>     largest accepted number of differing pixels
  --color-threshold <n>     per-pixel color tolerance of the engine, 0..1 (default: 0.1)
  --include-aa              count anti-aliased pixels as differences
  --on-missing fail|create  a screenshot without baseline (default: fail)
  --on-size-mismatch fail|pad|crop
                            fail records the size change and compares nothing; pad grows both
                            images to the larger size, crop cuts both to the smaller (default: fail)
  --update none|failures-only|all
                            overwrite baselines (default: none)
  --match <template>        baseline path from the screenshot path: {dir}, {name}, {path}
  --layout manifest         file naming (default: manifest)
  --manifest <path>         default: <actual-dir>/visual-regression-manifest.compare.json
  --runner <name> --variant <id> --platform <os>[/<browser>]
                            metadata recorded on every entry
  --report <list>           console, ctrf[:<file>], github-summary[:<file>] (default: console)
  --concurrency <n>         worker threads for decoding and comparing (default: CPU count)
  --config <file>           visual-regression.config.{json,mjs,js}, found in the working directory
  --fail-on <list>          statuses that make the exit code 1 (default: failed,missing-baseline)

approve options:
  --manifest <path>         a manifest to apply (repeatable; required)
  --all                     every entry that needs a human (the default without names)
  --test <file>             only entries of this test file
  --force                   approve although the baseline changed since the run
  --dry-run                 report what would be approved

  -h, --help, -v, --version
`;

const number = (name: string, value: string | undefined) => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (value.trim() === '' || Number.isNaN(parsed)) {
    throw new UsageError(`${name} must be a number, got "${value}"`);
  }
  return parsed;
};

const oneOf = <T extends string>(
  name: string,
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T => {
  if (value === undefined) return fallback;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new UsageError(
      `${name} must be one of ${allowed.join(', ')}, got "${value}"`,
    );
  }
  return value as T;
};

export const parseCommand = (
  argv: string[],
  config: ConfigFile = {},
): Command => {
  const first = argv[0];
  const verb =
    first === 'compare' || first === 'record' || first === 'approve'
      ? first
      : undefined;
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: verb ? argv.slice(1) : argv,
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        baseline: { type: 'string' },
        diff: { type: 'string' },
        engine: { type: 'string' },
        'max-diff-ratio': { type: 'string' },
        'max-diff-pixels': { type: 'string' },
        'color-threshold': { type: 'string' },
        'include-aa': { type: 'boolean' },
        'on-missing': { type: 'string' },
        'on-size-mismatch': { type: 'string' },
        update: { type: 'string' },
        match: { type: 'string' },
        layout: { type: 'string' },
        manifest: { type: 'string', multiple: true },
        runner: { type: 'string' },
        variant: { type: 'string' },
        platform: { type: 'string' },
        report: { type: 'string' },
        concurrency: { type: 'string' },
        config: { type: 'string' },
        'fail-on': { type: 'string' },
        all: { type: 'boolean' },
        test: { type: 'string' },
        force: { type: 'boolean' },
        'dry-run': { type: 'boolean' },
      },
    });
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
  const { values, positionals } = parsed;
  if (values.help) return { kind: 'help' };
  if (values.version) return { kind: 'version' };

  const manifests = (values.manifest as string[] | undefined) ?? [];
  if (verb === 'approve') {
    if (manifests.length === 0) {
      throw new UsageError('approve needs at least one --manifest <path>');
    }
    return {
      kind: 'approve',
      options: {
        manifests,
        names: positionals,
        all: Boolean(values.all) || positionals.length === 0,
        test: values.test as string | undefined,
        force: Boolean(values.force),
        dryRun: Boolean(values['dry-run']),
      },
    };
  }

  const actualDir = positionals[0] ?? config.actualDir;
  if (!actualDir) throw new UsageError('Missing <actual-dir>');
  if (positionals.length > 1) {
    throw new UsageError(`Unexpected argument "${positionals[1]}"`);
  }
  const baselineDir =
    (values.baseline as string | undefined) ?? config.baselineDir;
  if (!baselineDir) throw new UsageError('Missing --baseline <dir>');
  const record = verb === 'record';
  const failOn = (
    (values['fail-on'] as string | undefined)
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ??
    config.failOn ?? ['failed', 'missing-baseline']
  ).map(
    (status) =>
      oneOf('--fail-on', status, MANIFEST_STATUSES, 'failed') as ManifestStatus,
  );
  const colorThreshold = number(
    '--color-threshold',
    values['color-threshold'] as string | undefined,
  );
  return {
    kind: 'compare',
    options: {
      actualDir,
      baselineDir,
      diffDir: (values.diff as string | undefined) ?? config.diffDir,
      engine:
        (values.engine as string | undefined) ?? config.engine ?? 'pixelmatch',
      engineOptions: {
        ...config.engineOptions,
        ...(colorThreshold !== undefined && { threshold: colorThreshold }),
        ...(values['include-aa'] && { includeAA: true }),
      },
      maxDiffRatio:
        number(
          '--max-diff-ratio',
          values['max-diff-ratio'] as string | undefined,
        ) ?? config.maxDiffRatio,
      maxDiffPixels:
        number(
          '--max-diff-pixels',
          values['max-diff-pixels'] as string | undefined,
        ) ?? config.maxDiffPixels,
      onMissingBaseline: record
        ? 'create'
        : oneOf(
            '--on-missing',
            values['on-missing'] as string | undefined,
            ['fail', 'create'],
            config.onMissingBaseline ?? 'fail',
          ),
      onSizeMismatch: oneOf(
        '--on-size-mismatch',
        values['on-size-mismatch'] as string | undefined,
        ['fail', 'pad', 'crop'],
        config.onSizeMismatch ?? 'fail',
      ),
      update: record
        ? 'all'
        : oneOf(
            '--update',
            values.update as string | undefined,
            ['none', 'failures-only', 'all'],
            config.update ?? 'none',
          ),
      match: (values.match as string | undefined) ?? config.match,
      layout: oneOf(
        '--layout',
        values.layout as string | undefined,
        ['manifest'],
        'manifest',
      ),
      manifest: manifests[0] ?? config.manifest,
      runner: (values.runner as string | undefined) ?? config.runner,
      variant: (values.variant as string | undefined) ?? config.variant,
      platform: (values.platform as string | undefined) ?? config.platform,
      report:
        (values.report as string | undefined) ?? config.report ?? 'console',
      concurrency:
        number('--concurrency', values.concurrency as string | undefined) ??
        config.concurrency,
      failOn,
      record,
    },
  };
};
