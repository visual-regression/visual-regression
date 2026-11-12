import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  ManifestWriter,
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
import { createRegistry, type Registry } from './plugins';
import type {
  CompareContext,
  CompareInput,
  Decision,
  DiffEngine,
  EngineOptions,
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
  /** Worker threads for decoding and comparing; default the CPU count. */
  concurrency?: number;
  /** The built worker module; found next to this file in the published package. */
  workerFile?: URL | string;
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
  private engine: Promise<DiffEngine> | undefined;
  private closed = false;

  constructor(private readonly options: ComparerOptions) {
    this.projectRoot = path.resolve(
      options.manifest.projectRoot ?? process.cwd(),
    );
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
    const manifestPath =
      options.manifest.path ??
      path.join(this.projectRoot, getManifestFileName('compare'));
    this.writer = new ManifestWriter(
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
    this.pool = new WorkerPool(
      options.concurrency ?? os.cpus().length,
      options.workerFile ?? DEFAULT_WORKER,
    );
  }

  /** The engine as the main thread knows it: for its name and metric, and to run it when it is an object or came from a plugin. */
  private resolveEngine(): Promise<DiffEngine> {
    this.engine ??= (async () => {
      await this.ready;
      const { engine = 'pixelmatch', engineOptions = {} } = this.options;
      if (typeof engine === 'object') return engine;
      const registered = this.registry.engines.get(engine);
      if (typeof registered === 'object') return registered;
      if (typeof registered === 'function') return registered(engineOptions);
      return loadEngine(engine, engineOptions);
    })();
    return this.engine;
  }

  private async measure(
    baseline: Uint8Array,
    actual: Uint8Array,
    engine: DiffEngine,
  ): Promise<JobResult> {
    const { engine: spec = 'pixelmatch', engineOptions } = this.options;
    const inMainThread =
      typeof spec === 'object' || this.registry.engines.has(spec);
    const onSizeMismatch = this.options.onSizeMismatch ?? 'fail';
    if (inMainThread) {
      return runCompare({ baseline, actual, onSizeMismatch }, engine);
    }
    return this.pool.run({
      baseline,
      actual,
      onSizeMismatch,
      engine: { id: spec, options: engineOptions, cwd: process.cwd() },
    });
  }

  /** Compares one screenshot, decides, writes the files and records the manifest entry. */
  async compareImage(input: CompareInput): Promise<ManifestEntry> {
    await this.ready;
    const name = sanitizeName(input.name);
    const baseline: ImageRef = {
      kind: 'baseline',
      path: this.layout().paths(name).baseline,
    };
    return this.compareAt(input, name, baseline);
  }

  private async compareAt(
    input: CompareInput,
    name: string,
    baselineRef: ImageRef,
  ): Promise<ManifestEntry> {
    const started = Date.now();
    const ctx: CompareContext = { name, input };
    for (const fn of this.registry.hooks.beforeCompare) await fn(ctx);

    const engine = await this.resolveEngine();
    const baselineBytes = await this.store().read(baselineRef);
    let measurement: Measurement;
    let diffPng: Uint8Array | undefined;
    if (baselineBytes === null) {
      measurement = { kind: 'missing-baseline' };
    } else {
      let job: JobResult;
      try {
        job = await this.measure(baselineBytes, input.actual, engine);
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
    }
    for (const fn of this.registry.hooks.afterCompare)
      await fn(ctx, measurement);

    const limit = this.limitFor(measurement);
    let decision = this.decide(measurement, limit);
    for (const fn of this.registry.hooks.decide) {
      decision = await fn(ctx, decision);
    }

    const names = this.layout().paths(name);
    const refs = {
      actual: { kind: 'actual', path: names.actual } as ImageRef,
      diff: { kind: 'diff', path: names.diff } as ImageRef,
    };
    // files of an earlier run of this screenshot must not outlive it
    await this.store().remove(refs.actual);
    await this.store().remove(refs.diff);

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
    for (const { ref, bytes } of plan.write)
      await this.store().write(ref, bytes);

    const entry = this.record(
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
    return entry;
  }

  /** `maxDiffRatio` of the entry: the stricter of the ratio and the pixel count, for the size actually compared. */
  private limitFor(measurement: Measurement) {
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
    const { maxDiffRatio, maxDiffPixels } = this.options.limits ?? {};
    // a pixel limit alone is the limit; the default exactness only applies to neither
    return (
      maxRatioFrom({ ratio: maxDiffRatio, pixels: maxDiffPixels }, size) ?? 0
    );
  }

  private decide(
    measurement: Measurement,
    limit: number | undefined,
  ): Decision {
    const { update = 'none', onMissingBaseline = 'fail' } = this.options;
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
    const store = this.store();
    const where = (ref: ImageRef) =>
      store.locate(ref) ?? path.join(this.projectRoot, ref.path);
    const status: ManifestStatus = decision.status;
    const compared = measurement.kind === 'compared' ? measurement : undefined;
    const sized =
      measurement.kind !== 'missing-baseline' ? measurement : undefined;
    const { maxDiffRatio = 0 } = this.options.limits ?? {};
    const baselineRoot = path.relative(
      this.projectRoot,
      where({ kind: 'baseline', path: '' }),
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
      options: {
        imagesPath: `${baselineRoot || '.'}/{name}.png`,
        maxDiffRatio,
        diffConfig: { engine: engine.name, ...this.options.engineOptions },
        createMissingImages: this.options.onMissingBaseline === 'create',
        updateImages:
          this.options.update === 'failures-only'
            ? 'failures-only'
            : this.options.update === 'all',
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
    const workers = Math.max(1, this.options.concurrency ?? os.cpus().length);
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
    await this.compareAt({ name, actual }, name, baselineRef);
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
