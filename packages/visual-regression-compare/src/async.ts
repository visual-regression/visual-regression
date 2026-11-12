/** Awaits `fn` over `args` for each function, one after another. */
export const runAll = async <Args extends unknown[]>(
  fns: readonly ((...args: Args) => void | Promise<void>)[],
  ...args: Args
) => {
  for (const fn of fns) await fn(...args);
};

/** Awaits `fn` for each item, one after another. */
export const forEachSeries = async <T>(
  items: readonly T[],
  fn: (item: T) => void | Promise<void>,
) => {
  for (const item of items) await fn(item);
};

/** Threads `value` through `steps`, each step seeing the result of the one before. */
export const pipe = <T>(
  value: T,
  steps: readonly ((value: T) => T | Promise<T>)[],
): Promise<T> =>
  steps.reduce<Promise<T>>(
    async (acc, step) => step(await acc),
    Promise.resolve(value),
  );

/** Runs `fn` once, however often the result is asked for. */
export const once = <T>(fn: () => Promise<T>): (() => Promise<T>) => {
  let result: Promise<T> | undefined;
  return () => (result ??= fn());
};

export const collect = async <T>(items: AsyncIterable<T>): Promise<T[]> => {
  const all: T[] = [];
  for await (const item of items) all.push(item);
  return all;
};

/**
 * Runs `fn` for every item, `limit` at a time. A failure does not stop the
 * others; the failures come back in the order they happened.
 */
export const mapLimit = async <T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<unknown>,
): Promise<Error[]> => {
  const failures: Error[] = [];
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      try {
        await fn(items[next++]);
      } catch (error) {
        failures.push(error as Error);
      }
    }
  };
  const lanes = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: lanes }, lane));
  return failures;
};
