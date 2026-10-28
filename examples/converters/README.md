# Converter examples

One project per tool whose output `visual-regression-manifest` converts. Each runs the real tool in a real browser against the same page (`harness/pages/box.html`: three solid-color boxes, nothing a browser renders differently between runs), converts what the tool wrote and checks the manifest against the files on disk. They exist so the converters are proven against what the tools write today, not against hand-made fixtures, and so a tool release that changes its layout fails a CI job instead of a user's run.

## How a run works

`harness/` drives every example through the same steps, defined in the example's `scenario.mjs`:

1. `clean` removes everything the tool wrote in a previous run (the harness first removes its own manifests and review pages).
2. `record` runs the tool in record mode: `box-a`, `box-b` and `box-c` get baselines.
3. `perturb` deletes the baseline of `box-c`.
4. `compare`, once per mode the tool has (CI mode, update mode, ...), runs the tool with `box-b` recolored. `box-a` passes, `box-b` fails, `box-c` is the missing or created baseline.
5. `convert` calls the converter; the harness checks the result (`harness/src/assert-manifest.ts`): it validates, every image path exists under the project with the recorded size (the baseline of a `missing-baseline` entry must not exist), statuses are the expected ones, failed entries carry a diff ratio when the tool reports one, and `visual-regression-viewer` builds a review page from it.

No baseline is committed: they are recorded in the run, so the examples work on any platform and need nothing but the tool's browser.

## Running one locally

```sh
pnpm install
pnpm --filter visual-regression-manifest --filter visual-regression-viewer build
pnpm --filter @visual-regression/e2e-jest-image-snapshot exec playwright install chromium
pnpm --filter @visual-regression/e2e-harness e2e tests/jest-image-snapshot.test.ts
```

`pnpm --filter @visual-regression/e2e-harness typecheck` checks the harness and every `scenario.mjs` against the `Scenario` type (`harness/src/scenario.ts`); it needs the two packages built.

`--reporter=verbose` shows the `ok`/`FAIL` line of every check. `E2E_CAPTURE=1` also copies the tool's output into `packages/visual-regression-manifest/__tests__/fixtures/<tool>/<mode>/`, the fixtures of the converter's unit tests; commit them when the tool's output changed.

`pnpm --filter @visual-regression/e2e-harness e2e tests/harness.test.ts` runs the harness's own checks (they make sure a check can fail).

## Tools and what their output can express

| Example               | Converter                | Modes         | Statuses on disk                                                                                                           |
| --------------------- | ------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `jest-image-snapshot` | `fromJestImageSnapshots` | `ci`, `local` | `passed`, `failed`; `--ci` writes nothing for a missing baseline (no entry), without it the baseline is written (`passed`) |

## Adding a tool

Copy the closest example, pin the tool's version exactly (Renovate bumps it, and the bump runs exactly this example's CI job), export the same functions from `scenario.mjs` (the `typecheck` script must stay clean), add `harness/tests/<tool>.test.ts` and an `e2e-<tool>` job plus path filter in `.github/workflows/ci.yml`. Keep the tool's postinstall download out of `pnpm install` (`allowBuilds` in `pnpm-workspace.yaml`) and fetch it in the job behind a cache keyed by the exact version.
