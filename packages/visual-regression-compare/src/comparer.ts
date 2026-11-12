import fs from 'fs';
import path from 'path';
import {
  ManifestWriter,
  IMAGE_SUFFIX,
  getManifestFileName,
  maxRatioFrom,
  type Manifest,
  type ManifestEntry,
  type ManifestHeaderInput,
  type ManifestStatus,
} from 'visual-regression-manifest';
import { loadEngine } from './engines';
import { runCompare, type JobResult } from './job';
import { WorkerPool } from './pool';
import { manifestLayout, samePathMatcher, sanitizeName } from './layout';
import { fileStore } from './store';
import { createRegistry, type Registry } from './plugins';
import type {
  CompareContext,
  CompareFiles,
  CompareInput,
  CompareOptions,
  CompareResult,
  Decision,
  DiffEngine,
  EngineOptions,
  ImagePart,
  ImageRef,
  Layout,
  Limits,
  Matcher,
  Measurement,
  OnMissingBaseline,
  Plugin,
  Reporter,
  SizeMismatch,
  Store,
  UpdatePolicy,
  WritePlan,
} from './types';

export const TOOL_NAME = 'visual-regression-compare';

const packageVersion = () => {
  try {
    const text = fs.readFileSync(
      new URL('../package.json', import.meta.url),
      'utf8',
    );
    return (JSON.parse(text) as { version?: string }).version;
  } catch {
    return undefined;
  }
};

export type ComparerOptions = {
  /**
   * A built-in engine name, a module id (`./my-engine.mjs`, a package) or an
   * engine object. Names and ids run in worker threads; an object runs in the
   * main thread. Default `pixelmatch`.
   */
  engine?: string | DiffEngine;
  /** Passed to the engine factory; must be structured-cloneable. */
  engineOptions?: EngineOptions;
  limits?: Limits;
  /** What a screenshot without a baseline becomes: `missing-baseline` (`fail`) or a created baseline. Default `fail`. */
  onMissingBaseline?: OnMissingBaseline;
  /** Default `fail`: no padding, the size change itself is the result. */
  onSizeMismatch?: SizeMismatch;
  /** Overwrite baselines: never (default), when the comparison failed, or whenever the pixels differ. */
  update?: UpdatePolicy;
  store: Store;
  layout?: Layout;
  matcher?: Matcher;
  manifest: {
    /**
     * A manifest writer the caller owns, for a runner that builds the header
     * (CI, run and reproduction metadata, one file per worker) itself. The
     * other keys of this object are then ignored.
     */
    writer?: ManifestWriter;
    /** Where the manifest is written; default `visual-regression-manifest.compare.json` in the project root. */
    path?: string;
    /** Absolute path every manifest path is relative to; default the working directory. */
    projectRoot?: string;
    tool?: ManifestHeaderInput['tool'];
    runner?: ManifestHeaderInput['runner'];
    /** Metadata recorded on every entry that does not state its own. */
    platform?: CompareInput['platform'];
    variant?: string;
  };
  plugins?: Plugin[];
  reporters?: Reporter[];
  /**
   * Worker threads for decoding and comparing, and parallel reads in
   * `compareAll`. Default `1`: everything runs in the calling thread, which is
   * what a runner adapter wants (its own workers already use the CPUs). The
   * command line passes the CPU count.
   */
  concurrency?: number;
  /** The built worker module; found next to this file in the published package. */
  workerFile?: URL | string;
};

type Settings = {
  limits: Limits;
  engineOptions: EngineOptions;
  update: UpdatePolicy;
  onMissingBaseline: OnMissingBaseline;
  onSizeMismatch: SizeMismatch;
};

/** `actual` and `diff` beside the baseline unless the caller named them. */
const withDefaults = ({ baseline, actual, diff }: CompareFiles) => {
  const stem = baseline.replace(/\.png$/, '');
  return {
    baseline,
    actual: actual ?? `${stem}${IMAGE_SUFFIX.actual}.png`,
    diff: diff ?? `${stem}${IMAGE_SUFFIX.diff}.png`,
  };
};

const DEFAULT_WORKER = new URL('./worker.js', import.meta.url);

