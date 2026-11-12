import path from 'path';
import type { Manifest, ManifestEntry } from 'visual-regression-manifest';
import { collect, forEachSeries, mapLimit, once, pipe, runAll } from './async';
import { acceptedRatio, decide } from './decide';
import { createEngineResolver, runsInWorker } from './engine';
import { entryInput, locator, projectPath } from './entry';
import { runCompare } from './job';
import { manifestLayout, samePathMatcher, sanitizeName } from './layout';
import { createManifestWriter } from './manifest';
import { imagesOf, toMeasurement } from './measure';
import { englishMessages } from './messages';
import { baselineWritten, planWrites } from './plan';
import { createRegistry } from './plugins';
import { createWorkerPool } from './pool';
import { resolveSettings, type Settings } from './settings';
import { fileStore, withDefaultFiles } from './store';
import type {
  CompareContext,
  CompareInput,
  CompareResult,
  ComparerOptions,
  Decision,
  DiffEngine,
  ImagePart,
  ImageRef,
  Measurement,
  Store,
  WritePlan,
} from './types';

export { TOOL_NAME } from './manifest';

const DEFAULT_WORKER = new URL('./worker.js', import.meta.url);

/** One screenshot, resolved to where its files are and what it runs with. */
type Call = {
  input: CompareInput;
  name: string;
  include: readonly ImagePart[];
  settings: Settings;
  store: Store;
  baseline: ImageRef;
  actual: ImageRef;
  diff: ImageRef;
};

export type Comparer = ReturnType<typeof createComparer>;

/**
 * Compares screenshots with their baselines. One comparer is one manifest: it
 * records every comparison into it and `close` flushes it.
 */
