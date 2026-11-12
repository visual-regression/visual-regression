<p align="center">
  <a href="https://visual-regression.dev">
    <img src="https://visual-regression.dev/brand/mark.svg" alt="visual-regression.dev" width="96" height="96">
  </a>
</p>

<h1 align="center">visual-regression-compare</h1>
<p align="center">Compare folders of screenshots against their baselines and get a visual-regression-manifest, from the command line or from a test-runner adapter.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/visual-regression-compare">
    <img src="https://img.shields.io/npm/v/visual-regression-compare.svg" alt="NPM version badge">
  </a>
  <a href="https://github.com/visual-regression/visual-regression/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/visual-regression/visual-regression.svg" alt="license MIT badge">
  </a>
</p>

Pairs each screenshot with its baseline, runs a diff engine, applies your limits, writes the `.actual` and `.diff` files and a [`visual-regression-manifest`](https://visual-regression.dev/manifest) of the run. It captures nothing: the input is images, so it works with a Playwright or Puppeteer script, a Storybook crawl, an emulator or a design-tool export. Review the result with [`visual-regression-viewer`](https://visual-regression.dev/viewer).

The package is the shared compare core behind [pixsame](https://pixsame.com)'s test-runner plugins, and it is published as a beta until they build on it.

- [Usage](#usage)
- [Options](#options)
- [Size changes](#size-changes)
- [Approving](#approving)
- [Config file](#config-file)
- [Programmatic API](#programmatic-api)
- [Extending](#extending)

## Usage

```sh
npx visual-regression-compare screenshots/actual --baseline screenshots/baseline
```

Every `*.png` below `screenshots/actual` is compared with the same relative path below `screenshots/baseline`. A failing screenshot leaves `<name>.actual.png` and `<name>.diff.png` next to its baseline (or in `--diff <dir>`); the manifest goes to `<actual-dir>/visual-regression-manifest.compare.json`. The exit code is `1` when a screenshot fails or has no baseline, `2` on a usage or other error (an image that cannot be decoded aborts the run after the manifest is written).

```yaml
- run: npx visual-regression-compare screenshots/actual --baseline screenshots/baseline --report console,github-summary
- uses: actions/upload-artifact@v4
  if: failure()
  with: { path: screenshots }
```

`record` is the same command with `--on-missing create --update all`: it copies every screenshot over its baseline.

## Options

| Option                                | Default                      | What it does                                                                                                                                                         |
| ------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--baseline <dir>`                    | required                     | Directory of baseline images.                                                                                                                                        |
| `--diff <dir>`                        | next to the baselines        | Where `.actual` and `.diff` files are written.                                                                                                                       |
| `--engine <id>`                       | `pixelmatch`                 | A built-in engine, a module path (`./my-engine.mjs`) or a package name.                                                                                              |
| `--max-diff-ratio <n>`                | `0`                          | Largest accepted share of differing pixels, 0..1.                                                                                                                    |
| `--max-diff-pixels <n>`               |                              | Largest accepted number of differing pixels. With both limits, the stricter one wins.                                                                                |
| `--color-threshold <n>`               | `0.1`                        | Per-pixel color tolerance of the engine (pixelmatch: YIQ distance, 0..1).                                                                                            |
| `--include-aa`                        | off                          | Count anti-aliased pixels as differences.                                                                                                                            |
| `--on-missing fail\|create`           | `fail`                       | A screenshot without baseline is `missing-baseline`, or becomes the baseline (`created`).                                                                            |
| `--on-size-mismatch fail\|pad\|crop`  | `fail`                       | See [Size changes](#size-changes).                                                                                                                                   |
| `--update none\|failures-only\|all`   | `none`                       | Overwrite baselines (status `updated`): never, when the comparison failed, or whenever pixels differ (the same pixels in another PNG encoding leave the file alone). |
| `--match <template>`                  | same relative path           | Baseline path from the screenshot path: `{dir}` (with trailing slash), `{name}`, `{path}`.                                                                           |
| `--manifest <path>`                   | in `<actual-dir>`            | Where the manifest is written.                                                                                                                                       |
| `--runner`, `--variant`, `--platform` |                              | Metadata recorded on every entry; `--platform linux/chrome`.                                                                                                         |
| `--report <list>`                     | `console`                    | `console`, `ctrf[:<file>]` (CTRF report), `github-summary[:<file>]` (default `$GITHUB_STEP_SUMMARY`).                                                                |
| `--concurrency <n>`                   | CPU count                    | Worker threads for decoding and comparing.                                                                                                                           |
| `--fail-on <list>`                    | `failed,missing-baseline`    | Statuses that make the exit code `1`.                                                                                                                                |
| `--config <file>`                     | `visual-regression.config.*` | See [Config file](#config-file).                                                                                                                                     |

A baseline that is a Git LFS pointer (a checkout without `git lfs pull`) fails with a message saying so, not with a decoding error.

## Size changes

A screenshot whose size differs from its baseline is never padded unless you ask for it:

- `fail` (default): nothing is compared. The entry fails, `message` and `extra.visualRegressionCompare` record both sizes (`baselineSize`, `actualSize`), and the viewer shows the resolution change as it is.
- `pad`: both images grow to the larger size with transparent pixels, then they are compared. The diff ratio is comparable, but a layout change hides behind a number, so the entry says that it was padded.
- `crop`: both images are cut to the smaller size, then compared.

## Approving

```sh
npx visual-regression-compare approve --manifest screenshots/actual/visual-regression-manifest.compare.json
npx visual-regression-compare approve --manifest a.json --manifest b.json home "about (linux / chrome)"
```

Copies each entry's `images.actual.path` over its `images.baseline.path`, deletes the actual and diff files, rewrites the entry as `approved` in its manifest and prints the baseline files to commit. It works on any manifest, not only on ones this tool wrote. Without names it takes every entry that needs a human; `--test <file>` narrows that to one test file, `--dry-run` only reports.

- An entry is skipped, and the exit code is `1`, when its baseline or its actual file changed since the run (the hashes in the manifest no longer match), because the reviewer approved a diff against pixels that are no longer there. A screenshot without a baseline is skipped once a baseline has appeared. A manifest without hashes (written by another tool) skips this check. `--force` overrides.
- Entries of several manifests that write the same baseline are never approved without naming one.
- Paths resolve against the repository root: the working directory, or `--repo-root <dir>`. A project root outside it is refused (a manifest copied elsewhere must not make approve rewrite files in the tree it was written for), as is a CI project outside the checkout; a CI manifest carries `ci.workspace`, which locates its project inside the repository.
- The approved entry keeps the comparison that was approved and takes the size of the approved screenshot as the baseline size.

## Config file

`visual-regression.config.json`, `.mjs` or `.js` in the working directory (or `--config <file>`) sets the same options in camelCase; flags override it.

```json
{
  "baselineDir": "screenshots/baseline",
  "actualDir": "screenshots/actual",
  "maxDiffRatio": 0.001,
  "onSizeMismatch": "pad",
  "engineOptions": { "threshold": 0.2 },
  "report": "console,github-summary"
}
```

## Programmatic API

```ts
import { createComparer, fsStore } from 'visual-regression-compare';

const comparer = createComparer({
  limits: { maxDiffRatio: 0.01 },
  onMissingBaseline: 'create',
  onSizeMismatch: 'fail',
  store: fsStore({
    baselineDir: 'shots/baseline',
    actualDir: 'shots/actual',
    diffDir: 'shots/diff',
  }),
  manifest: {
    path: 'shots/visual-regression-manifest.my-tool.json',
    tool: { name: 'my-tool', version: '1.0.0' },
    runner: { name: 'my-runner' },
  },
});

// one image, from a runner adapter: the baseline is found through the store
const entry = await comparer.compareImage({
  name: 'home page renders',
  actual: pngBuffer,
  test: { filePath: 'e2e/home.spec.ts', titlePath: ['home page', 'renders'] },
  platform: { osPlatform: process.platform, browser: { name: 'chromium' } },
  viewport: { width: 1280, height: 720 },
});
// entry.status, entry.comparison.diffRatio, entry.images.*.path: a manifest entry

await comparer.compareAll(); // every image under actualDir
await comparer.close(); // flushes the manifest, ends the reporters
```

Decoding and comparing run in worker threads when the engine is named by id (`engine: 'pixelmatch'`, `engine: './my-engine.mjs'`) and `concurrency` is above 1. The library's default is `1`, which runs everything in the calling thread, because a test runner's own workers already use the CPUs; the command line defaults to the CPU count. An engine passed as an object runs in the main thread, and `concurrency` then only affects `compareAll`'s parallel reads. Engine options must be structured-cloneable.

### Per-call settings

A test runner changes its options from one assertion to the next. `compareImage` and `compare` take them on the input, for that screenshot only:

```ts
await comparer.compareImage({
  name: 'checkout',
  actual: pngBuffer,
  options: {
    limits: { maxDiffRatio: 0.02 }, // replaces the comparer's limits
    engineOptions: { threshold: 0.2, includeAA: true }, // merged over its engine options
    update: 'failures-only',
    onMissingBaseline: 'create',
    onSizeMismatch: 'pad',
  },
});
```

The entry records the limit and color threshold the call used.

### Files at known paths

A runner that already knows where the baseline, the `.actual` and the `.diff` file live (or that compares against a baseline kept under another name) passes them as absolute paths. They replace the store, layout and matcher for that call; `actual` and `diff` default to `<baseline>.actual.png` and `<baseline>.diff.png`.

```ts
await comparer.compareImage({
  name: 'checkout',
  actual: pngBuffer,
  files: {
    baseline: '/repo/e2e/__image_snapshots__/checkout.png',
    actual: '/repo/e2e/__image_snapshots__/checkout.actual.png',
  },
});
```

### Getting the images back

`compare` returns the entry and, when asked, the PNG bytes of the baseline, the actual and the diff as they were compared (padded or cropped to the same size when the sizes differed). That is what a review UI needs, including for a screenshot that passed.

```ts
const { entry, images } = await comparer.compare(
  { name: 'checkout', actual: pngBuffer },
  { include: ['baseline', 'actual', 'diff'] },
);
// images.diff, images.actual, images.baseline: Uint8Array
```

### Your own manifest writer

By default the comparer writes its own manifest. A runner that builds the header itself (CI and run metadata, one file per worker) passes its `ManifestWriter`, and states per-entry fields the comparer cannot know (`options`, `renderer`, `attachments`, `baselineExtra`, `target`, `subject`) as `entry` on the input. They are recorded as given.

```ts
const writer = new ManifestWriter(
  'out/visual-regression-manifest.worker-0.json',
  {
    projectRoot: process.cwd(),
    runner: { name: 'my-runner' },
  },
);
const comparer = createComparer({ store, manifest: { writer } });
await comparer.compareImage({
  name: 'checkout',
  actual: pngBuffer,
  entry: { renderer: { backend: 'docker', name: 'chromium' } },
});
```

## Extending

- **Engine**: a module whose default export is `{ name, colorMetric, colorThreshold?, compare(baseline, actual) }` or a function from options to one. `compare` gets two RGBA images of the same size and returns `{ diffPixels, diffRatio, diff?, score? }`.
- **Store, layout, matcher, reporter**: replace where images live (`Store`), how files are named (`Layout`), how a baseline is found (`Matcher`) and what happens with the entries (`Reporter`).
- **Plugin**: `{ name, setup(api) }` registers engines, reporters, a store, a layout or a matcher, and hooks `beforeCompare`, `afterCompare`, `decide`, `beforeWrite` and `end`. `decide` can turn a `failed` into `approved`; `beforeWrite` can drop the local write of a store that keeps baselines elsewhere. `CompareContext.attachments` is reserved for extra inputs such as a DOM snapshot; nothing fills it yet, and extra inputs have no standard shape.

## License

MIT