const percent = (ratio: number) => `${Number((ratio * 100).toPrecision(3))}%`;

const sizeText = ({ width, height }: { width: number; height: number }) =>
  `${width}x${height}`;

export class Comparer {
  readonly writer: ManifestWriter;
  private readonly projectRoot: string;
  private readonly store: () => Store;
  private readonly layout: () => Layout;
  private readonly matcher: () => Matcher;
  private readonly pool: WorkerPool;
  private readonly registry: Registry;
  private readonly ready: Promise<void>;
  private readonly engines = new Map<string, Promise<DiffEngine>>();
  private closed = false;

  constructor(private readonly options: ComparerOptions) {
    this.projectRoot = options.manifest.writer
      ? options.manifest.writer.projectRoot
      : path.resolve(options.manifest.projectRoot ?? process.cwd());
    this.registry = createRegistry({
      store: options.store,
      layout: options.layout ?? manifestLayout(),
      matcher: options.matcher ?? samePathMatcher(),
      reporters: options.reporters ?? [],
    });
    this.store = () => this.registry.store;
    this.layout = () => this.registry.layout;
    this.matcher = () => this.registry.matcher;
    this.ready = this.registry.setup(options.plugins ?? []);
    this.writer = options.manifest.writer ?? this.createWriter(options);
    this.pool = new WorkerPool(
      options.concurrency ?? 1,
      options.workerFile ?? DEFAULT_WORKER,
    );
  }

  private createWriter(options: ComparerOptions) {
    const manifestPath =
      options.manifest.path ??
      path.join(this.projectRoot, getManifestFileName('compare'));
    return new ManifestWriter(
      path.resolve(this.projectRoot, manifestPath),
      {
        projectRoot: this.projectRoot,
        tool: options.manifest.tool ?? {
          name: TOOL_NAME,
          version: packageVersion(),
        },
        runner: options.manifest.runner ?? { name: TOOL_NAME },
        options: {
          engine:
            typeof options.engine === 'object'
              ? options.engine.name
              : (options.engine ?? 'pixelmatch'),
          engineOptions: options.engineOptions ?? {},
          limits: options.limits ?? {},
          onMissingBaseline: options.onMissingBaseline ?? 'fail',
          onSizeMismatch: options.onSizeMismatch ?? 'fail',
          update: options.update ?? 'none',
        },
      },
      { writeDelayMs: 200 },
    );
  }

  /** The comparer's settings with the overrides of one call applied. */
  private settings(call: CompareOptions = {}): Settings {
    const o = this.options;
    return {
      limits: call.limits ?? o.limits ?? {},
      engineOptions: { ...o.engineOptions, ...call.engineOptions },
      update: call.update ?? o.update ?? 'none',
      onMissingBaseline:
        call.onMissingBaseline ?? o.onMissingBaseline ?? 'fail',
      onSizeMismatch: call.onSizeMismatch ?? o.onSizeMismatch ?? 'fail',
    };
  }

  /** The engine as the main thread knows it: for its name and metric, and to run it when it is an object or came from a plugin. */
  private resolveEngine(engineOptions: EngineOptions): Promise<DiffEngine> {
    const key = JSON.stringify(engineOptions);
    let engine = this.engines.get(key);
    if (!engine) {
      engine = (async () => {
        await this.ready;
        const { engine: spec = 'pixelmatch' } = this.options;
        if (typeof spec === 'object') return spec;
        const registered = this.registry.engines.get(spec);
        if (typeof registered === 'object') return registered;
        if (typeof registered === 'function') return registered(engineOptions);
        return loadEngine(spec, engineOptions);
      })();
      this.engines.set(key, engine);
    }
    return engine;
  }

  private async measure(
    baseline: Uint8Array,
    actual: Uint8Array,
    engine: DiffEngine,
    cfg: Settings,
    include: ImagePart[],
  ): Promise<JobResult> {
    const { engine: spec = 'pixelmatch' } = this.options;
    const inMainThread =
      typeof spec === 'object' || this.registry.engines.has(spec);
    const job = {
      baseline,
      actual,
      onSizeMismatch: cfg.onSizeMismatch,
      include,
    };
    if (inMainThread) return runCompare(job, engine);
    return this.pool.run({
      ...job,
      engine: { id: spec, options: cfg.engineOptions, cwd: process.cwd() },
    });
  }

