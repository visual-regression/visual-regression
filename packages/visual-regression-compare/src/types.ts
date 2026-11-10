import type {
  Manifest,
  ManifestColorMetric,
  ManifestEntry,
  ManifestEntryPlatform,
  ManifestExtra,
  ManifestStatus,
  ManifestViewport,
} from 'visual-regression-manifest';

/** Decoded image: 8-bit RGBA, row by row. */
export type RgbaImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

/** What the engine is given besides the images; must be structured-cloneable (it crosses the worker boundary). */
export type EngineOptions = Record<string, unknown>;

export type EngineResult = {
  diffPixels: number;
  /** `diffPixels / (width * height)` after size handling. */
  diffRatio: number;
  /** Omitted by engines that produce none. */
  diff?: RgbaImage;
  /** Engine-specific score, e.g. an SSIM mean or Resemble's mismatch percentage. */
  score?: { name: string; value: number };
};

/** Both images have the same size by the time an engine sees them (see `SizeMismatch`). */
export type DiffEngine = {
  /** Recorded as `extra.visualRegressionCompare.engine`. */
  name: string;
  /** The manifest's `comparison.colorMetric`. */
  colorMetric: ManifestColorMetric;
  /** The per-pixel color tolerance used, recorded as `comparison.colorThreshold`. */
  colorThreshold?: number;
  compare(
    baseline: RgbaImage,
    actual: RgbaImage,
  ): EngineResult | Promise<EngineResult>;
};

/**
 * A DiffEngine as a module id loads it: the default export is an engine, or a
 * function that makes one from `EngineOptions`.
 */
export type EngineModule =
  DiffEngine | ((options: EngineOptions) => DiffEngine);

/**
 * What to do when baseline and actual differ in size:
 * - `fail`: no pixel comparison; the entry fails and records both sizes, so a
 *   resolution change shows up as what it is.
 * - `pad`: grow both to the larger size with transparent pixels and compare.
 * - `crop`: cut both to the smaller size and compare.
 */
export type SizeMismatch = 'fail' | 'pad' | 'crop';
export type OnMissingBaseline = 'fail' | 'create';
export type UpdatePolicy = 'none' | 'failures-only' | 'all';

export type Limits = {
  /** Largest accepted share of differing pixels, 0..1. Default `0`. */
  maxDiffRatio?: number;
  /** Largest accepted number of differing pixels; the stricter of the two limits wins. */
  maxDiffPixels?: number;
};

export type ImageKind = 'baseline' | 'incoming' | 'actual' | 'diff';

/** A file in a store: its kind and the path relative to that kind's root, with `/` separators. */
export type ImageRef = { kind: ImageKind; path: string };

export type Store = {
  /** `null` when there is no such file. */
  read(ref: ImageRef): Promise<Uint8Array | null>;
  write(ref: ImageRef, bytes: Uint8Array): Promise<void>;
  /** Removing a file that is not there is not an error. */
  remove(ref: ImageRef): Promise<void>;
  /** Every PNG of that kind, sorted. `actual` and `diff` files are never listed as `incoming`. */
  list(kind: 'baseline' | 'incoming'): AsyncIterable<ImageRef>;
  /** Absolute path of the file in the project, for the manifest; `null` for stores that keep files elsewhere. */
  locate(ref: ImageRef): string | null;
};

export type Layout = {
  /** Where the files of the screenshot `name` (a relative path without extension) live, relative to each root. */
  paths(name: string): Record<ImageKind, string>;
  /** The reverse: the name an image of that kind belongs to, `null` for a file the layout does not own. */
  nameOf(kind: ImageKind, path: string): string | null;
};

export type Matcher = {
  /** Where the baseline of an incoming image is (or should be); `null` skips the image. */
  baselineFor(incoming: ImageRef): ImageRef | null;
};

/** Identity of one compared screenshot, as an adapter or the CLI states it. */
export type CompareInput = {
  /** Screenshot name; becomes the file name through the layout (unsafe characters are replaced). */
  name: string;
  actual: Uint8Array;
  test?: { filePath?: string; titlePath?: string[]; retry?: number };
  platform?: ManifestEntryPlatform;
  viewport?: ManifestViewport;
  variant?: string;
  extra?: ManifestExtra;
  /** Capture plus preceding time in milliseconds, recorded as the entry's `duration`. */
  duration?: number;
};

/**
 * What hooks see of one comparison. `attachments` is reserved for extra inputs
 * an engine may want next to the pixels (a DOM snapshot for layout-aware
 * comparison); nothing fills it yet.
 */
export type CompareContext = {
  name: string;
  input: CompareInput;
  attachments?: Record<string, unknown>;
};

export type Measurement =
  | {
      kind: 'compared';
      baselineSize: { width: number; height: number };
      actualSize: { width: number; height: number };
      result: EngineResult;
      /** `pad` or `crop` when the sizes differed. */
      resized?: 'pad' | 'crop';
    }
  | {
      kind: 'size-mismatch';
      baselineSize: { width: number; height: number };
      actualSize: { width: number; height: number };
    }
  | { kind: 'missing-baseline' };

export type Decision = {
  status: ManifestStatus;
  message: string;
  /** Becomes the `visualRegressionCompare` namespace of the entry's `extra`, merged with the compare's own keys. */
  extra?: Record<string, unknown>;
};

export type WritePlan = {
  /** Files to write; a hook may drop or replace entries (a store that keeps baselines elsewhere). */
  write: { ref: ImageRef; bytes: Uint8Array }[];
};

export type Reporter = {
  onEntry?(entry: ManifestEntry): void | Promise<void>;
  onEnd?(manifest: Manifest): void | Promise<void>;
};

export type PluginApi = {
  addEngine(name: string, engine: DiffEngine | EngineModule): void;
  addReporter(reporter: Reporter): void;
  setStore(store: Store): void;
  setLayout(layout: Layout): void;
  setMatcher(matcher: Matcher): void;
  on(
    event: 'beforeCompare',
    fn: (ctx: CompareContext) => void | Promise<void>,
  ): void;
  on(
    event: 'afterCompare',
    fn: (ctx: CompareContext, measurement: Measurement) => void | Promise<void>,
  ): void;
  on(
    event: 'decide',
    fn: (
      ctx: CompareContext,
      decision: Decision,
    ) => Decision | Promise<Decision>,
  ): void;
  on(
    event: 'beforeWrite',
    fn: (
      ctx: CompareContext,
      plan: WritePlan,
    ) => WritePlan | Promise<WritePlan>,
  ): void;
  on(event: 'end', fn: (manifest: Manifest) => void | Promise<void>): void;
};

export type Plugin = {
  name: string;
  setup(api: PluginApi): void | Promise<void>;
};
