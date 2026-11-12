import path from 'path';
import { pathToFileURL } from 'url';
import type { DiffEngine, EngineModule, EngineOptions } from '../types';
import { pixelmatchFrom } from './pixelmatch';

export { pixelmatchEngine, type PixelmatchOptions } from './pixelmatch';

const BUILT_IN: Record<string, (options: EngineOptions) => DiffEngine> = {
  pixelmatch: pixelmatchFrom,
};

export const BUILT_IN_ENGINES = Object.keys(BUILT_IN);

const isDiffEngine = (value: unknown): value is DiffEngine =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as DiffEngine).compare === 'function' &&
  typeof (value as DiffEngine).name === 'string';

/**
 * Turns an engine id into an engine: a built-in name, a path to a module
 * (`./my-engine.mjs`, resolved from `cwd`) or a package name. The module's
 * default export is an engine or a function making one from the options.
 */
export const loadEngine = async (
  id: string,
  options: EngineOptions = {},
  cwd = process.cwd(),
): Promise<DiffEngine> => {
  const builtIn = BUILT_IN[id];
  if (builtIn) return builtIn(options);
  const isPath = /^\.{0,2}[\\/]/.test(id) || path.isAbsolute(id);
  const specifier = isPath ? pathToFileURL(path.resolve(cwd, id)).href : id;
  let loaded: { default?: EngineModule };
  try {
    loaded = await import(specifier);
  } catch (error) {
    throw new Error(
      `Cannot load engine "${id}" (built in: ${BUILT_IN_ENGINES.join(', ')}): ${(error as Error).message}`,
      { cause: error },
    );
  }
  const exported = loaded.default;
  const engine = typeof exported === 'function' ? exported(options) : exported;
  if (!isDiffEngine(engine)) {
    throw new Error(
      `Engine "${id}" must default-export a { name, colorMetric, compare } object or a function returning one`,
    );
  }
  return engine;
};