  /** Compares one screenshot, decides, writes the files and records the manifest entry. */
  async compareImage(input: CompareInput): Promise<ManifestEntry> {
    return (await this.compare(input)).entry;
  }

  /**
   * `compareImage` that can also hand back the compared images as PNG bytes,
   * for a runner that shows them (a review UI). `include` names the parts;
   * the diff is encoded anyway, the other two cost nothing when the sizes
   * match.
   */
  async compare(
    input: CompareInput,
    { include = [] }: { include?: ImagePart[] } = {},
  ): Promise<CompareResult> {
    await this.ready;
    const name = sanitizeName(input.name);
    if (input.files) {
      return this.compareAt(
        input,
        name,
        { kind: 'baseline', path: 'baseline' },
        include,
      );
    }
    const baseline: ImageRef = {
      kind: 'baseline',
      path: this.layout().paths(name).baseline,
    };
    return this.compareAt(input, name, baseline, include);
  }

  private compareAt(
    input: CompareInput,
    name: string,
    baselineRef: ImageRef,
    include: ImagePart[],
  ): Promise<CompareResult> {
    const store = input.files
      ? fileStore(withDefaults(input.files))
      : this.store();
    const names = input.files
      ? { actual: 'actual', diff: 'diff' }
      : this.layout().paths(name);
    return this.compareWith(input, name, baselineRef, include, store, names);
  }

  private async compareWith(
    input: CompareInput,
    name: string,
    baselineRef: ImageRef,
    include: ImagePart[],
    store: Store,
    names: { actual: string; diff: string },
  ): Promise<CompareResult> {
    const cfg = this.settings(input.options);
    const started = Date.now();
    const ctx: CompareContext = { name, input };
    for (const fn of this.registry.hooks.beforeCompare) await fn(ctx);

    const engine = await this.resolveEngine(cfg.engineOptions);
    const baselineBytes = await store.read(baselineRef);
    let measurement: Measurement;
    let diffPng: Uint8Array | undefined;
    const images: CompareResult['images'] = {};
    if (baselineBytes === null) {
      measurement = { kind: 'missing-baseline' };
      if (include.includes('actual')) images.actual = input.actual;
    } else {
      let job: JobResult;
      try {
        job = await this.measure(
          baselineBytes,
          input.actual,
          engine,
          cfg,
          include,
        );
      } catch (error) {
        throw new Error(`${name}: ${(error as Error).message}`, {
          cause: error,
        });
      }
      measurement =
        job.kind === 'size-mismatch'
          ? job
          : {
              kind: 'compared',
              baselineSize: job.baselineSize,
              actualSize: job.actualSize,
              resized: job.resized,
              result: {
                diffPixels: job.diffPixels,
                diffRatio: job.diffRatio,
                score: job.score,
              },
            };
      diffPng = job.kind === 'compared' ? job.diffPng : undefined;
      if (job.kind === 'compared') {
        if (include.includes('diff') && diffPng) images.diff = diffPng;
        if (job.baselinePng) images.baseline = job.baselinePng;
        if (job.actualPng) images.actual = job.actualPng;
      }
    }
    for (const fn of this.registry.hooks.afterCompare)
      await fn(ctx, measurement);

    const limit = this.limitFor(measurement, cfg);
    let decision = this.decide(measurement, limit, cfg);
    for (const fn of this.registry.hooks.decide) {
      decision = await fn(ctx, decision);
    }

    const refs = {
      actual: { kind: 'actual', path: names.actual } as ImageRef,
      diff: { kind: 'diff', path: names.diff } as ImageRef,
    };
    // files of an earlier run of this screenshot must not outlive it
    await store.remove(refs.actual);
    await store.remove(refs.diff);

    let plan: WritePlan = { write: [] };
    const status = decision.status;
    if (status === 'failed' || status === 'missing-baseline') {
      plan.write.push({ ref: refs.actual, bytes: input.actual });
      if (diffPng) plan.write.push({ ref: refs.diff, bytes: diffPng });
    } else if (
      status === 'created' ||
      status === 'updated' ||
      status === 'approved'
    ) {
      plan.write.push({ ref: baselineRef, bytes: input.actual });
    }
    for (const fn of this.registry.hooks.beforeWrite)
      plan = await fn(ctx, plan);
    for (const { ref, bytes } of plan.write) await store.write(ref, bytes);

    const entry = this.record(
      store,
      cfg,
      input,
      name,
      baselineRef,
      refs,
      measurement,
      decision,
      limit,
      engine,
      Date.now() - started,
    );
    for (const reporter of this.registry.reporters)
      await reporter.onEntry?.(entry);
    return { entry, images };
  }

