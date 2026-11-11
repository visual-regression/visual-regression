import fs from 'fs';
import path from 'path';
import { fromBackstopReport } from '../convert/backstop';
import { fromCtrf } from '../convert/ctrf';
import { fromCypressImageDiff } from '../convert/cypress-image-diff';
import { fromCypressVisualRegression } from '../convert/cypress-visual-regression';
import { fromJestImageSnapshots } from '../convert/jest-image-snapshot';
import { fromLoki } from '../convert/loki';
import { fromLostPixel } from '../convert/lost-pixel';
import { fromPlaywrightReport } from '../convert/playwright';
import { fromRegCli } from '../convert/reg-cli';
import { fromRoborazziResults } from '../convert/roborazzi';
import { fromVitestScreenshots } from '../convert/vitest';
import type { Manifest } from '../types';

export class UsageError extends Error {}

/** What the user typed, parsed; paths are as typed, relative to the working directory. */
export type ConvertFlags = {
  input?: string;
  projectRoot: string;
  maxDiffRatio?: number;
  maxDiffPixels?: number;
  colorThreshold?: number;
  update?: boolean;
  lenient?: boolean;
  configurations?: string[];
  /** Converter options merged over the ones the flags made. */
  options?: Record<string, unknown>;
};

/** The flags a converter reads besides `--project-root`, `--out` and `--options`. */
export type ToolFlag = Exclude<
  keyof ConvertFlags,
  'input' | 'projectRoot' | 'options'
>;

type Tool = {
  /** `report`: converts the JSON report `input`; `scan`: reads the folders the tool leaves in the project. */
  kind: 'report' | 'scan';
  /** Where the report is when `input` is left out; without one the report is required. */
  defaultInput?: string;
  flags: readonly ToolFlag[];
  run: (ctx: Context) => Manifest;
};

type Context = {
  flags: ConvertFlags;
  /** Absolute project root. */
  projectRoot: string;
  /** The parsed report, typed by the converter that reads it; `undefined` for scanning tools. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  report: any;
  /** Directory of the report relative to the project root, `undefined` when it is the root. */
  reportDir?: string;
};

const LIMITS = ['maxDiffRatio', 'maxDiffPixels', 'colorThreshold'] as const;

const pick = <K extends ToolFlag>(flags: ConvertFlags, keys: readonly K[]) =>
  Object.fromEntries(
    keys.filter((key) => flags[key] !== undefined).map((k) => [k, flags[k]]),
  ) as Pick<ConvertFlags, K>;

const withExtra = <T extends object>({ flags }: Context, base: T) => ({
  ...base,
  ...flags.options,
});

