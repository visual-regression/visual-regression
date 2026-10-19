import fs from 'fs';
import path from 'path';
import {
  mergeManifests,
  platformLabel,
  readManifestFile,
  readManifestFiles,
  resolveInProject,
  toPosix,
  type ManifestSource,
} from 'visual-regression-manifest';
import type { ViewerData, ViewerEntry } from './types';

type FileSource = ManifestSource & { file: string };

export type LoadedRun = {
  data: ViewerData;
  /** Every file the page links to: URL path (`/` separated, relative to the run directory) to absolute path. */
  files: Map<string, string>;
};

const IGNORED_DIRS = ['node_modules', '.git'];

const isInside = (root: string, file: string) =>
  file === root || file.startsWith(root + path.sep);

const isFile = (file: string) => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

const walk = (dir: string, out: string[] = []) => {
  for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      if (!IGNORED_DIRS.includes(dirent.name)) walk(full, out);
    } else if (dirent.isFile()) {
      out.push(full);
    }
  }
  return out;
};

/** How many trailing path segments `candidate` shares with `wanted`. */
const sharedTail = (wanted: string[], candidate: string[]) => {
  let score = 0;
  while (
    score < wanted.length &&
    score < candidate.length &&
    candidate[candidate.length - 1 - score] ===
      wanted[wanted.length - 1 - score]
  ) {
    score++;
  }
  return score;
};

/**
 * Maps the image paths of manifests to files below `root`. A path is tried
 * against the manifest's directory first; an unpacked CI artifact often has
 * another layout than the machine that wrote the manifest, so the file whose
 * path ends the same way wins as a fallback (the same rule the viewer on
 * the website uses for dropped folders). When several files end the same
 * way equally well the image is left out and `warn` is told: showing the
 * screenshot of another test would be worse than showing none.
 */
const createResolver = (root: string, warn: (message: string) => void) => {
  let index: Map<string, { file: string; parts: string[] }[]> | undefined;
  const fallback = (p: string) => {
    if (!index) {
      index = new Map();
      for (const file of walk(root)) {
        const parts = toPosix(path.relative(root, file)).split('/');
        const name = parts[parts.length - 1];
        index.set(name, [...(index.get(name) ?? []), { file, parts }]);
      }
    }
    const wanted = p.replace(/^(\.\.?\/)+/, '').split('/');
    // a file has to share at least its name, so only those are scored
    const candidates = index.get(wanted[wanted.length - 1]) ?? [];
    let best: string[] = [];
    let bestScore = 0;
    for (const candidate of candidates) {
      const score = sharedTail(wanted, candidate.parts);
      if (score > bestScore) {
        bestScore = score;
        best = [candidate.file];
      } else if (score === bestScore) {
        best.push(candidate.file);
      }
    }
    if (best.length > 1) {
      warn(
        `${p} matches ${best.length} files equally well (${best
          .map((file) => toPosix(path.relative(root, file)))
          .join(', ')}), so it is not shown`,
      );
      return undefined;
    }
    return best[0];
  };
  return (manifestFile: string, p: string | null) => {
    if (!p) return null;
    const direct = resolveInProject(path.dirname(manifestFile), p);
    const found =
      isInside(root, direct) && isFile(direct) ? direct : fallback(p);
    return found ? toPosix(path.relative(root, found)) : null;
  };
};

export const urlOf = (rel: string) =>
  rel.split('/').map(encodeURIComponent).join('/');

/**
 * Reads every manifest below `dir` (or the one manifest `dir` points at),
 * merges them as `mergeManifests` does and collects the images they name.
 */
export const loadRun = (dir: string, title: string): LoadedRun => {
  const target = path.resolve(dir);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch {
    throw new Error(`${dir} does not exist`);
  }
  const root = stat.isDirectory() ? target : path.dirname(target);
  const read = stat.isDirectory()
    ? readManifestFiles(root)
    : [{ file: target, manifest: readManifestFile(target) }];
  if (read.length === 0) {
    throw new Error(
      `No visual-regression-manifest*.json file found below ${root}`,
    );
  }

  const sources: FileSource[] = read.map(({ file, manifest }) => ({
    manifest,
    file,
    label: toPosix(path.relative(root, file)),
  }));
  const run = mergeManifests(sources);
  const warnings = new Set(run.warnings);
  const resolve = createResolver(root, (message) => warnings.add(message));
  const files = new Map<string, string>();
  const image = (file: string, p: string | null) => {
    const rel = resolve(file, p);
    if (rel === null) return null;
    files.set(rel, path.join(root, rel));
    return urlOf(rel);
  };

  const needsHuman = new Set(run.needsHuman.map((e) => e.keyHash));
  const entries: ViewerEntry[] = run.entries.map(
    ({ keyHash, entry, source }) => {
      const { comparison, images } = entry;
      return {
        id: keyHash,
        name: entry.name,
        status: entry.status,
        needsHuman: needsHuman.has(keyHash),
        test: entry.test,
        platform: platformLabel(entry),
        viewport: entry.viewport,
        message: entry.message,
        source: source.label ?? '',
        comparison: {
          diffRatio: comparison.diffRatio,
          maxDiffRatio: comparison.maxDiffRatio,
          colorThreshold: comparison.colorThreshold,
          colorMetric: comparison.colorMetric,
        },
        images: {
          baseline: image(source.file, images.baseline.path),
          actual: image(source.file, images.actual.path),
          diff: image(source.file, images.diff.path),
        },
        paths: {
          baseline: images.baseline.path,
          actual: images.actual.path,
          diff: images.diff.path,
        },
      };
    },
  );

  const first = read[0].manifest;
  return {
    files,
    data: {
      title,
      manifests: read.length,
      tool: first.tool,
      runner: first.runner,
      counts: run.counts,
      warnings: [...warnings],
      entries,
    },
  };
};
