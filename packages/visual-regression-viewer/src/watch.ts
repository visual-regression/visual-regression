import path from 'path';
import chokidar from 'chokidar';

export type Watcher = {
  /** Resolves once the initial scan is done, so changes after it are not missed. */
  ready: Promise<void>;
  close: () => Promise<void>;
};

/**
 * Calls `onChange` (debounced) with the absolute paths that were added,
 * changed or removed, whenever something in or below `paths` is.
 */
export const watchPaths = (
  paths: string[],
  onChange: (changed: Set<string>) => void,
  delay = 100,
): Watcher => {
  const watcher = chokidar.watch(paths, { ignoreInitial: true });
  let timer: NodeJS.Timeout | undefined;
  let changed = new Set<string>();
  watcher.on('all', (_event, file) => {
    changed.add(path.resolve(file));
    clearTimeout(timer);
    timer = setTimeout(() => {
      const batch = changed;
      changed = new Set();
      onChange(batch);
    }, delay);
  });
  return {
    ready: new Promise((resolve) => watcher.once('ready', () => resolve())),
    close: async () => {
      clearTimeout(timer);
      await watcher.close();
    },
  };
};
