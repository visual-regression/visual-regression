import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import type { ConfigFile } from './options';

const CANDIDATES = [
  'visual-regression.config.json',
  'visual-regression.config.mjs',
  'visual-regression.config.js',
];

/** The config file named by `--config`, else the first `visual-regression.config.*` in `cwd`; `{}` when there is none. */
export const loadConfig = async (
  explicit: string | undefined,
  cwd = process.cwd(),
): Promise<ConfigFile> => {
  const file = explicit
    ? path.resolve(cwd, explicit)
    : CANDIDATES.map((name) => path.join(cwd, name)).find((f) =>
        fs.existsSync(f),
      );
  if (!file) return {};
  if (!fs.existsSync(file))
    throw new Error(`Config file ${file} does not exist`);
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const loaded = (await import(pathToFileURL(file).href)) as {
    default?: ConfigFile;
  };
  return loaded.default ?? {};
};

/** `--config <file>` from raw arguments, so the file can be read before the rest is parsed. */
export const configArg = (argv: string[]) => {
  const at = argv.findIndex(
    (arg) => arg === '--config' || arg.startsWith('--config='),
  );
  if (at === -1) return undefined;
  const arg = argv[at];
  return arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[at + 1];
};
