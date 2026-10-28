---
name: verify-manifest
description: Prove packages/visual-regression-manifest works as the built package consumers install — not just that its unit tests pass. Builds it, writes a sample run with ManifestWriter, then checks the cjs/esm exports, schema.json export, reader, merge, CTRF round trip and a converter against it. Also owns make-sample-run.mjs, the sample run the viewer and site checks reuse. Use after changing the manifest package (schema, types, reader/writer/merge, converters, build config) or when you need a realistic run folder.
---

# Verify: visual-regression-manifest

The package is a library, so "driving it like a user" means importing the **built** `dist` the way the viewer and npm consumers do. Unit tests (`vitest`, see the `manifest-package` skill) import `src/`, so they cannot catch a broken build, a missing `exports` entry or a `schema.json` that was not copied. This skill covers exactly that gap. Test/lint/format commands live in `manifest-package`; do not repeat them here.

Run from the repo root. Scratch dir: use the session scratchpad (or any temp dir outside the repo), referred to as `$RUN` below.

## Launch

```sh
pnpm --filter visual-regression-manifest build        # microbundle + schema copy; must succeed
node .claude/skills/verify-manifest/scripts/make-sample-run.mjs "$RUN"
```

Ready = the second command prints the path of `$RUN/visual-regression-manifest.json`. Nothing keeps running; there is nothing to tear down but `$RUN`.

`make-sample-run.mjs` imports `dist/index.mjs` (exits with "build first" if missing) and writes a run with four entries — `failed` (baseline, actual, diff), `missing-baseline`, `passed`, `created` — as real PNGs under `e2e/__image_snapshots__/`, using the repo's `name_#0` naming. The `#` in names is deliberate: it is the real naming and it breaks naive URL handling downstream.

## Doctor

Read-only, answers "is the build worth testing?":

```sh
ls packages/visual-regression-manifest/dist/{index.js,index.mjs,index.d.ts,schema.json} \
  && cmp packages/visual-regression-manifest/dist/schema.json packages/visual-regression-manifest/src/schema.json
```

A stale `dist` (older than `src/`) gives false confidence: rebuild after every source change.

## Drive

```sh
node .claude/skills/verify-manifest/scripts/smoke-dist.mjs "$RUN"
```

It prints `ok`/`FAIL` per check and exits non-zero on any failure. It resolves the package the way the viewer does (through the workspace link and `exports`) and checks: cjs and esm expose the same API; `visual-regression-manifest/schema.json` resolves and equals `manifestSchema`; `readManifestFiles` finds and validates the sample; a broken manifest throws `ManifestParseError` with issues; `mergeManifests` lets a later attempt win; `toCtrf` → `fromCtrf` keeps entries; `fromImageTriples` yields a valid manifest.

Extend it when you add something with a public surface:

- **New converter** → add a `check(...)` that feeds it a tiny fixture written under `$RUN` and asserts `validateManifest(result)` is `[]` and the statuses are the expected ones. Export it from `src/index.ts` first, or the check (correctly) fails. Then add an example under `examples/converters/<tool>` and run `verify-converters`: that is where the real tool's output is proven.
- **Schema change** → make `make-sample-run.mjs` exercise the new field so the sample, the reader and the viewer all see it.

## Evidence

Paste the `ok`/`FAIL` lines of `smoke-dist.mjs` and the exit code. Proof standards:

- It must run against a freshly built `dist` (state the build command you ran), not `src`.
- A passing run proves nothing if the check cannot fail: after adding a check, break the thing it guards once (e.g. corrupt `dist/schema.json` temporarily, restore it with a rebuild) and confirm it reports `FAIL`.
- Say what you did **not** verify. A converter's real tool output is `verify-converters`' job, not this one's.

## Cleanup

Delete `$RUN`. If you corrupted anything under `dist/` for a negative control, rebuild instead of restoring by hand. Keep the pasted output; it is the evidence.

## Hand-off

Other checks consume this one: `verify-viewer` and `verify-site` both start from `make-sample-run.mjs`. If you change the sample's shape, run them too.
