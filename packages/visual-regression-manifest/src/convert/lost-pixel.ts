import fs from 'fs';
import path from 'path';
import { ManifestBuilder, type ManifestHeaderInput } from '../builder';
import { resolveInProject, toPosix } from '../paths';
import { readPngSize } from '../png';
import type { Manifest, ManifestRunner, ManifestStatus } from '../types';
import { isImage, listFiles } from './walk';

/** One comparison in Lost Pixel's `meta.json`, keyed by the shot id (the file name for page, ladle, histoire and plain story shots). */
export type LostPixelMetaItem = {
  pixelDifference: number;
  /** A 0..1 ratio, despite the name. */
  pixelDifferencePercentage: number;
  isWithinThreshold: boolean;
};

/** `<imagePathCurrent>/meta.json`, written when the run had `LOST_PIXEL_GENERATE_META=true` (or the `meta` argument). Shots without a baseline are not in it. */
export type LostPixelMeta = Record<string, LostPixelMetaItem>;

export type FromLostPixelOptions = Omit<ManifestHeaderInput, 'runner'> & {
  /** Recorded as `runner`; defaults to `{ name: 'lost-pixel' }`. */
  runner?: ManifestRunner;
  /** `imagePathBaseline`, relative to `projectRoot`. */
  baselineDir?: string;
  /** `imagePathCurrent`. */
  currentDir?: string;
  /** `imagePathDifference`. */
  differenceDir?: string;
  /**
   * The run's `meta.json`: the parsed object, its path, or `false` to ignore
   * one. By default the file is read from the current folder when it exists.
   * It carries every comparison's pixel difference and verdict; without it
   * the files alone tell the status.
   */
  meta?: LostPixelMeta | string | false;
  /**
   * The run was `lost-pixel update`: the baselines of changed and new shots
   * were written from the current images, so they are `updated` and
   * `created`. Without `meta` a created baseline looks like a passed shot.
   */
  update?: boolean;
  /** The `threshold` of the run: a 0..1 share of the pixels, or a pixel count from 1 up; recorded as `maxDiffRatio`. */
  threshold?: number;
};

const BROWSERS = ['chromium', 'firefox', 'webkit'];

/** `home__[w320px|chromium]` -> the shot name and the breakpoint and browser labels. */
const parseLabel = (stem: string) => {
  const match = /^(.*)__\[([^\]]*)\]$/.exec(stem);
  if (!match) return { shotName: stem, labels: [] as string[] };
  return { shotName: match[1], labels: match[2].split('|').filter(Boolean) };
};

/**
 * Builds a manifest from the folders Lost Pixel keeps in its `generateOnly`
 * mode: `.lostpixel/baseline/`, `.lostpixel/current/` (written for every shot
 * of a run, after emptying the folder) and `.lostpixel/difference/` (written
 * for a shot over its threshold). A current image without a baseline is a
 * shot the run could not compare (`missing-baseline`); a baseline without a
 * current image was not shot in this run and gets no entry, they are listed
 * under `extra.lostPixel.baselinesWithoutShot`. With the run's `meta.json`
 * (`LOST_PIXEL_GENERATE_META=true`) every entry carries its pixel difference
 * as `diffRatio`, and an `update` run tells `created` from `passed`.
 */
export const fromLostPixel = ({
  baselineDir = '.lostpixel/baseline',
  currentDir = '.lostpixel/current',
  differenceDir = '.lostpixel/difference',
  meta,
  update = false,
  threshold,
  runner,
  extra,
  ...header
}: FromLostPixelOptions): Manifest => {
  const projectRoot = header.projectRoot;
  const baselines = resolveInProject(projectRoot, baselineDir);
  const currents = resolveInProject(projectRoot, currentDir);
  const differences = resolveInProject(projectRoot, differenceDir);
  const relativeImages = (dir: string) =>
    listFiles(dir)
      .filter(isImage)
      .map((file) => toPosix(path.relative(dir, file)));
  const currentFiles = relativeImages(currents);
  const current = new Set(currentFiles);
  const baselinesWithoutShot = relativeImages(baselines).filter(
    (rel) => !current.has(rel),
  );

  const metaFile =
    typeof meta === 'string'
      ? resolveInProject(projectRoot, meta)
      : meta === undefined
        ? path.join(currents, 'meta.json')
        : null;
  const results: LostPixelMeta | undefined =
    meta && typeof meta === 'object'
      ? meta
      : metaFile && fs.existsSync(metaFile)
        ? (JSON.parse(fs.readFileSync(metaFile, 'utf8')) as LostPixelMeta)
        : undefined;

  const builder = new ManifestBuilder({
    ...header,
    runner: runner ?? { name: 'lost-pixel' },
    extra:
      baselinesWithoutShot.length > 0
        ? {
            ...extra,
            lostPixel: { ...extra?.lostPixel, baselinesWithoutShot },
          }
        : extra,
  });
  const hostPlatform = builder.header.platform.osPlatform;

  for (const rel of currentFiles) {
    const stem = rel.replace(/\.[^./]+$/, '');
    const baseline = path.join(baselines, rel);
    const actual = path.join(currents, rel);
    const difference = path.join(differences, rel);
    const hasBaseline = fs.existsSync(baseline);
    const hasDifference = fs.existsSync(difference);
    const result = results?.[stem];
    // the files: a difference image means the shot was over its threshold;
    // the meta file says so directly and knows which shots had no baseline
    // to compare against before an update wrote one
    const changed = result ? !result.isWithinThreshold : hasDifference;
    const status: ManifestStatus = !hasBaseline
      ? 'missing-baseline'
      : update
        ? results && !result
          ? 'created'
          : changed
            ? 'updated'
            : 'passed'
        : changed
          ? 'failed'
          : 'passed';
    const { labels } = parseLabel(stem);
    const browserName = labels.find((label) => BROWSERS.includes(label));
    const baselineSize = readPngSize(baseline);
    const actualSize = readPngSize(actual);
    builder.record({
      actualPath: actual,
      baselinePath: baseline,
      diffPath: hasDifference ? difference : null,
      name: stem,
      status,
      diffRatio: result?.pixelDifferencePercentage,
      maxDiffRatio:
        threshold === undefined
          ? undefined
          : threshold < 1
            ? threshold
            : (() => {
                const size = actualSize ?? baselineSize;
                return size
                  ? Math.min(1, threshold / (size.width * size.height))
                  : undefined;
              })(),
      baselineWritten: status === 'created' || status === 'updated',
      baselineSize,
      actualSize,
      // the breakpoint and browser labels tell shots of one page apart
      variant: labels.length > 0 ? labels.join('|') : undefined,
      platform: browserName
        ? { osPlatform: hostPlatform, browser: { name: browserName } }
        : undefined,
      extra: result && { lostPixel: result },
    });
  }
  return builder.toJSON();
};
