# Proposal: `visual-regression-compare`, a tool-agnostic compare core and CLI

Status: proposal, not implemented. Discussed in the context of visual-regression.dev and pixsame on 2026-11-05.

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
- **decide**: the limits (`maxDiffRatio`, `maxDiffPixels`, `colorThreshold`) and the policy for missing baselines (`fail`, `create`) and size mismatches (`pad`, `fail`, `crop`) turn the measurement into one of the manifest statuses: `passed`, `failed`, `missing-baseline`, `created`, `updated`, `approved`.
- **write**: the layout names and places the baseline, actual and diff files (`<name>.png`, `<name>.actual.png`, `<name>.diff.png` as the manifest convention; a pixsame layout with `_#n` counters and `{platform}` tokens; a Playwright-like layout with `-chromium-linux` suffixes), and the manifest writer records the entry.
- **report**: reporters consume entries as they are decided and the summary at the end.

## CLI

```
visual-regression-compare [compare] <actual-dir> --baseline <dir> [--diff <dir>]
  --engine pixelmatch|odiff|resemble|ssim|<module-id>   default: pixelmatch
  --max-diff-ratio 0.01    --max-diff-pixels <n>    --color-threshold 0.1    --include-aa
  --on-missing fail|create          default: fail   (create = status `created`, baseline written)
  --on-size-mismatch pad|fail|crop  default: pad
  --update none|failures-only|all   default: none   (overwrite baselines, status `updated`)
  --match <template>                e.g. "{dir}/{name}.png" when actual and baseline names differ
  --layout manifest|pixsame|playwright|<module-id>
  --manifest <path>                 default: <actual-dir>/visual-regression-manifest.compare.json
  --runner <name> --variant <id> --platform <os>/<browser>  metadata recorded on every entry
  --report console,viewer,ctrf,github-summary[:<path>]     default: console
  --concurrency <n>                 default: cpu count, in worker threads
  --config <file>                   visual-regression.config.{ts,mjs,json}, auto-detected
  --fail-on failed,missing-baseline default: both; exit code 1 when any entry matches

visual-regression-compare record <actual-dir> --baseline <dir>
  copies every actual over its baseline (or creates it) and writes a manifest of `created`/`updated` entries

visual-regression-compare approve --manifest <path> [<name>...|--all|--test <file>]
  applies approvals from a manifest: copies `images.actual.path` over `images.baseline.path`,
  deletes the actual and diff files, records `approved`, prints the files to commit
```

`approve` is the piece the GitHub App, a PR comment bot or a reviewer at a terminal needs, and it works on any manifest, not only ones this CLI wrote. It is the same operation the manifest README describes ("Copying `images.actual.path` over `images.baseline.path` approves them").

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
  pixelmatchEngine,
  fsStore,
  manifestLayout,
} from 'visual-regression-compare';

