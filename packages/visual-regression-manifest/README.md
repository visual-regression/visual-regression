<h1 align="center">visual-regression-manifest</h1>
<p align="center">One JSON file per test run that lists every screenshot comparison, built on CTRF. JSON Schema, TypeScript types, reader, writer, merger and converters.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/visual-regression-manifest">
    <img src="https://img.shields.io/npm/v/visual-regression-manifest.svg" alt="NPM version badge">
  </a>
  <a href="https://github.com/Visual-Regression/visual-regression/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/visual-regression/visual-regression.svg" alt="license MIT badge">
  </a>
</p>

A run manifest is one JSON file per test run that lists every screenshot comparison the run made. Each entry records the test it came from, whether it passed, failed, created or updated its baseline, the diff ratio, and where the baseline, actual and diff images are. Next to the entries, the file records where the run happened (CI provider, repository, commit, pull request, build id) and what it ran with (tool, runner, browser, options), so a tool that runs after the tests (a PR comment bot, a review dashboard, an approval tool) reads one file instead of parsing logs or walking the snapshots directory.

The format is runner-agnostic. The same file is written by the [pixsame](https://pixsame.com) Cypress and Playwright integrations and by the converters in this package for tools that write no manifest of their own (Playwright's `toHaveScreenshot`, Vitest's `toMatchScreenshot`, jest-image-snapshot and cypress-image-snapshot, cypress-visual-regression, BackstopJS, Roborazzi, and any tool that leaves image files behind). Only the `runner` block carries runner vocabulary.

It is built on [CTRF](https://ctrf.io), the Common Test Report Format: the envelope (`reportFormat`, `specVersion`), `tool`, `summary`, the CI and platform fields and the open `extra` objects carry CTRF's names, so a manifest converts to a CTRF report and back without renaming anything ([`toCtrf` / `fromCtrf`](#ctrf)). This format adds what CTRF has no field for: a visual comparison's three images, its statuses, its diff ratio and its threshold.

The spec lives at [visual-regression.dev/manifest](https://visual-regression.dev/manifest). This package has no runtime dependencies.

- [The format](#the-format)
- [Reading manifests](#reading-manifests)
- [Merging the manifests of a run](#merging-the-manifests-of-a-run)
- [Writing manifests](#writing-manifests)
- [Converting to and from other formats](#converting-to-and-from-other-formats)
- [Reference](#reference)

## The format

The normative description is the JSON Schema (draft 2020-12) at `https://visual-regression.dev/schema/v1.json`, shipped as `schema.json` (in the package, and in the repository under `src/`) and importable as `visual-regression-manifest/schema.json` or the `manifestSchema` export. The TypeScript types (`Manifest`, `ManifestEntry`, ...) mirror it. A trimmed example:

```jsonc
{
  "reportFormat": "visual-regression-manifest",
  "specVersion": "1.0.0-beta.1",
  "createdAt": "2026-09-22T10:00:00.000Z",
  "updatedAt": "2026-09-22T10:03:12.481Z",
  "projectRoot": "/home/runner/work/app/app", // every relative path below resolves against it
  "platform": {
    "osPlatform": "linux",
    "arch": "x64",
    "osRelease": "6.8.0-1021-azure",
  },
  "ci": {
    "provider": "github",
    "repositoryName": "acme/app",
    "repositoryUrl": "https://github.com/acme/app",
    "commit": "0f1e2d…", // on pull_request events: the merge commit
    "pullRequest": {
      "number": 42,
      "headSha": "9a8b7c…",
      "headRef": "feat/new-header",
      "baseRef": "main",
    },
    "buildId": "1234567890",
    "buildName": "CI",
    "buildUrl": "https://github.com/acme/app/actions/runs/1234567890/attempts/1",
    "runAttempt": "1",
    "workspace": "/home/runner/work/app/app", // the checkout directory
  },
  "tool": {
    "name": "@pixsame/cypress-plugin-visual-regression-diff",
    "version": "4.3.0",
  }, // what wrote the file
  "options": { "updateImages": "failures-only" }, // the tool's global options, in its own vocabulary
  "runner": {
    "name": "cypress",
    "version": "16.1.0",
    "testingType": "e2e",
    "mode": "run",
  }, // what ran the tests; only `name` is required
  "summary": {
    "entries": 1,
    "passed": 0,
    "failed": 1,
    "missingBaseline": 0,
    "created": 0,
    "updated": 0,
    "approved": 0,
    "needsHuman": 1,
  },
  "entries": [
    {
      "name": "home page renders_#0", // the baseline file stem
      "test": {
        "filePath": "cypress/e2e/home.cy.ts",
        "titlePath": ["home page", "renders"],
        "retry": 0,
      },
      "status": "failed",
      "comparison": { "diffRatio": 0.0231, "threshold": 0.01 },
      "images": {
        "baseline": {
          "path": "cypress/e2e/__image_snapshots__/home page renders_#0.png",
          "width": 1280,
          "height": 720,
        },
        "actual": {
          "path": "cypress/e2e/__image_snapshots__/home page renders_#0.actual.png",
          "width": 1280,
          "height": 720,
        },
        "diff": {
          "path": "cypress/e2e/__image_snapshots__/home page renders_#0.diff.png",
        },
      },
      "baselineWritten": false,
      "recordedAt": "2026-09-22T10:03:12.480Z",
      "duration": 840, // ms, when the writer measured it
      "platform": {
        "osPlatform": "linux",
        "arch": "x64",
        "browser": { "name": "chrome", "version": "130.0.0.0" },
      },
      "viewport": { "width": 1280, "height": 720 },
      "renderer": {
        "backend": "native",
        "browser": "chrome",
        "browserVersion": "130.0.0.0",
      },
      "hashes": { "baseline": "3b7e…", "actual": "9d21…", "diff": "c0ff…" }, // sha256, only for files that exist
      "message": "Image diff factor (2.31%) is bigger than maximum threshold option 1%.",
    },
  ],
}
```

| `status`           | meaning                                                 | `images.actual.path` | `images.diff.path` | as CTRF `status` |
| ------------------ | ------------------------------------------------------- | -------------------- | ------------------ | ---------------- |
| `passed`           | within threshold                                        | `null`               | `null`             | `passed`         |
| `failed`           | above threshold, actual and diff images kept for review | path                 | path (if any)      | `failed`         |
| `missing-baseline` | no baseline and the tool was told not to create one     | path                 | `null`             | `failed`         |
| `created`          | no baseline, the actual image became the baseline       | `null`               | `null`             | `passed`         |
| `updated`          | baseline overwritten on request                         | `null`               | `null`             | `passed`         |
| `approved`         | baseline replaced from a review UI                      | `null`               | `null`             | `passed`         |

Rules every writer and reader follows:

- Paths are relative to `projectRoot` with `/` separators and may point outside the project (`../…`). `projectRoot` is the tested project, not necessarily the repository root: `ci.workspace` is the checkout directory.
- `failed` and `missing-baseline` need a human. Copying `images.actual.path` over `images.baseline.path` approves them. `baselineWritten` says whether the working tree changed, whatever the status. `summary.needsHuman` counts them, so a consumer can decide without reading the entries.
- `tool` wrote the file, `runner` ran the tests. A Cypress plugin reports itself as `tool` and Cypress as `runner`; a converter reports itself as `tool` and the tool it converted from as `runner`.
- `platform` is where the test ran, `renderer` is where the pixels came from. Under `native` the renderer is the test browser itself. Entries with different renderers are different baselines.
- Browsers are optional. Desktop and mobile tools leave `platform.browser` out and describe what they captured in the entry's `target` (device, OS version, display density and orientation, locale, theme, app, driver). The run-level `platform` is the host that ran the tests, not necessarily the device. `renderer.backend` is an open string (`native`, `docker`, `cloud`, or your own, e.g. `device`); `renderer.name` names what rendered the pixels.
- `variant` is the baseline identity you control. Entries of the same screenshot name with a different `variant` (`iphone-16-ios18-dark`) never overwrite each other when manifests are merged. Without one, identity is `platform.osPlatform` + `platform.browser.name` + renderer.
- `subject` says what was captured, `extra` carries tool-specific detail. `subject` is a tool-neutral `{ id, kind }` (for example a Storybook story id with kind `story`) for tools that group or match entries by the thing shown rather than by the test. `extra` is an open object keyed by namespace, on the run, an entry, an image or an attachment: `design` (`tool`, `file`, `node`, `version` of the design-software source a baseline was exported from) and `storybook` (`args`, `globals`) are the conventional ones; `visualRegression` is reserved for the CTRF converters. Neither takes part in baseline identity, and readers ignore namespaces they do not know.
- `attachments` are any other files of an entry (a trace, a video, a DOM snapshot), in CTRF's attachment shape (`name`, `contentType`, `path`).
- Baseline, actual and diff share one image extension (PNG for every current writer); `.actual` and `.diff` go before it.
- Every entry is self-sufficient (its own `platform`, `viewport`, `renderer`), so the entries of several manifests (a matrix of machines, one file per worker, e2e + component) can be merged.
- One file per writer process, named `visual-regression-manifest[.<label>].json`, rewritten after every comparison, so it is complete even when the run is aborted. `/visual-regression-manifest{,.*}.json` (`MANIFEST_FILE_GLOB`) finds all of them in an artifact and nothing named merely alike. Merging warns when one run reports the same screenshot identity twice with different results; give such entries a distinct `variant`.
- Consumers ignore keys they do not know. The major of `specVersion` is bumped on breaking changes only; a reader accepts every version with the major it knows.
- On GitHub `pull_request` events `ci.commit` is the temporary merge commit; use `ci.pullRequest.headSha` / `headRef` to write to the branch. `ci.buildId` and `ci.runAttempt` locate the workflow artifact.

## Reading manifests

```ts
import {
  readManifestFiles,
  readManifestFile,
  parseManifest,
  ManifestParseError,
} from 'visual-regression-manifest';

// every manifest below a directory (an unpacked CI artifact), sorted by path
const found = readManifestFiles('artifacts/test');
// -> [{ file: '.../visual-regression-manifest.e2e.json', manifest: {...} }, ...]

// one file
const manifest = readManifestFile(
  'cypress/screenshots/visual-regression-manifest.e2e.json',
);

// already-parsed JSON from anywhere (a zip entry, an HTTP body)
try {
  const manifest = parseManifest(
    json,
    'test.zip:visual-regression-manifest.e2e.json',
  );
} catch (error) {
  if (error instanceof ManifestParseError)
    console.error(error.message, error.issues);
}
```

`parseManifest` validates against the shipped schema with a small built-in interpreter (cross-checked against Ajv in the test suite); `validateManifest` returns the issues without throwing and `isManifest` is the type guard. Unknown keys pass through untouched.

## Merging the manifests of a run

A run usually produces several manifests. `mergeManifests` concatenates them into one list keyed by screenshot name, test file, platform and renderer, with a later CI attempt winning over an earlier one, and prepares what an approval tool needs:

```ts
import { mergeManifests, selectEntries } from 'visual-regression-manifest';

const run = mergeManifests(
  found.map(({ file, manifest }) => ({ manifest, label: file })),
  { headSha: pr.head.sha, buildId: workflowRun.id, repositoryName: 'acme/app' },
);

run.counts; // { passed: 40, failed: 2, 'missing-baseline': 1, created: 0, updated: 0, approved: 0 }
run.needsHuman; // the failed and missing-baseline entries
run.warnings; // manifests written for another commit/run/repository, renderer fallbacks, unapprovable project roots
for (const {
  entry,
  repoPaths,
  keyHash,
  unapprovableReason,
  collidesWith,
} of run.needsHuman) {
  // repoPaths: baseline/actual/diff relative to the repository root (`null` when they escape it)
  // keyHash: a short stable id for buttons and commands
  // collidesWith: other entries writing the same baseline file (two platforms, one path)
}

// `/approve-visuals home_#0 "about_#0 (darwin / chrome)"`
const { entries, unknown } = selectEntries(run, { names: ['home_#0'] });
```

Any object with a `manifest` property is a source; extra properties (an artifact id, a zip path) come back on `MergedEntry.source` with their type.

## Writing manifests

Test-runner integrations use `ManifestWriter`: a builder bound to a file that rewrites it atomically on every change. For runs with thousands of screenshots pass `{ writeDelayMs: 200 }` as the third argument to coalesce the rewrites; pending changes are written on `flush()` and when the process exits (not if it is killed outright, which is why the default is `0`). A `passed` entry never lists `.actual` or `.diff` files, even when leftovers of an earlier run sit next to it, and test files are recorded normalised (`./a.spec.ts` and `a.spec.ts` are one file).

```ts
import {
  ManifestWriter,
  getManifestFileName,
} from 'visual-regression-manifest';

const writer = new ManifestWriter(
  `output/${getManifestFileName('my-runner')}`,
  {
    projectRoot: process.cwd(),
    tool: { name: 'my-visual-plugin', version: '1.0.0' }, // what writes the file
    runner: { name: 'my-runner', version: '2.0.0' }, // what runs the tests; add any runner-specific keys
    options: { threshold: 0.01 }, // your global options, verbatim
    // platform and ci are detected (GitHub Actions, GitLab CI) unless given
  },
);

writer.record({
  actualPath: 'shots/home.actual.png', // also the key: recording it again replaces the entry
  baselinePath: 'shots/home.png',
  // diffPath defaults to the `.diff` sibling; pass `null` when you write none
  testFile: 'e2e/home.spec.ts',
  titlePath: ['home', 'renders'],
  retry: 0, // a retry replaces the entries of the earlier attempts of that test
  status: 'failed',
  diffRatio: 0.02,
  threshold: 0.01,
  baselineWritten: false,
  duration: 840,
  actualSize: { width: 1280, height: 720 },
  platform: {
    osPlatform: process.platform,
    browser: { name: 'chromium', version: '130' },
  },
  attachments: [
    { name: 'trace', contentType: 'application/zip', path: 'trace.zip' },
  ],
  message: '2% of pixels differ',
});
writer.approve({ actualPath: 'shots/home.actual.png' }); // after moving the actual over the baseline
writer.dropTestFile('e2e/home.spec.ts'); // before re-running a file in an interactive runner
writer.reset(); // start of a run: forget everything, delete the file
```

`ManifestBuilder` is the same without the file (`toJSON()` gives the manifest), and `writeManifestFile` is the atomic write on its own. The writer computes project-relative paths, `null`s images that do not exist, hashes the ones that do, derives a `native` renderer from `platform`, keeps `summary` up to date and sorts entries by test file and name.

## Converting to and from other formats

### CTRF

[CTRF](https://ctrf.io) is the test results format a growing number of reporters write and CI integrations read (PR summaries, Slack messages, dashboards). A manifest becomes a CTRF report with one test of `type: "visual"` per entry, named after the screenshot, with the baseline, actual and diff images as attachments and everything CTRF has no field for under `extra.visualRegression`:

```ts
import fs from 'fs';
import { readManifestFile, toCtrf, fromCtrf } from 'visual-regression-manifest';

const manifest = readManifestFile('visual-regression-manifest.json');
fs.writeFileSync('ctrf-report.json', JSON.stringify(toCtrf(manifest), null, 2));

// and back: a report made by `toCtrf` converts without loss
const same = fromCtrf(JSON.parse(fs.readFileSync('ctrf-report.json', 'utf8')));
```

| manifest                                                                                                        | CTRF                                                                                     |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `tool`                                                                                                          | `results.tool`, `generatedBy`                                                            |
| `createdAt`, `updatedAt`                                                                                        | `summary.start`, `summary.stop`, `timestamp`                                             |
| `summary`                                                                                                       | `summary.tests/passed/failed` (via the status table above); verbatim in `summary.extra`  |
| `ci.commit`, `branchName`, `repositoryName`, `repositoryUrl`, `buildId`, `buildName`, `buildNumber`, `buildUrl` | `environment.<same name>`; `ci.buildId` also as the root `runId`                         |
| `platform.osPlatform`, `osRelease`, `osVersion`                                                                 | `environment.<same name>`                                                                |
| the rest of `ci` and `platform`                                                                                 | `environment.extra.visualRegression.{ci, platform}`                                      |
| `specVersion`, `projectRoot`, `options`, `runner`, `upload`                                                     | `results.extra.visualRegression`                                                         |
| entry `name`, `test.titlePath`, `test.filePath`, `message`, `duration`, `test.retry`                            | `test.name`, `suite`, `filePath`, `message`, `duration`, `retries`                       |
| `status`                                                                                                        | `test.status` (via the table) and `test.rawStatus` (verbatim)                            |
| `recordedAt`                                                                                                    | `test.stop` (and `start` when `duration` is known)                                       |
| `platform.browser`, `target.device.model`                                                                       | `test.browser`, `test.device`                                                            |
| `images.baseline/actual/diff`, `attachments`                                                                    | `test.attachments[]`, with `extra.visualRegression.role`, sizes and hashes on the images |
| `comparison`, `images`, `hashes`, `variant`, `renderer`, `target`, `subject`, `viewport`, ...                   | `test.extra.visualRegression`                                                            |
| any other `extra` namespace                                                                                     | the same namespace on the CTRF object                                                    |

`fromCtrf` reads reports made by `toCtrf` back without loss (apart from the entry order, which is re-sorted, and the summary, which is recomputed). With `{ lenient: true, projectRoot }` it also converts the visual tests of reports from other reporters, taking the three images from attachments named or tagged `baseline`/`expected`, `actual` and `diff`, and the status from `rawStatus` or from which images exist.

### Playwright's `toHaveScreenshot`

Run with the JSON reporter and convert the report:

```bash
npx playwright test --reporter=json > report.json
```

```ts
import fs from 'fs';
import {
  fromPlaywrightReport,
  writeManifestFile,
} from 'visual-regression-manifest';

const manifest = fromPlaywrightReport(
  JSON.parse(fs.readFileSync('report.json', 'utf8')),
  {
    threshold: 0.01, // your maxDiffPixelRatio, the report does not carry it
    // snapshotPathTemplate / snapshotDir: only when changed in playwright.config
    // browsers: { chromium: { name: 'chromium', version: '130' } } for richer `platform` blocks
  },
);
writeManifestFile(
  'test-results/visual-regression-manifest.playwright.json',
  manifest,
);
```

Only comparisons that left files behind can be recovered: `failed` (expected, actual and diff attachments), `missing-baseline` and `created` (actual only). A passing `toHaveScreenshot` leaves no trace in the report, and of a retried test only the last attempt counts. Baseline paths are computed from the snapshot path template because the report only lists the copies in `test-results`; the diff ratio is parsed from the assertion message.

### Vitest's `toMatchScreenshot`

Vitest (browser mode) keeps references in `__screenshots__/<test file>/` next to the tests and writes `<name>-actual.png` and `<name>-diff.png` under `.vitest/attachments/<test file>/` for failed comparisons. The converter scans the project for both:

```ts
import { fromVitestScreenshots } from 'visual-regression-manifest';

const manifest = fromVitestScreenshots({
  projectRoot: process.cwd(),
  threshold: 0.01, // your allowedMismatchedPixelRatio
  // roots: ['src', 'tests'], screenshotsDirName, attachmentsDir: when changed
});
```

A reference without attachments passed, attachments without a reference are `missing-baseline`, and the browser and platform are read off the file name (`button-chromium-darwin`).

### jest-image-snapshot and cypress-image-snapshot

Baselines are `<id>-snap.png` in `__image_snapshots__/`; failures leave `<id>-diff.png` (a baseline | diff | received composite unless `onlyDiff`) in `__image_snapshots__/__diff_output__/`, plus `<id>-received.png` when `storeReceivedOnFailure` is on:

```ts
import { fromJestImageSnapshots } from 'visual-regression-manifest';

const manifest = fromJestImageSnapshots({
  projectRoot: process.cwd(),
  runner: { name: 'cypress' }, // for cypress-image-snapshot; defaults to jest
  // snapshotsDirName, diffDirName, receivedDirName, snapshotPostfix, diffPostfix, receivedPostfix: when customised
});
```

The received image is the entry's `actual` when it exists; the diff composite is the entry's `diff` image either way.

### cypress-visual-regression

Reads the `base`, `actual` and `diff` folders (`cypress/snapshots/...` by default), nested by spec file:

```ts
import { fromCypressVisualRegression } from 'visual-regression-manifest';

const manifest = fromCypressVisualRegression({
  projectRoot: process.cwd(),
  threshold: 0.05, // your errorThreshold
  // baseDirectory, actualDirectory, diffDirectory, generateDiff: when changed
});
```

Cypress writes an actual image for every comparison, so a diff image is what marks a failure (`visualRegressionGenerateDiff: 'fail'`, the default); pass `generateDiff` when the run used another mode.

### BackstopJS

With `"report": ["json"]` BackstopJS writes `backstop_data/json_report/jsonReport.json`. Its paths are relative to that directory:

```ts
import fs from 'fs';
import { fromBackstopReport } from 'visual-regression-manifest';

const manifest = fromBackstopReport(
  JSON.parse(
    fs.readFileSync('backstop_data/json_report/jsonReport.json', 'utf8'),
  ),
  { projectRoot: process.cwd() }, // reportDir: when json_report was moved
);
```

One entry per scenario and viewport (`titlePath: [label, viewportLabel]`, `variant: viewportLabel`), the mismatch percentage as `diffRatio`, `misMatchThreshold` as `threshold`, a `Reference file not found` error as `missing-baseline`, and the scenario's `url`, `selector` and the raw `diff` block under `extra.backstop`.

### Roborazzi

`compareRoborazzi*` and `recordRoborazzi*` write `build/test-results/roborazzi/<variant>/results-summary.json` with absolute paths:

```ts
import fs from 'fs';
import { fromRoborazziResults } from 'visual-regression-manifest';

const manifest = fromRoborazziResults(
  JSON.parse(
    fs.readFileSync(
      'build/test-results/roborazzi/debug/results-summary.json',
      'utf8',
    ),
  ),
  { projectRoot: process.cwd(), threshold: 0.01 }, // your changeThreshold
);
```

`changed` is `failed` (with `diff_percentage` as the ratio and the `_compare` composite as the diff image), `added` is `missing-baseline`, `unchanged` is `passed` and `recorded` is `updated`. Entries carry an emulated Android `target` and a `robolectric` renderer; `context_data` lands under `extra.roborazzi`.

### Plain image files

For any tool that leaves a baseline and, on failure, an actual and a diff image next to it:

```ts
import { fromImageTriples } from 'visual-regression-manifest';

const manifest = fromImageTriples({
  projectRoot: process.cwd(),
  runner: { name: 'my-tool' },
  triples: baselines.map((baseline) => ({ baseline })), // actual/diff default to `.actual`/`.diff` siblings
});
```

The status is inferred from which files exist (`inferStatus`), image sizes are read from the PNG headers, and every field can be given explicitly (`actual`, `diff`, `name`, `testFile`, `titlePath`, `status`, `diffRatio`, ...).

## Reference

| export                                                                                                                                                                                    | purpose                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `manifestSchema`, `./schema.json`                                                                                                                                                         | the JSON Schema                                                       |
| `Manifest`, `ManifestEntry`, `ManifestStatus`, `ManifestCi`, `ManifestRunner`, ...                                                                                                        | the types                                                             |
| `MANIFEST_REPORT_FORMAT`, `MANIFEST_SPEC_VERSION`, `getManifestFileName`, `isManifestFileName`, `MANIFEST_FILE_GLOB`                                                                      | naming conventions                                                    |
| `MANIFEST_STATUSES`, `NEEDS_HUMAN_STATUSES`, `needsHuman`, `summarize`, `countByStatus`                                                                                                   | status vocabulary and counts                                          |
| `parseManifest`, `parseManifestJson`, `validateManifest`, `isManifest`                                                                                                                    | validation                                                            |
| `readManifestFile`, `readManifestFiles`, `findManifestFiles`                                                                                                                              | files                                                                 |
| `mergeManifests`, `selectEntries`, `entryKey`, `keyHash`, `platformLabel`                                                                                                                 | merging                                                               |
| `projectDirInRepo`, `toRepoPath`, `isSafeRelativePath`, `toPosix`                                                                                                                         | path helpers for approval tools                                       |
| `ManifestWriter`, `ManifestBuilder`, `writeManifestFile`, `createManifestHeader`                                                                                                          | writing                                                               |
| `detectCi`                                                                                                                                                                                | the `ci` block from environment variables (GitHub Actions, GitLab CI) |
| `toCtrf`, `fromCtrf`, `toCtrfStatus`, `EXTRA_NAMESPACE`                                                                                                                                   | CTRF                                                                  |
| `fromPlaywrightReport`, `fromVitestScreenshots`, `fromJestImageSnapshots`, `fromCypressVisualRegression`, `fromBackstopReport`, `fromRoborazziResults`, `fromImageTriples`, `inferStatus` | converters                                                            |
| `readPngSize`                                                                                                                                                                             | width and height from a PNG header                                    |

## License

MIT
