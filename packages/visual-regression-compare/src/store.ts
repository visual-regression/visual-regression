import fs from 'fs';
import path from 'path';
import { isSafeRelativePath } from 'visual-regression-manifest';
import type { ImageKind, ImageRef, Store } from './types';

export type FsStoreOptions = {
  baselineDir: string;
  /** Where the screenshots to compare are; only the directory call needs it. */
  actualDir?: string;
  /** Where `.actual` and `.diff` files are written; defaults to `baselineDir`, next to the baselines. */
  diffDir?: string;
};

const GENERATED = /\.(actual|diff)\.png$/;

export const fsStore = ({
  baselineDir,
  actualDir,
  diffDir,
}: FsStoreOptions): Store => {
  const roots: Record<ImageKind, string | undefined> = {
    baseline: baselineDir,
    incoming: actualDir,
    actual: diffDir ?? baselineDir,
    diff: diffDir ?? baselineDir,
  };

  const rootOf = (kind: ImageKind) => {
    const root = roots[kind];
    if (!root) throw new Error(`The store has no directory for ${kind} images`);
    return path.resolve(root);
  };
  const locate = ({ kind, path: relative }: ImageRef) => {
    if (relative !== '' && !isSafeRelativePath(relative)) {
      throw new Error(`Unsafe image path ${JSON.stringify(relative)}`);
    }
    return path.join(rootOf(kind), relative);
  };

  return {
    locate,
    async read(ref) {
      try {
        return await fs.promises.readFile(locate(ref));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
    async write(ref, bytes) {
      const file = locate(ref);
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(file, bytes);
    },
    async remove(ref) {
      await fs.promises.rm(locate(ref), { force: true });
    },
    async *list(kind) {
      const root = rootOf(kind);
      const found: string[] = [];
      const walk = async (dir: string, prefix: string) => {
        for (const dirent of await fs.promises.readdir(dir, {
          withFileTypes: true,
        })) {
          const relative = prefix ? `${prefix}/${dirent.name}` : dirent.name;
          if (dirent.isDirectory()) {
            if (dirent.name !== 'node_modules' && dirent.name !== '.git') {
              await walk(path.join(dir, dirent.name), relative);
            }
          } else if (
            dirent.isFile() &&
            dirent.name.endsWith('.png') &&
            !GENERATED.test(dirent.name)
          ) {
            found.push(relative);
          }
        }
      };
      await walk(root, '');
      for (const relative of found.sort()) yield { kind, path: relative };
    },
  };
};