export const TOOLS: Record<string, Tool> = {
  playwright: {
    kind: 'report',
    flags: LIMITS,
    run: (ctx) =>
      fromPlaywrightReport(
        ctx.report,
        withExtra(ctx, {
          projectRoot: ctx.projectRoot,
          ...pick(ctx.flags, LIMITS),
        }),
      ),
  },
  vitest: {
    kind: 'scan',
    flags: LIMITS,
    run: (ctx) =>
      fromVitestScreenshots(
        withExtra(ctx, {
          projectRoot: ctx.projectRoot,
          ...pick(ctx.flags, LIMITS),
        }),
      ),
  },
  'jest-image-snapshot': {
    kind: 'scan',
    flags: LIMITS,
    run: (ctx) =>
      fromJestImageSnapshots(
        withExtra(ctx, {
          projectRoot: ctx.projectRoot,
          ...pick(ctx.flags, LIMITS),
        }),
      ),
  },
  'cypress-image-snapshot': {
    kind: 'scan',
    flags: LIMITS,
    run: (ctx) =>
      fromJestImageSnapshots(
        withExtra(ctx, {
          projectRoot: ctx.projectRoot,
          runner: { name: 'cypress' },
          snapshotsDir: 'cypress/snapshots',
          snapshotPostfix: '.snap',
          diffPostfix: '.diff',
          ...pick(ctx.flags, LIMITS),
        }),
      ),
  },
  'cypress-visual-regression': {
    kind: 'scan',
    flags: LIMITS,
    run: (ctx) =>
      fromCypressVisualRegression(
        withExtra(ctx, {
          projectRoot: ctx.projectRoot,
          ...pick(ctx.flags, LIMITS),
        }),
      ),
  },
  'cypress-image-diff': {
    kind: 'report',
    flags: ['colorThreshold'],
    run: (ctx) =>
      fromCypressImageDiff(
        ctx.report,
        withExtra(ctx, {
          projectRoot: ctx.projectRoot,
          reportDir: ctx.reportDir,
          ...pick(ctx.flags, ['colorThreshold']),
        }),
      ),
  },
  backstopjs: {
    kind: 'report',
    defaultInput: 'backstop_data/json_report/jsonReport.json',
    flags: [],
    run: (ctx) =>
      fromBackstopReport(
        ctx.report,
        withExtra(ctx, {
          projectRoot: ctx.projectRoot,
          reportDir: ctx.reportDir,
        }),
      ),
  },
  roborazzi: {
    kind: 'report',
    flags: ['maxDiffRatio'],
    run: (ctx) =>
      fromRoborazziResults(
        ctx.report,
        withExtra(ctx, {
          projectRoot: ctx.projectRoot,
          ...pick(ctx.flags, ['maxDiffRatio']),
        }),
      ),
  },
  'reg-cli': {
    kind: 'report',
    defaultInput: 'reg.json',
    flags: [...LIMITS, 'update'],
    run: (ctx) =>
      fromRegCli(
        ctx.report,
        withExtra(ctx, {
          projectRoot: ctx.projectRoot,
          reportDir: ctx.reportDir,
          ...pick(ctx.flags, [...LIMITS, 'update']),
        }),
      ),
  },
  'lost-pixel': {
    kind: 'scan',
    flags: ['maxDiffRatio', 'update'],
    run: (ctx) =>
      fromLostPixel(
        withExtra(ctx, {
          projectRoot: ctx.projectRoot,
          // Lost Pixel's `threshold` is a share of the pixels from 0 to 1
          ...(ctx.flags.maxDiffRatio !== undefined && {
            threshold: ctx.flags.maxDiffRatio,
          }),
          ...pick(ctx.flags, ['update']),
        }),
      ),
  },
  loki: {
    kind: 'scan',
    flags: ['configurations'],
    run: (ctx) =>
      fromLoki(
        withExtra(ctx, {
          projectRoot: ctx.projectRoot,
          ...pick(ctx.flags, ['configurations']),
        }),
      ),
  },
  ctrf: {
    kind: 'report',
    flags: ['lenient'],
    run: (ctx) =>
      fromCtrf(
        ctx.report,
        withExtra(ctx, {
          projectRoot: ctx.projectRoot,
          ...pick(ctx.flags, ['lenient']),
        }),
      ),
  },
};

export const FLAG_NAMES: Record<ToolFlag, string> = {
  maxDiffRatio: '--max-diff-ratio',
  maxDiffPixels: '--max-diff-pixels',
  colorThreshold: '--color-threshold',
  update: '--update',
  lenient: '--lenient',
  configurations: '--configurations',
};

const readReport = (file: string): unknown => {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new UsageError(
      `Cannot read the report ${file}: ${(error as Error).message}`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new UsageError(`The report ${file} is not valid JSON`);
  }
};

/** Converts what `tool` left behind (or its report) into a manifest. Relative paths resolve against `cwd`. */
export const convertTool = (
  name: string,
  flags: ConvertFlags,
  cwd: string,
): Manifest => {
  const tool = TOOLS[name];
  if (!tool) {
    throw new UsageError(
      `Unknown tool ${JSON.stringify(name)}. Choose one of: ${Object.keys(TOOLS).join(', ')}`,
    );
  }
  for (const flag of Object.keys(FLAG_NAMES) as ToolFlag[]) {
    if (flags[flag] !== undefined && !tool.flags.includes(flag)) {
      throw new UsageError(
        `${FLAG_NAMES[flag]} does not apply to ${name}${
          tool.flags.length
            ? `; it takes ${tool.flags.map((f) => FLAG_NAMES[f]).join(', ')}`
            : ', which takes none of these'
        }. Pass --options for anything else`,
      );
    }
  }
  const projectRoot = path.resolve(cwd, flags.projectRoot);
  if (!fs.statSync(projectRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new UsageError(`The project root ${projectRoot} is not a directory`);
  }
  if (tool.kind === 'scan') {
    if (flags.input !== undefined) {
      throw new UsageError(
        `${name} has no report to read: it is converted from the files it leaves in the project root. Use --project-root to say where, and drop ${JSON.stringify(flags.input)}`,
      );
    }
    return tool.run({ flags, projectRoot, report: undefined });
  }
  if (flags.input === undefined && tool.defaultInput === undefined) {
    throw new UsageError(`${name} needs the path of its report`);
  }
  // a typed path is relative to where the user is, the conventional one to the project
  const file =
    flags.input !== undefined
      ? path.resolve(cwd, flags.input)
      : path.resolve(projectRoot, tool.defaultInput as string);
  const relative = path.relative(projectRoot, path.dirname(file));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new UsageError(
      `The report ${file} is outside the project root ${projectRoot}; move it, or set --project-root`,
    );
  }
  return tool.run({
    flags,
    projectRoot,
    report: readReport(file),
    reportDir: relative === '' ? undefined : relative,
  });
};
