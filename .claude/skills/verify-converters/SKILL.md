---
name: verify-converters
description: Prove a manifest converter against the real tool, not hand-made fixtures — run the example project under examples/converters/<tool> through the harness (record, perturb, compare, convert, check the manifest against the files on disk, build a viewer page), read the ok/FAIL lines, capture the output as unit-test fixtures. Use after changing a converter in packages/visual-regression-manifest/src/convert, an example, the harness, or when a tool version bump needs checking.
---

# Verify: converters against the real tools

The unit tests of `packages/visual-regression-manifest/src/convert/*.test.ts` parse captured output; this check produces that output by running the tool itself. One example per tool lives under `examples/converters/<tool>/` (`scenario.mjs` + the tool's own config and specs); `examples/converters/harness/` drives them. Read `examples/converters/README.md` for the steps and the status matrix.

Run from the repo root.

## Launch

```sh
pnpm install
pnpm --filter visual-regression-manifest --filter visual-regression-viewer build   # the examples import dist, like consumers
pnpm --filter @visual-regression/e2e-<tool> exec playwright install chromium          # tools that screenshot through Playwright
pnpm --filter @visual-regression/e2e-harness e2e tests/<tool>.test.ts --reporter=verbose
```

Ready = the run prints `$ ...` command lines followed by `ok`/`FAIL` lines. Nothing keeps running.

## Doctor

- `ls packages/visual-regression-manifest/dist/index.mjs packages/visual-regression-viewer/dist/cli.js`: both must be newer than the sources you changed; a stale `dist` tests the old converter.
- `pnpm --filter @visual-regression/e2e-<tool> exec playwright --version` and `ls ~/.cache/ms-playwright` (macOS: `~/Library/Caches/ms-playwright`): the headless shell for that version must be there.
- `pnpm --filter @visual-regression/e2e-harness e2e tests/harness.test.ts`: the harness's own negative controls; if they fail, nothing else is trustworthy.

## Drive

Every mode of the scenario prints, per check, `ok   <check>` or `FAIL <check>: <reason>`, then the viewer line. Checks: schema validation, `projectRoot`, one status line per expected screenshot, one line per screenshot that must have no entry, one line per image path (exists under the project, PNG size matches the recorded size; the baseline of a `missing-baseline` entry must not exist), a diff ratio above 0 on failed entries when the tool reports one, no actual/diff on passed entries, and the viewer page.

To look at the tool's output yourself: `examples/converters/<tool>/` after a run still holds everything (ignored by git) plus `visual-regression-manifest.<mode>.json`; the review pages are under `examples/converters/harness/test-results/<tool>-<mode>/`.

Capture fixtures after a converter or tool change:

```sh
E2E_CAPTURE=1 pnpm --filter @visual-regression/e2e-harness e2e tests/<tool>.test.ts
pnpm --filter visual-regression-manifest exec vitest run src/convert/<tool>.test.ts
```

The capture rewrites `packages/visual-regression-manifest/__tests__/fixtures/<tool>/<mode>/` (files plus `expectations.json`); the unit test reads it. Commit it.

## Evidence

Paste the `ok`/`FAIL` lines of every mode and the vitest summary. Proof standards:

- State the build command you ran before the run; `dist` must be fresh.
- One negative control per change: flip one expected status in `scenario.mjs` (or revert the converter fix), run again, confirm the matching `FAIL` line, restore.
- Say which cases the tool cannot produce on disk (listed in `examples/converters/README.md`); they stay hand-written in the unit test, and that is a known gap, not coverage.

## Cleanup

`clean()` of the next run removes the output; nothing else to tear down. Fixtures you captured but did not mean to change: `git checkout -- packages/visual-regression-manifest/__tests__/fixtures`.

## Hand-off

`verify-manifest` checks the built package (exports, schema, reader, merge); this check proves the converters' inputs. After a README change in the converting section, the `site` skill's sync regenerates `/manifest/converting`.
