---
name: compare-package
description: Work on packages/visual-regression-compare, the tool-agnostic compare core and `visual-regression-compare` CLI (pairing, diff engines, worker threads, limits, size-mismatch policy, approve, reporters, plugin API). Use when editing that package, its CLI options or its tests/build.
---

# visual-regression-compare

Takes plain images, compares them against baselines with a pluggable engine, writes `.actual`/`.diff` files and a run manifest through `visual-regression-manifest`. Design: `docs/proposals/compare-cli.md`.

## What's where

- `src/comparer.ts`: `createComparer`, `compareImage` (one image, for adapters), `compareAll` (the store's incoming images), `decide` (statuses), manifest recording. The main thread owns decide, write, report and the `ManifestWriter`.
- `src/job.ts`, `pool.ts`, `worker.ts`: the CPU-bound part (decode, pad/crop, engine, encode diff) as plain data in/out; the pool runs it in worker threads when the engine is named by id and falls back to the calling thread otherwise.
- `src/engines/`: `loadEngine(id)` (built-in, module path, package) and the pixelmatch engine.
- `src/store.ts`, `layout.ts`: `fsStore` (baseline/incoming/actual/diff roots), `manifestLayout`, matchers, `sanitizeName`.
- `src/messages.ts`: the `Reason` union (written to `extra.visualRegressionCompare.reason`), the `Messages` type and the built-in `englishMessages`. A new status path needs a reason code and an English message there, and a row in the README table.
- `src/plugins.ts`: the plugin registry and hooks. `src/reporters.ts`: console, CTRF, GitHub summary.
- `src/approve.ts`: applies approvals from manifests (hash-checked, rewrites the manifests). `src/options.ts`, `config.ts`, `run.ts`, `cli.ts`: the command line (`run.ts` returns the exit code, `cli.ts` is the bin).

## Working on it

- Tests sit next to sources (`pnpm --filter visual-regression-compare exec vitest run`); they alias the manifest package to its source. `makePng` in `src/test-utils.ts` makes images.
- Build: `pnpm --filter visual-regression-compare build` (tsc declarations + esbuild: `index.js` and `worker.js` as the library, `cli.js` as the bin). The manifest package must be built first for `tsc`.
- `new URL('./worker.js', import.meta.url)` is the worker location: it must stay next to the bundle that creates the pool.
- Size mismatch defaults to `fail` (record the change, never pad implicitly); `pad` and `crop` are opt-in.

## Verify

1. Unit tests and `pnpm lint` pass.
2. Build, then run `dist/cli.js` on a folder of PNGs: a pass, a changed image, a size change, a new screenshot; check the exit code, the written files, the manifest (`isManifest`) and `approve` on it. Open the manifest in `visual-regression-viewer`.