export const createComparer = (options: ComparerOptions) => {
  const projectRoot =
    options.manifest.writer?.projectRoot ??
    path.resolve(options.manifest.projectRoot ?? process.cwd());
  const registry = createRegistry({
    store: options.store,
    layout: options.layout ?? manifestLayout(),
    matcher: options.matcher ?? samePathMatcher(),
    reporters: options.reporters ?? [],
  });
  const ready = registry.setup(options.plugins ?? []);
  const messages = { ...englishMessages, ...options.messages };
  const writer =
    options.manifest.writer ?? createManifestWriter(options, projectRoot);
  const concurrency = options.concurrency ?? 1;
  const pool = createWorkerPool(
    concurrency,
    options.workerFile ?? DEFAULT_WORKER,
  );
  const resolveEngine = createEngineResolver({
    spec: options.engine,
    registry,
    ready,
  });
  const { hooks } = registry;

  /** The file set and settings of a screenshot: named by the caller, or placed by the layout. */
  const callFor = (
    input: CompareInput,
    include: readonly ImagePart[],
    baseline?: ImageRef,
  ): Call => {
    const name = sanitizeName(input.name);
    const settings = resolveSettings(options, input.options);
    if (input.files) {
      return {
        input,
        name,
        include,
        settings,
        store: fileStore(withDefaultFiles(input.files)),
        baseline: { kind: 'baseline', path: 'baseline' },
        actual: { kind: 'actual', path: 'actual' },
        diff: { kind: 'diff', path: 'diff' },
      };
    }
    const paths = registry.layout.paths(name);
    return {
      input,
      name,
      include,
      settings,
      store: registry.store,
      baseline: baseline ?? { kind: 'baseline', path: paths.baseline },
      actual: { kind: 'actual', path: paths.actual },
      diff: { kind: 'diff', path: paths.diff },
    };
  };

  const compareBytes = (
    { input, name, settings }: Call,
    engine: DiffEngine,
    baseline: Uint8Array,
    include: readonly ImagePart[],
  ) => {
    const job = {
      baseline,
      actual: input.actual,
      onSizeMismatch: settings.onSizeMismatch,
      include: [...include],
    };
    return (
      runsInWorker(options.engine, registry)
        ? pool.run({
            ...job,
            engine: {
              id: options.engine ?? 'pixelmatch',
              options: settings.engineOptions,
              cwd: process.cwd(),
            },
          })
        : runCompare(job, engine)
    ).catch((error: Error) => {
      throw new Error(`${name}: ${error.message}`, { cause: error });
    });
  };

  /** What the screenshot looks like next to its baseline: compared, replaced as it is, or without one. */
  const measure = async (
    call: Call,
    engine: DiffEngine,
  ): Promise<{
    measurement: Measurement;
    images: CompareResult['images'];
    diffPng?: Uint8Array;
  }> => {
    const { input, include, settings } = call;
    const screenshot = include.includes('actual')
      ? { actual: input.actual }
      : {};
    const baseline = await call.store.read(call.baseline);
    if (baseline === null) {
      return { measurement: { kind: 'missing-baseline' }, images: screenshot };
    }
    if (settings.update === 'all') {
      return { measurement: { kind: 'replaced' }, images: screenshot };
    }
    const job = await compareBytes(call, engine, baseline, include);
    return {
      measurement: toMeasurement(job),
      images: imagesOf(job, include),
      diffPng: job.kind === 'compared' ? job.diffPng : undefined,
    };
  };

  const compareCall = async (call: Call): Promise<CompareResult> => {
    const { input, name, settings, store } = call;
    const started = Date.now();
    const ctx: CompareContext = { name, input };
    await runAll(hooks.beforeCompare, ctx);

    const engine = await resolveEngine(settings.engineOptions);
    const { measurement, images, diffPng } = await measure(call, engine);
    await runAll(hooks.afterCompare, ctx, measurement);

    const where = locator(store, projectRoot);
    const limit = acceptedRatio(measurement, settings.limits);
    const decision = await pipe(
      decide({
        measurement,
        limit,
        settings,
        messages,
        baselinePath: projectPath(projectRoot, where(call.baseline)),
      }),
      hooks.decide.map((fn) => (decision: Decision) => fn(ctx, decision)),
    );

    // files of an earlier run of this screenshot must not outlive it
    await Promise.all([store.remove(call.actual), store.remove(call.diff)]);
    const decided: CompareContext = { ...ctx, decision };
    const plan = await pipe(
      planWrites({
        status: decision.status,
        baseline: call.baseline,
        actual: call.actual,
        diff: call.diff,
        bytes: input.actual,
        diffPng,
      }),
      hooks.beforeWrite.map((fn) => (plan: WritePlan) => fn(decided, plan)),
    );
    await forEachSeries(plan.write, ({ ref, bytes }) =>
      store.write(ref, bytes),
    );

    const entry = writer.record(
      entryInput({
        input,
        name,
        settings,
        measurement,
        decision,
        limit,
        engine,
        baselineWritten: baselineWritten(decision.status, plan),
        duration: Date.now() - started,
        files: {
          baseline: where(call.baseline),
          actual: where(call.actual),
          diff: where(call.diff),
        },
        imagesDir: input.files
          ? path.relative(projectRoot, path.dirname(input.files.baseline))
          : path.relative(projectRoot, where({ kind: 'baseline', path: '' })),
        defaults: options.manifest,
      }),
    );
    await runAll(
      registry.reporters.map(
        (reporter) => async (entry: ManifestEntry) => reporter.onEntry?.(entry),
      ),
      entry,
    );
    return { entry, images };
  };

  /**
   * Compares one screenshot, decides, writes the files and records the
   * manifest entry. `include` names the compared images to hand back as PNG
   * bytes, for a runner that shows them; the diff is encoded anyway, the other
   * two cost nothing when the sizes match.
   */
  const compare = async (
    input: CompareInput,
    { include = [] }: { include?: ImagePart[] } = {},
  ) => {
    await ready;
    return compareCall(callFor(input, include));
  };

  /** Compares every incoming image of the store against its baseline. */
  const compareAll = async (): Promise<Manifest> => {
    await ready;
    const compareIncoming = async (incoming: ImageRef) => {
      const baseline = registry.matcher.baselineFor(incoming);
      const actual = baseline && (await registry.store.read(incoming));
      if (!baseline || actual === null) return;
      const name =
        registry.layout.nameOf('baseline', baseline.path) ??
        baseline.path.replace(/\.png$/, '');
      await compareCall(callFor({ name, actual }, [], baseline));
    };
    const failures = await mapLimit(
      await collect(registry.store.list('incoming')),
      concurrency,
      compareIncoming,
    );
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `${failures.length} image${failures.length === 1 ? '' : 's'} could not be compared:\n${failures.map((f) => `  ${f.message}`).join('\n')}`,
      );
    }
    return writer.toJSON();
  };

  const finish = once(async () => {
    writer.write();
    writer.flush();
    await pool.close();
    await runAll(hooks.end, writer.toJSON());
    await runAll(
      registry.reporters.map(
        (reporter) => async (manifest: Manifest) => reporter.onEnd?.(manifest),
      ),
      writer.toJSON(),
    );
  });

  return {
    writer,
    /** `compare` that returns just the entry. */
    compareImage: async (input: CompareInput): Promise<ManifestEntry> =>
      (await compare(input)).entry,
    compare,
    compareAll,
    /** Flushes the manifest and ends the reporters. Call once, after the last comparison. */
    close: async (): Promise<Manifest> => {
      await ready;
      await finish();
      return writer.toJSON();
    },
  };
};
