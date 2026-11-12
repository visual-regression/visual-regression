# Proposal: `visual-regression-compare`, a tool-agnostic compare core and CLI

Status: first implementation in `packages/visual-regression-compare` (core, `compare`, `record` and `approve` commands, the pixelmatch engine, the fs store, the manifest layout, the console, CTRF and GitHub summary reporters, the plugin API, a JSON/JS config file). The package is released only as betas (`X.Y.Z-beta.<n>` under the `beta` dist-tag through the manual Beta release workflow) until a pixsame runner uses it; its release-please pull request is not merged before that. pixsame consumes the core, and the GitHub App reads manifests only. Not yet built: the `odiff`, `resemble` and `ssim` engines, the `viewer` reporter, the Playwright and pixsame layouts, JPEG/WebP codecs and the site page. The rollout below says what belongs to which step. Discussed in the context of visual-regression.dev and pixsame on 2026-11-05; the open questions were answered on 2026-11-10 (see Decisions).

## The problem

The [run manifest](https://visual-regression.dev/manifest) is today only a conversion target: `visual-regression-manifest` reads what other tools leave on disk and writes a manifest after the fact. Nothing in the ecosystem _produces_ a manifest from plain images, so three kinds of users are left out:

- Teams that capture screenshots themselves (a Puppeteer or Playwright script, a Storybook build walked by a crawler, a mobile emulator, a design-tool export) and only need the comparison, the decision and the review step.
- Tools that could write the manifest but have no comparison library they can drop in. BackstopJS, reg-suit, Loki and lost-pixel each bundle their own engine, options and folder layout.
- pixsame itself: the Cypress plugin, the Playwright package and the planned Vitest plugin each carry a copy of the compare, padding, naming and manifest-writing logic (`compare.ts`, `image.utils.ts`, `screenshotPath*.ts`, `manifest.utils.ts` in every package). A fourth runner means a fourth copy.

A shared core with a CLI on top turns the manifest into something tools write, not only something converters produce, and gives pixsame one engine to extend.

## What it is

One npm package, `visual-regression-compare` (unscoped like the two existing packages, MIT, in this monorepo under `packages/`), with three layers:

1. **Core library.** Pure Node, no browser, no test runner. Decodes images, pairs baseline with actual, runs a diff engine, applies the limits, decides a status, writes the `.actual` / `.diff` files and the manifest.
2. **CLI** `visual-regression-compare` (bin alias `vrc`). The core driven from folders, for the "I already have screenshots" case.
3. **Extension points.** Engines, matchers, stores, layouts, reporters and hooks, registered through a plugin API. This is where pixsame's runner adapters, hosted store and review service plug in.

The viewer, the converters and the manifest package stay what they are. The compare package depends on `visual-regression-manifest` for writing and on nothing else at runtime but `pngjs` and `pixelmatch`.

### Non-goals for 1.0

- Capturing screenshots or driving a browser. Input is images.
- Hosting, storage outside the file system, a review UI. Those are plugins (pixsame's) or other packages (the viewer).
- Replacing Playwright's `toHaveScreenshot` for people happy with it.

## The pipeline

```
discover  →  pair  →  decode  →  compare  →  decide  →  write  →  report
 (store)    (matcher) (codec)   (engine)    (limits)   (layout,   (reporters:
                                                        manifest)  console, viewer, ctrf, ...)
```

Each stage is one interface, each has one default implementation, and a plugin can replace or wrap any of them.

- **discover**: list candidate images from the store (default: the file system). The CLI discovers from `<actual-dir>` and `<baseline-dir>`; a runner adapter skips this stage and feeds images one at a time.
- **pair**: find the baseline for an actual (the matcher). Default: same relative path under the two directories. Alternatives: a name template, an explicit list, a manifest from a previous run.
- **decode**: bytes to `{ width, height, data: Uint8ClampedArray /* RGBA */ }`. PNG built in; JPEG and WebP as optional codecs.
- **compare**: the engine returns `diffPixels`, `diffRatio`, an optional diff image and an optional engine score (SSIM, Resemble's mismatch percentage).
- **decide**: the limits (`maxDiffRatio`, `maxDiffPixels`, `colorThreshold`) and the policy for missing baselines (`fail`, `create`) and size mismatches (`fail`, `pad`, `crop`; `fail` is the default, nothing is padded unless asked) turn the measurement into one of the manifest statuses: `passed`, `failed`, `missing-baseline`, `created`, `updated`, `approved`.
- **write**: the layout names and places the baseline, actual and diff files (`<name>.png`, `<name>.actual.png`, `<name>.diff.png` as the manifest convention; a pixsame layout with `_#n` counters and `{platform}` tokens; a Playwright-like layout with `-chromium-linux` suffixes), and the manifest writer records the entry.
- **report**: reporters consume entries as they are decided and the summary at the end.

### Concurrency

Only **decode** and **engine comparison** run in worker threads, because they are the CPU-bound stages and their inputs and outputs are plain data (bytes in, a measurement and an optional diff image out). Everything else stays on the main thread: discover, pair, **decide**, **write**, **report** and the manifest. The hooks (`decide`, `beforeWrite`, a custom `Store`) are closures and cannot cross a worker boundary, and `ManifestWriter` is single-writer per process (it rewrites one file atomically), so the main thread owns the writer and receives each measurement as a worker finishes it.

The consequence for plugins is one rule: an engine that should run in a worker must be given **by module id** (`--engine odiff`, `--engine ./my-engine.mjs`), so each worker can load it itself. A `DiffEngine` passed as an object in the programmatic API runs on the main thread, and `--concurrency` then only parallelizes decoding. Engine options must be structured-cloneable for the same reason.

## CLI

```
visual-regression-compare [compare] <actual-dir> --baseline <dir> [--diff <dir>]
  --engine pixelmatch|<module-id>   default: pixelmatch   (odiff, resemble, ssim: later)
  --max-diff-ratio 0.01    --max-diff-pixels <n>    --color-threshold 0.1    --include-aa
  --on-missing fail|create          default: fail   (create = status `created`, baseline written)
  --on-size-mismatch fail|pad|crop  default: fail   (fail = record both sizes, compare nothing)
  --update none|failures-only|all   default: none   (overwrite baselines, status `updated`)
  --match <template>                e.g. "{dir}{name}-ref.png" when actual and baseline names differ ({dir}, {name}, {path})
  --layout manifest                 (pixsame, playwright: later; other layouts through a plugin)
  --manifest <path>                 default: <actual-dir>/visual-regression-manifest.compare.json
  --runner <name> --variant <id> --platform <os>/<browser>  metadata recorded on every entry
  --report console,ctrf[:<path>],github-summary[:<path>]     default: console   (viewer: later)
  --concurrency <n>                 default: cpu count, for decode and compare only (see Concurrency)
  --config <file>                   visual-regression.config.{ts,mjs,json}, auto-detected
  --fail-on failed,missing-baseline default: both; exit code 1 when any entry matches

visual-regression-compare record <actual-dir> --baseline <dir>
  copies every actual over its baseline (or creates it) and writes a manifest of `created`/`updated` entries

visual-regression-compare approve --manifest <path> [<name>...|--all|--test <file>] [--repo-root <dir>] [--force] [--dry-run]
  applies approvals from a manifest: copies `images.actual.path` over `images.baseline.path`,
  deletes the actual and diff files, records `approved`, prints the files to commit
```

`approve` is a thin CLI over the manifest package, not a second implementation. It reads the manifests with `readManifest`, combines several with `mergeManifests`, takes the entries to act on from `run.needsHuman` (or `selectEntries` for `<name>...`, `--test` and `--all`), moves each file, and rewrites the entry in its manifest as `approved` (the same change `writer.approve({ actualPath })` makes in memory). It works on any manifest, not only ones this CLI wrote, and it is the same operation the manifest README describes ("Copying `images.actual.path` over `images.baseline.path` approves them"). The GitHub App calls the same functions.

- **Stale baselines.** An entry's `hashes.baseline` is the hash of the baseline the run compared against. Before copying, `approve` hashes the baseline file now on disk; when it differs (the baseline changed since the run, for example another approval merged first), it skips that entry, reports it as stale and exits non-zero, because the reviewer approved a diff against pixels that are no longer the baseline. `--force` overrides. An entry with no recorded baseline hash (`missing-baseline`) is stale only if a baseline file has appeared since. An entry whose `hashes.actual` no longer matches the actual file on disk is skipped the same way.
- **Several manifests.** `mergeManifests` keeps one entry per screenshot, a later attempt winning. When the manifests have different `projectRoot` values (a monorepo, or CI jobs on different checkouts), each entry keeps resolving its paths against its own manifest's root; `approve` runs from the repository root, uses `repoPaths` and refuses entries whose `unapprovableReason` is set (paths outside the repository, no actual kept), listing them with the merge `warnings`. Two entries that write the same baseline (`collidesWith`) are never approved implicitly: the reviewer must name one.
- **`baselineWritten`.** It records whether the working tree changed, not what the reviewer decided. `approve` writes `status: approved` with `baselineWritten: true` because the baseline file was replaced. An entry skipped as stale or unapprovable is left untouched (`baselineWritten` stays as it was), and `compare --on-missing fail` entries are `false` until something writes them. The files to commit printed by the command are exactly the entries with `baselineWritten: true` that it just wrote.

Exit code, console output and the GitHub job summary reporter make the CLI usable in a workflow with no other tooling:

```yaml
- run: npx visual-regression-compare screenshots/actual --baseline screenshots/baseline --report console,github-summary
- uses: actions/upload-artifact@v4
  if: failure()
  with: { path: screenshots }
```

## Programmatic API

Two entry points: a per-image call for runner adapters and a directory call for the CLI.

```ts
import {
  createComparer,
  fsStore,
  manifestLayout,
} from 'visual-regression-compare';

const comparer = createComparer({
  engine: 'pixelmatch', // an id runs in worker threads; an engine object runs in the main thread
  engineOptions: { threshold: 0.1, includeAA: false },
  limits: { maxDiffRatio: 0.01 },
  onMissingBaseline: 'create',
  onSizeMismatch: 'fail', // the default; 'pad' and 'crop' are opt-in
  store: fsStore({
    baselineDir: 'shots/baseline',
    actualDir: 'shots/actual', // the incoming screenshots, for compareAll
    diffDir: 'shots/diff', // where .actual and .diff files go
  }),
  layout: manifestLayout(),
  manifest: {
    path: 'shots/visual-regression-manifest.my-tool.json',
    tool: { name: 'my-tool', version: '1.0.0' },
    runner: { name: 'my-runner' },
  },
  plugins: [],
});

// one image, from a runner adapter: the actual comes as bytes, the baseline is found through the store
const entry = await comparer.compareImage({
  name: 'home page renders',
  actual: pngBuffer,
  test: { filePath: 'e2e/home.spec.ts', titlePath: ['home page', 'renders'] },
  platform: {
    osPlatform: process.platform,
    browser: { name: 'chromium', version: '130' },
  },
  viewport: { width: 1280, height: 720 },
});
// entry.status, entry.comparison.diffRatio, entry.images.*.path, exactly the manifest entry

// every image under the store, from the CLI
const run = await comparer.compareAll();
await comparer.close(); // flushes the manifest, ends reporters
```

### Interfaces

The shipped types (`src/types.ts` in the package) are the reference; the shapes that matter:

```ts
interface DiffEngine {
  name: string; // recorded as `extra.visualRegressionCompare.engine`
  colorMetric: 'yiq' | 'resemble' | 'deltaE' | string; // the manifest's `comparison.colorMetric`
  colorThreshold?: number; // the per-pixel tolerance used
  compare(
    baseline: RgbaImage,
    actual: RgbaImage,
  ): EngineResult | Promise<EngineResult>; // same size
}
interface EngineResult {
  diffPixels: number;
  diffRatio: number; // diffPixels / (width * height) after size handling
  diff?: RgbaImage; // omitted by engines that produce none
  score?: { name: string; value: number }; // SSIM mean, Resemble mismatch percentage
}

type ImageKind = 'baseline' | 'incoming' | 'actual' | 'diff'; // incoming: the screenshots to compare
interface Store {
  // where images live; the fs store is the only one in core
  read(ref: ImageRef): Promise<Uint8Array | null>;
  write(ref: ImageRef, bytes: Uint8Array): Promise<void>;
  remove(ref: ImageRef): Promise<void>;
  list(kind: 'baseline' | 'incoming'): AsyncIterable<ImageRef>;
  locate(ref: ImageRef): string | null; // absolute path, for the manifest
}
interface Layout {
  // file naming and placement
  paths(name: string): Record<ImageKind, string>;
  nameOf(kind: ImageKind, path: string): string | null; // the reverse, for discovery
}
interface Matcher {
  baselineFor(incoming: ImageRef): ImageRef | null; // where the baseline is (or goes); null skips the image
}
interface Reporter {
  onEntry?(entry: ManifestEntry): void | Promise<void>;
  onEnd?(manifest: Manifest): void | Promise<void>;
}
interface Plugin {
  name: string;
  setup(api: PluginApi): void | Promise<void>;
}
// PluginApi: addEngine, addReporter, setStore, setLayout, setMatcher, and
// on('beforeCompare' | 'afterCompare' | 'decide' | 'beforeWrite' | 'end', fn).
// `CompareContext.attachments` is reserved for extra inputs (see Decisions); nothing fills it.
```

The `decide` hook is the one that matters for a hosted service: it can turn a `failed` into `approved` when the service already holds an approval for that baseline hash, or attach a review URL to the entry's `extra`. The `beforeWrite` hook lets a store that keeps baselines elsewhere skip the local write.

Engines planned for the core: `pixelmatch` (default, shipped), `odiff` (optional peer dependency, used when installed), `resemble`, `ssim`; any other engine is a module id. All report on the manifest's scale (`colorMetric` set per engine), so the viewer and the deep dive on diff engines can show what the numbers mean.

## How pixsame extends it

- **Runner adapters become thin.** The Cypress plugin's task, the Playwright fixture and the Vitest matcher each do capture, call `compareImage`, and translate the entry into the runner's pass or fail. Padding, naming (`_#n`, `{spec_path}`, `{platform}` tokens) and manifest writing move into a `pixsameLayout()` and the core. The deterministic-rendering preset stays in the adapters, because it is about capture, not comparison.
- **`@pixsame/cloud` plugin.** A `Store` that fetches baselines from and uploads actuals to the service keyed by branch and variant, a `decide` hook that applies approvals made in the web app, a reporter that posts the run, and `renderer` metadata that says the pixels came from the hosted renderer. Users switch from local to hosted by adding one plugin, keeping their tests.
- **GitHub App.** Reads manifests, calls `approve` semantics (the same code path as the CLI command) and commits the result to the branch.
- **Batch review mode and the viewer.** Both read entries; neither changes. A later `review` reporter could stream entries to the viewer's page while the run is going.
- **A `pixsame` CLI** can wrap `visual-regression-compare` with pixsame defaults (`includeAA: false`, the pixsame layout, the cloud plugin when a token is present) and own the `init` and `doctor` commands.

What stays open on purpose: the plugin API is where the hosted product differentiates, so the core keeps the hooks few and stable rather than clever.

## Rollout

1. `0.1` (implemented): core, `pixelmatch`, fs store, manifest layout, console reporter, `compare` and `record` commands, worker-thread concurrency. Prove it in `examples/converters` by replacing the image-triple fixture generation with a real compare, and against the sample run from `verify-manifest`.
2. `0.2` (`approve`, the `ctrf` and `github-summary` reporters and the config file are implemented; the rest is open): `approve` command, `odiff` and `ssim` engines, `viewer` reporter, the Playwright and pixsame layouts.
3. `0.3`: plugin API frozen, documented on the site (`/compare-cli`), pixsame's Playwright package migrates first (smallest surface), then the Cypress plugin behind its next major.
4. `1.0` once two external tools write a manifest through it, or the three pixsame runners share it.

## Alternatives considered

- **Extend `visual-regression-manifest` with a compare entry point.** One package fewer, and the manifest package already holds a PNG reader and limits. But that package is a format with a small, dependency-light surface that other tools import to read or write results; adding an engine, codecs, workers, a plugin API and a CLI would give every consumer (the viewer, converters, third parties) that weight and put the format's stability on the same release train as a fast-moving compare engine. The proposal keeps the format package as the lower layer and builds on its public API only. The cost is two packages to version and document, which release-please already handles.
- **Wrap an existing engine or runner.** Playwright's comparator is tied to its runner and naming; `reg-cli` already does directory compare with a report but has its own report format, no plugin hooks, and no per-entry manifest; `odiff-cli` is fast and well maintained but is one engine with no pairing, policy or manifest. Wrapping one would be less code at first and inherit its maintenance. It would also tie the hook API (decide, store, layout) to that tool's model, and the engine is the part users most want to swap. The proposal therefore treats these as engines and conventions to adapt (`odiff` ships as an engine, the Playwright layout as a layout), not as the foundation. The honest cost is that we own the pairing, policy and worker code that these tools already have in some form.
- **Do nothing; keep per-tool copies.** Zero new surface, no migration risk, and each runner stays free to diverge. But the same padding, threshold, naming and manifest-writing logic already exists in several runner integrations and drifts between them (different size-mismatch behavior, different diff ratios for the same pair), and a hosted service has no single place to hook approvals. The cost of the copies grows with each runner added, so the proposal accepts the up-front work and the 0.x instability to stop it.

## Decisions

Answered on 2026-11-10:

- **Package name**: `visual-regression-compare`, unscoped like the two existing packages.
- **Git LFS**: the decoder recognizes a pointer file and fails with "the file is a Git LFS pointer, not an image; run `git lfs pull`".
- **Size mismatch**: nothing is padded automatically. `--on-size-mismatch` is `fail` (default), `pad` or `crop`. With `fail` the comparison does not run: the entry fails, its `message` and `extra.visualRegressionCompare` (`baselineSize`, `actualSize`) show the resolution change, and `diffRatio` is `1`. `pad` and `crop` compare after resizing and say so in the message. This replaces the earlier proposal of `pad` as the default.
- **DOM snapshots for layout-aware engines**: leave room, build later. `CompareContext` has an `attachments` field that nothing fills; the design waits for the pixsame implementation.

Agreed on 2026-11-10 after questioning whether a vendor-neutral compare tool is useful on its own:

- **Who the core serves**: pixsame's runners first. Replacing the copied compare, image and naming code in the Playwright package with an import from the core, tests unchanged, is what proves the interfaces; if that refactor is awkward, the interfaces change before 1.0.
- **Standalone CLI**: a reference use of the core. A landing page with use cases on the site is possible once the CLI is built; the engines, the viewer reporter and layouts for more runners are added when a real consumer needs them.
- **GitHub App**: ships under the pixsame brand and reads manifests only. PR-level approval belongs to the App; the package keeps the file-level `approve`.
- **Attachments**: DOM snapshots and other extra inputs have no standard shape yet, so `attachments` stays reserved and out of the manifest format.
