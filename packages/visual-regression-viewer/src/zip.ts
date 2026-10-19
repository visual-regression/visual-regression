import fs from 'fs';
import os from 'os';
import path from 'path';
import { unzipSync } from 'fflate';

/**
 * Largest amount of data a zip may unpack to; a guard against zip bombs.
 * The sizes it adds up are the declared ones, which is sound: fflate never
 * unpacks an entry to more than the size it declares.
 */
export const MAX_UNZIPPED_BYTES = 4 * 1024 ** 3;

export type Input = {
  /** The directory the run is in: the input itself, or where a zip was unpacked. */
  dir: string;
  /** Removes what was unpacked; does nothing for a directory. */
  cleanup: () => void;
};

export const isZipPath = (input: string) => /\.zip$/i.test(input);

/** `true` for a name inside a zip that stays below the directory it is unpacked into. */
const isSafeEntry = (name: string) =>
  !path.posix.isAbsolute(name) &&
  !/^[a-zA-Z]:/.test(name) &&
  !name.includes('\\') &&
  !name.includes('\u0000') &&
  name.split('/').every((segment) => segment !== '..');

/** Unpacks `buffer` into `dir`; throws for entries that would land outside it. */
export const unzipInto = (buffer: Uint8Array, dir: string) => {
  let total = 0;
  const entries = unzipSync(buffer, {
    filter: ({ name, originalSize }) => {
      if (!isSafeEntry(name)) {
        throw new Error(`The zip has an entry outside of itself: ${name}`);
      }
      total += originalSize;
      if (total > MAX_UNZIPPED_BYTES) {
        throw new Error(
          `The zip unpacks to more than ${MAX_UNZIPPED_BYTES / 1024 ** 3} GiB`,
        );
      }
      return !name.endsWith('/');
    },
  });
  for (const [name, content] of Object.entries(entries)) {
    const target = path.join(dir, ...name.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
};

/**
 * The run to read: a zip (an artifact as downloaded) is unpacked into a
 * temporary directory that `cleanup` removes, anything else is used as it is.
 */
export const openInput = (input: string): Input => {
  if (
    !isZipPath(input) ||
    !fs.statSync(input, { throwIfNoEntry: false })?.isFile()
  ) {
    return { dir: input, cleanup: () => {} };
  }
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'visual-regression-viewer-'),
  );
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
  // an interrupted run must not leave the unpacked artifact behind
  process.once('exit', cleanup);
  try {
    unzipInto(fs.readFileSync(input), dir);
  } catch (error) {
    cleanup();
    process.off('exit', cleanup);
    throw error;
  }
  return {
    dir,
    cleanup: () => {
      process.off('exit', cleanup);
      cleanup();
    },
  };
};
