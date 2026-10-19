import { parseArgs } from 'util';

export const DEFAULT_PORT = 4173;
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_TITLE = 'Visual regression viewer';

export type ViewerOptions = {
  /** Directory with the manifests and images of the run, a zip of it, or one manifest file. */
  dir: string;
  /** Write the page and its images here. */
  out?: string;
  serve: boolean;
  /** Reload open pages when the output directory changes (needs `out` and `serve`). */
  watch: boolean;
  port: number;
  /** `false` when the port was chosen explicitly: a taken port is then an error. */
  autoPort: boolean;
  host: string;
  template?: string;
  css?: string;
  title: string;
};

/** The flags as the user typed them; `serve` and `watch` are `false` after `--no-serve` and `--no-watch`. */
export type RawFlags = {
  out?: string;
  serve?: boolean;
  watch?: boolean;
  port?: string;
  host?: string;
  template?: string;
  css?: string;
  title?: string;
};

const OPTIONS = {
  out: { type: 'string', short: 'o' },
  'no-serve': { type: 'boolean' },
  'no-watch': { type: 'boolean' },
  port: { type: 'string', short: 'p' },
  host: { type: 'string' },
  template: { type: 'string' },
  css: { type: 'string' },
  title: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const;

export class UsageError extends Error {}

export const resolveOptions = (
  dir: string | undefined,
  flags: RawFlags,
): ViewerOptions => {
  const serve = flags.serve !== false;
  if (!serve && !flags.out) {
    throw new UsageError(
      '--no-serve needs -o, --out: without a server and without an output there is nothing to do',
    );
  }
  let port = DEFAULT_PORT;
  if (flags.port !== undefined) {
    port = Number(flags.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new UsageError(`Invalid port ${JSON.stringify(flags.port)}`);
    }
  }
  return {
    dir: dir ?? '.',
    out: flags.out,
    serve,
    watch: flags.watch !== false,
    port,
    autoPort: flags.port === undefined,
    host: flags.host ?? DEFAULT_HOST,
    template: flags.template,
    css: flags.css,
    title: flags.title ?? DEFAULT_TITLE,
  };
};

export const helpText = `Usage: visual-regression-viewer [dir|zip] [options]

Review the visual regression run in [dir] (default: the current directory)
or in a zip of it, such as a downloaded CI artifact.
The page is built in memory and served; nothing is written unless -o is given.

Options:
  -o, --out <dir>      Write the page and its images to <dir>
      --no-serve       Do not start the web server (needs -o)
      --no-watch       Do not reload the page when the files in --out change
  -p, --port <port>    Port of the web server (default ${DEFAULT_PORT}, the next free one if taken)
      --host <host>    Host of the web server (default ${DEFAULT_HOST})
      --template <file>  Use this HTML page instead of the built-in one
      --css <file>     Add this stylesheet to the page
      --title <text>   Page title (default "${DEFAULT_TITLE}")
  -v, --version        Print the version
  -h, --help           Print this help

Examples:
  visual-regression-viewer path/to/run
  visual-regression-viewer path/to/run -o report
  visual-regression-viewer path/to/run -o report --no-serve
`;

export type Command =
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'run'; options: ViewerOptions };

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
  if (positionals.length > 1) {
    throw new UsageError(
      `Expected one directory, got ${positionals.length}: ${positionals.join(' ')}`,
    );
  }
  return {
    kind: 'run',
    options: resolveOptions(positionals[0], {
      out: values.out,
      serve: values['no-serve'] ? false : undefined,
      watch: values['no-watch'] ? false : undefined,
      port: values.port,
      host: values.host,
      template: values.template,
      css: values.css,
      title: values.title,
    }),
  };
};