  /** `maxDiffRatio` of the entry: the stricter of the ratio and the pixel count, for the size actually compared. */
  private limitFor(measurement: Measurement, cfg: Settings) {
    if (measurement.kind !== 'compared') return undefined;
    const { baselineSize: b, actualSize: a, resized } = measurement;
    const size =
      resized === 'pad'
        ? {
            width: Math.max(a.width, b.width),
            height: Math.max(a.height, b.height),
          }
        : resized === 'crop'
          ? {
              width: Math.min(a.width, b.width),
              height: Math.min(a.height, b.height),
            }
          : a;
    const { maxDiffRatio, maxDiffPixels } = cfg.limits;
    // a pixel limit alone is the limit; the default exactness only applies to neither
    return (
      maxRatioFrom({ ratio: maxDiffRatio, pixels: maxDiffPixels }, size) ?? 0
    );
  }

  private decide(
    measurement: Measurement,
    limit: number | undefined,
    { update, onMissingBaseline }: Settings,
  ): Decision {
    if (measurement.kind === 'missing-baseline') {
      return onMissingBaseline === 'create'
        ? {
            status: 'created',
            message: 'Baseline image was created from the actual screenshot.',
          }
        : {
            status: 'missing-baseline',
            message: 'There is no baseline image.',
          };
    }
    if (measurement.kind === 'size-mismatch') {
      const message = `The size changed: baseline ${sizeText(measurement.baselineSize)}, actual ${sizeText(measurement.actualSize)}.`;
      return update === 'none'
        ? { status: 'failed', message }
        : {
            status: 'updated',
            message: `${message} Baseline image was replaced with the actual screenshot.`,
          };
    }
    const { diffPixels, diffRatio } = measurement.result;
    const passed = diffRatio <= (limit ?? 0);
    const resized = measurement.resized
      ? ` Both images were ${measurement.resized === 'pad' ? 'padded' : 'cropped'} to the same size (baseline ${sizeText(measurement.baselineSize)}, actual ${sizeText(measurement.actualSize)}).`
      : '';
    const counts = `${diffPixels} pixels (${percent(diffRatio)}) differ`;
    if (passed && !(update === 'all' && diffPixels > 0)) {
      return {
        status: 'passed',
        message:
          diffPixels === 0
            ? `Identical to the baseline.${resized}`
            : `${counts}, within the limit of ${percent(limit ?? 0)}.${resized}`,
      };
    }
    if (update !== 'none') {
      return {
        status: 'updated',
        message: `${counts}. Baseline image was replaced with the actual screenshot.${resized}`,
      };
    }
    return {
      status: 'failed',
      message: `${counts}; the limit is ${percent(limit ?? 0)}.${resized}`,
    };
  }

