import { loadEngine } from './engines';
import type { Registry } from './plugins';
import type { DiffEngine, EngineOptions } from './types';

/**
 * Resolves the engine of a comparison, once per set of engine options: a
 * plugin's engine (by name), an engine object, or one loaded by id. The main
 * thread needs it for the engine's name and color metric, and to run it when
 * it is an object or came from a plugin.
 */
export const createEngineResolver = ({
  spec = 'pixelmatch',
  registry,
  ready,
}: {
  spec?: string | DiffEngine;
  registry: Pick<Registry, 'engines'>;
  ready: Promise<void>;
}) => {
  const cache = new Map<string, Promise<DiffEngine>>();
  const resolve = async (options: EngineOptions): Promise<DiffEngine> => {
    await ready;
    if (typeof spec === 'object') return spec;
    const registered = registry.engines.get(spec);
    return typeof registered === 'function'
      ? registered(options)
      : (registered ?? loadEngine(spec, options));
  };
  return (options: EngineOptions) => {
    const key = JSON.stringify(options);
    if (!cache.has(key)) cache.set(key, resolve(options));
    return cache.get(key) as Promise<DiffEngine>;
  };
};

/** Whether the engine can cross a thread boundary: it is named, not an object or a plugin's. */
export const runsInWorker = (
  spec: string | DiffEngine = 'pixelmatch',
  registry: Pick<Registry, 'engines'>,
): spec is string => typeof spec === 'string' && !registry.engines.has(spec);