const comparer = createComparer({
  engine: pixelmatchEngine({ threshold: 0.1, includeAA: false }),
  limits: { maxDiffRatio: 0.01 },
  onMissingBaseline: 'create',
  onSizeMismatch: 'pad',
  store: fsStore({
    baselineDir: 'shots/baseline',
    actualDir: 'shots/actual',
    diffDir: 'shots/diff',
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

```ts
interface DiffEngine {
  name: string; // recorded as `comparison.engine` in `extra`
  colorMetric: 'yiq' | 'resemble' | 'deltaE' | string; // the manifest's `comparison.colorMetric`
  compare(
    baseline: RgbaImage,
    actual: RgbaImage,
    options: EngineOptions,
  ): Promise<EngineResult>;
}
interface EngineResult {
  diffPixels: number;
  diffRatio: number; // diffPixels / (width * height) after size handling
  diff?: RgbaImage; // omitted by engines that produce none
  score?: { name: string; value: number }; // SSIM mean, Resemble mismatch percentage
}

interface Matcher {
  baselineFor(actual: ImageRef, store: Store): Promise<ImageRef | null>;
}

interface Store {
  // where images live; the fs store is the only one in core
  read(ref: ImageRef): Promise<Uint8Array | null>;
  write(ref: ImageRef, bytes: Uint8Array): Promise<void>;
  remove(ref: ImageRef): Promise<void>;
  list(kind: 'baseline' | 'actual'): AsyncIterable<ImageRef>;
}

interface Layout {
  // file naming and placement
  paths(id: EntryIdentity): { baseline: string; actual: string; diff: string };
  identityOf(path: string): EntryIdentity | null; // the reverse, for discovery
}

interface Reporter {
  onEntry?(entry: ManifestEntry): void | Promise<void>;
  onEnd?(manifest: Manifest): void | Promise<void>;
}

interface Plugin {
  name: string;
  setup(api: PluginApi): void | Promise<void>;
}
interface PluginApi {
  addEngine(name: string, engine: DiffEngine): void;
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
    fn: (ctx: CompareContext, result: EngineResult) => void | Promise<void>,
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
      files: WritePlan,
    ) => WritePlan | Promise<WritePlan>,
  ): void;
  on(event: 'end', fn: (manifest: Manifest) => void | Promise<void>): void;
}
```

The `decide` hook is the one that matters for a hosted service: it can turn a `failed` into `approved` when the service already holds an approval for that baseline hash, or attach a review URL to the entry's `extra`. The `beforeWrite` hook lets a store that keeps baselines elsewhere skip the local write.

Engines shipped with the core: `pixelmatch` (default), `odiff` (optional peer dependency, used when installed), `resemble`, `ssim`. All four report on the manifest's scale (`colorMetric` set per engine), so the viewer and the deep dive on diff engines can show what the numbers mean.

## How pixsame extends it

- **Runner adapters become thin.** The Cypress plugin's task, the Playwright fixture and the Vitest matcher each do capture, call `compareImage`, and translate the entry into the runner's pass or fail. Padding, naming (`_#n`, `{spec_path}`, `{platform}` tokens) and manifest writing move into a `pixsameLayout()` and the core. The deterministic-rendering preset stays in the adapters, because it is about capture, not comparison.
- **`@pixsame/cloud` plugin.** A `Store` that fetches baselines from and uploads actuals to the service keyed by branch and variant, a `decide` hook that applies approvals made in the web app, a reporter that posts the run, and `renderer` metadata that says the pixels came from the hosted renderer. Users switch from local to hosted by adding one plugin, keeping their tests.
- **GitHub App.** Reads manifests, calls `approve` semantics (the same code path as the CLI command) and commits the result to the branch.
- **Batch review mode and the viewer.** Both read entries; neither changes. A later `review` reporter could stream entries to the viewer's page while the run is going.
- **A `pixsame` CLI** can wrap `visual-regression-compare` with pixsame defaults (`includeAA: false`, the pixsame layout, the cloud plugin when a token is present) and own the `init` and `doctor` commands.

What stays open on purpose: the plugin API is where the hosted product differentiates, so the core keeps the hooks few and stable rather than clever.

## Rollout

1. `0.1`: core, `pixelmatch`, fs store, manifest layout, console reporter, `compare` and `record` commands, worker-thread concurrency. Prove it in `examples/converters` by replacing the image-triple fixture generation with a real compare, and against the sample run from `verify-manifest`.
2. `0.2`: `approve` command, `odiff` and `ssim` engines, `viewer` and `ctrf` and `github-summary` reporters, config file, the Playwright and pixsame layouts.
3. `0.3`: plugin API frozen, documented on the site (`/compare-cli`), pixsame's Playwright package migrates first (smallest surface), then the Cypress plugin behind its next major.
4. `1.0` once two external tools write a manifest through it, or the three pixsame runners share it.

## Open questions

- Package name: `visual-regression-compare` keeps the unscoped convention of the two existing packages; `@visual-regression/compare` reads better once there are more than three. Decide before 0.1, renames are expensive.
- Should the fs store understand a Git LFS checkout (pointer files instead of images) and fail with a clear message? Cheap and avoids a classic support issue.
- Size mismatch default: pixsame pads, Playwright fails. Padding makes the diff ratio comparable but hides a layout change behind a number; failing is honest but noisy. Proposal: `pad`, with the mismatch recorded in `message` and `extra`.
- Whether `compareImage` should accept a DOM snapshot alongside the image for engines that do layout-aware comparison later. Leave room in `CompareContext` (`attachments`), do not design it now.
