import fs from 'fs';
import path from 'path';
import type { ManifestHeaderInput } from '../builder';
import { resolveInProject, toPosix } from '../paths';
import type { Manifest, ManifestRunner } from '../types';
import { fromImageTriples, type ImageTriple } from './triples';
import { isImage, listFiles } from './walk';

export type FromLokiOptions = Omit<ManifestHeaderInput, 'runner'> & {
  /** Recorded as `runner`; defaults to `{ name: 'loki' }`. */
  runner?: ManifestRunner;
  /** `reference` in the loki config; relative to `projectRoot`. */
  referenceDir?: string;
  /** `output`. */
  currentDir?: string;
  /** `difference`. */
  differenceDir?: string;
  /**
   * The names of the `configurations` in the loki config (`chrome.laptop`,
   * `ios.iphone7`, ...). A file name starts with its configuration, slugified
   * the way loki does (`chrome_laptop_...`); a recognized one becomes the
   * entry's `variant`.
   */
  configurations?: string[];
  /**
   * The `diffingEngine` of the run; `pixelmatch` (the default) fails on any
   * differing pixel, so entries get `maxDiffRatio: 0`. The other engines'
   * limits are not expressed as a pixel share.
   */
  diffingEngine?: 'pixelmatch' | 'looks-same' | 'gm';
  /** `chromeTolerance` (or the target's tolerance) in percent, pixelmatch's per-pixel color threshold times 100. */
  tolerance?: number;
};

/**
 * What loki's default `fileNameFormatter` makes of a name: it slugifies with
 * `transliteration` (`separator: '_'`, `allowedChars: 'a-zA-Z0-9'`), so a run
 * of other characters becomes one `_` and leading and trailing ones are
 * dropped. Non-ASCII letters are transliterated by loki (`é` to `e`), which
 * is not reproduced here.
 */
export const lokiSlug = (text: string) =>
  text.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * Builds a manifest from the folders Loki keeps for its Storybook stories:
 * `.loki/reference/`, `.loki/current/` and `.loki/difference/`, with one
 * `<configuration>_<kind>_<story>.png` per story and configuration. `loki
 * test` writes every story's current image and, where it differs from the
 * reference, its difference image; a current image with no reference is a
 * story that was not recorded (`requireReference`, the default on CI). A
 * reference with no current image was not shot in this run and gets no entry;
 * those are listed under `extra.loki.referencesWithoutShot`. Loki writes no
 * report, so entries are named after the files; a configuration from
 * `configurations` is split off as the `variant`.
 */
export const fromLoki = ({
  referenceDir = '.loki/reference',
  currentDir = '.loki/current',
  differenceDir = '.loki/difference',
  configurations = [],
  diffingEngine = 'pixelmatch',
  tolerance,
  runner,
  extra,
  ...header
}: FromLokiOptions): Manifest => {
  const projectRoot = header.projectRoot;
  const references = resolveInProject(projectRoot, referenceDir);
  const currents = resolveInProject(projectRoot, currentDir);
  const differences = resolveInProject(projectRoot, differenceDir);
  const relativeImages = (dir: string) =>
    listFiles(dir)
      .filter(isImage)
      .map((file) => toPosix(path.relative(dir, file)));
  const currentFiles = relativeImages(currents);
  const current = new Set(currentFiles);
  const referencesWithoutShot = relativeImages(references).filter(
    (rel) => !current.has(rel),
  );
  const slugs = configurations
    .map((name) => [name, lokiSlug(name)] as const)
    .sort(([, a], [, b]) => b.length - a.length);
  const variantOf = (stem: string) =>
    slugs.find(([, slug]) => stem.startsWith(`${slug}_`))?.[0];

  const triples: ImageTriple[] = currentFiles.map((rel) => {
    const stem = rel.replace(/\.[^./]+$/, '');
    const reference = path.join(references, rel);
    const current = path.join(currents, rel);
    const difference = path.join(differences, rel);
    const hasReference = fs.existsSync(reference);
    const hasDifference = fs.existsSync(difference);
    return {
      baseline: reference,
      actual: current,
      diff: hasDifference ? difference : null,
      name: stem,
      // a current image next to its reference without a difference is a story that passed
      status: !hasReference
        ? 'missing-baseline'
        : hasDifference
          ? 'failed'
          : 'passed',
      ...(diffingEngine === 'pixelmatch' && { maxDiffRatio: 0 }),
      ...(tolerance !== undefined && {
        colorThreshold: tolerance / 100,
        colorMetric: 'yiq' as const,
      }),
      variant: variantOf(stem),
    };
  });
  return fromImageTriples({
    ...header,
    runner: runner ?? { name: 'loki' },
    extra:
      referencesWithoutShot.length > 0
        ? { ...extra, loki: { ...extra?.loki, referencesWithoutShot } }
        : extra,
    triples,
  });
};
