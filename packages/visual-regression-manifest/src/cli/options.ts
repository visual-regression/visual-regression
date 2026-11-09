import { parseArgs } from 'util';
import { TOOLS, UsageError, type ConvertFlags } from './convert';

const OPTIONS = {
  'project-root': { type: 'string', short: 'p' },
  out: { type: 'string', short: 'o' },
  'max-diff-ratio': { type: 'string' },
  'max-diff-pixels': { type: 'string' },
  'color-threshold': { type: 'string' },
  update: { type: 'boolean' },
  lenient: { type: 'boolean' },
  configurations: { type: 'string' },
  options: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const;

export const helpText = `Usage: visual-regression-manifest convert <tool> [report] [options]

Write the run manifest of a visual regression tool's output. Tools that write a
JSON report take its path; the others are read from the files they leave in the
project root.

Tools:
${Object.entries(TOOLS)
  .map(
    ([name, { kind, defaultInput }]) =>
      `  ${name.padEnd(26)}${kind === 'scan' ? 'scans the project root' : defaultInput ? `report (default ${defaultInput})` : 'report'}`,
  )
  .join('\n')}

Options:
  -p, --project-root <dir>   The project the tool ran in (default: the current directory)
  -o, --out <dir|file>       Where to write the manifest: a folder, which gets
                             visual-regression-manifest.<tool>.json, or a .json
                             file (default: the project root, next to the images)
      --max-diff-ratio <n>   The tool's limit as a share of the pixels, 0 to 1
      --max-diff-pixels <n>  The tool's limit as a number of pixels
      --color-threshold <n>  The tool's per-pixel color tolerance
      --update               The run updated the baselines (lost-pixel, reg-cli)
      --lenient              Also convert the tests of reports made by other
                             reporters (ctrf)
      --configurations <a,b> The keys of your loki configurations (loki)
      --options <json>       More converter options as a JSON object, such as
                             '{"baselineDir":"shots"}'. See the README
  -v, --version              Print the version
  -h, --help                 Print this help

Examples:
  visual-regression-manifest convert playwright report.json --max-diff-ratio 0.01
  visual-regression-manifest convert lost-pixel --update
  visual-regression-manifest convert backstopjs -o run && npx visual-regression-viewer run
`;

export type Command =
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'convert'; tool: string; flags: ConvertFlags; out?: string };

const number = (flag: string, value: string | undefined) => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (value.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
    throw new UsageError(
      `${flag} needs a number of 0 or more, got ${JSON.stringify(value)}`,
    );
  }
  return parsed;
};

const jsonObject = (value: string | undefined) => {
  if (value === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new UsageError('--options needs a JSON object');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new UsageError('--options needs a JSON object');
  }
  return parsed as Record<string, unknown>;
};

/** Parses the arguments after `node cli.js`. */
export const parseCommand = (argv: string[]): Command => {
  let parsed: ReturnType<
    typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>
  >;
  try {
    parsed = parseArgs({
      args: argv,
      options: OPTIONS,
      allowPositionals: true,
    });
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
  const { values, positionals } = parsed;
  if (values.help) return { kind: 'help' };
  if (values.version) return { kind: 'version' };
  const [command, tool, input, ...rest] = positionals;
  if (command !== 'convert') {
    throw new UsageError(
      command === undefined
        ? 'Expected a command: convert'
        : `Unknown command ${JSON.stringify(command)}; the only one is convert`,
    );
  }
  if (tool === undefined) {
    throw new UsageError(
      `convert needs a tool: ${Object.keys(TOOLS).join(', ')}`,
    );
  }
  if (rest.length > 0) {
    throw new UsageError(
      `Expected one report, got ${[input, ...rest].length}: ${[input, ...rest].join(' ')}`,
    );
  }
  const configurations = values.configurations
    ?.split(',')
    .map((key) => key.trim())
    .filter(Boolean);
  return {
    kind: 'convert',
    tool,
    out: values.out,
    flags: {
      input,
      projectRoot: values['project-root'] ?? '.',
      maxDiffRatio: number('--max-diff-ratio', values['max-diff-ratio']),
      maxDiffPixels: number('--max-diff-pixels', values['max-diff-pixels']),
      colorThreshold: number('--color-threshold', values['color-threshold']),
      update: values.update,
      lenient: values.lenient,
      configurations: configurations?.length ? configurations : undefined,
      options: jsonObject(values.options),
    },
  };
};