  private record(
    store: Store,
    cfg: Settings,
    input: CompareInput,
    name: string,
    baselineRef: ImageRef,
    refs: { actual: ImageRef; diff: ImageRef },
    measurement: Measurement,
    decision: Decision,
    limit: number | undefined,
    engine: DiffEngine,
    duration: number,
  ): ManifestEntry {
    const where = (ref: ImageRef) =>
      store.locate(ref) ?? path.join(this.projectRoot, ref.path);
    const status: ManifestStatus = decision.status;
    const compared = measurement.kind === 'compared' ? measurement : undefined;
    const sized =
      measurement.kind !== 'missing-baseline' ? measurement : undefined;
    const { maxDiffRatio = 0 } = cfg.limits;
    const baselineRoot = path.relative(
      this.projectRoot,
      input.files
        ? path.dirname(input.files.baseline)
        : where({ kind: 'baseline', path: '' }),
    );
    const meta = {
      engine: engine.name,
      ...(compared && { diffPixels: compared.result.diffPixels }),
      ...(compared?.result.score && { score: compared.result.score }),
      ...(compared?.resized && { sizeMismatch: compared.resized }),
      ...(measurement.kind === 'size-mismatch' && {
        sizeMismatch: 'fail',
        baselineSize: measurement.baselineSize,
        actualSize: measurement.actualSize,
      }),
      ...decision.extra,
    };
    return this.writer.record({
      actualPath: where(refs.actual),
      baselinePath: where(baselineRef),
      diffPath: where(refs.diff),
      name,
      testFile: input.test?.filePath,
      titlePath: input.test?.titlePath,
      retry: input.test?.retry,
      status,
      diffRatio:
        measurement.kind === 'size-mismatch' ? 1 : compared?.result.diffRatio,
      maxDiffRatio: limit ?? maxDiffRatio,
      colorThreshold: engine.colorThreshold,
      colorMetric: engine.colorMetric,
      baselineWritten:
        status === 'created' || status === 'updated' || status === 'approved',
      message: decision.message,
      baselineSize: sized?.baselineSize,
      actualSize: sized?.actualSize,
      platform: input.platform ?? this.options.manifest.platform,
      viewport: input.viewport,
      variant: input.variant ?? this.options.manifest.variant,
      extra: { ...input.extra, visualRegressionCompare: meta },
      ...input.entry,
      options: input.entry?.options ?? {
        imagesPath: `${baselineRoot || '.'}/{name}.png`,
        maxDiffRatio,
        diffConfig: { engine: engine.name, ...cfg.engineOptions },
        createMissingImages: cfg.onMissingBaseline === 'create',
        updateImages:
          cfg.update === 'failures-only'
            ? 'failures-only'
            : cfg.update === 'all',
      },
      duration: input.duration ?? duration,
    });
  }

  /** Compares every incoming image of the store against its baseline. */
  async compareAll(): Promise<Manifest> {
    await this.ready;
    const refs: ImageRef[] = [];
    for await (const ref of this.store().list('incoming')) refs.push(ref);
    const queue = [...refs];
    const workers = Math.max(1, this.options.concurrency ?? 1);
    const failures: Error[] = [];
    await Promise.all(
      Array.from({ length: Math.min(workers, queue.length) }, async () => {
        for (let ref = queue.shift(); ref; ref = queue.shift()) {
          try {
            await this.compareIncoming(ref);
          } catch (error) {
            failures.push(error as Error);
          }
        }
      }),
    );
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `${failures.length} image${failures.length === 1 ? '' : 's'} could not be compared:\n${failures.map((f) => `  ${f.message}`).join('\n')}`,
      );
    }
    return this.writer.toJSON();
  }

  private async compareIncoming(incoming: ImageRef) {
    const baselineRef = this.matcher().baselineFor(incoming);
    if (!baselineRef) return;
    const name =
      this.layout().nameOf('baseline', baselineRef.path) ??
      baselineRef.path.replace(/\.png$/, '');
    const actual = await this.store().read(incoming);
    if (actual === null) return;
    await this.compareAt({ name, actual }, name, baselineRef, []);
  }

  /** Flushes the manifest and ends the reporters. Call once, after the last comparison. */
  async close(): Promise<Manifest> {
    await this.ready;
    if (!this.closed) {
      this.closed = true;
      this.writer.write();
      this.writer.flush();
      await this.pool.close();
      for (const fn of this.registry.hooks.end) await fn(this.writer.toJSON());
      for (const reporter of this.registry.reporters) {
        await reporter.onEnd?.(this.writer.toJSON());
      }
    }
    return this.writer.toJSON();
  }
}

export const createComparer = (options: ComparerOptions) =>
  new Comparer(options);
