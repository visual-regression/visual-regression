# Proposal for ctrf-io/ctrf: visual regression tests in CTRF

Draft of the issue to open in https://github.com/ctrf-io/ctrf while the spec is pre-1.0. All proposals are additive and optional.

---

**Title:** Visual regression tests: a `visual` type, attachment roles and a `visual` object

## Problem

Screenshot comparison tools produce the same data at the end of a run. Examples of these tools are Playwright `toHaveScreenshot`, Vitest `toMatchScreenshot`, jest-image-snapshot, BackstopJS, Roborazzi, the Cypress plugins and the hosted services.

For each comparison, the data has:

- A baseline image.
- An actual image.
- Usually a diff image.
- A diff ratio.
- The threshold the tool used.
- An outcome. The outcome has more values than pass or fail. Examples: "no baseline existed", "the tool created the baseline", "the tool updated the baseline on request", "a person approved it in a review UI".

CTRF has `attachments[]` with `name`, `contentType` and `path`. It has one base64 `screenshot` field and five statuses. A reporter can put the three images in `attachments`. But nothing tells a consumer which image is which. The ratio, the threshold and the detailed outcomes can only go into `extra`. In `extra`, each tool uses its own keys. A consumer cannot depend on them.

We built the [visual regression manifest](https://visual-regression.dev/manifest) on the CTRF names. A manifest converts to a CTRF report and back ([`toCtrf` / `fromCtrf`](https://github.com/Visual-Regression/visual-regression/blob/main/packages/visual-regression-manifest/src/convert/ctrf.ts)). We keep the visual fields in an `extra.visualRegression` namespace. This issue asks if CTRF can document some of these fields. Then each CTRF consumer can show a screenshot diff.

## Proposals

1. Document `type: "visual"`. Add it as a known classification value next to `unit`, `integration` and `e2e`. Use it for tests where the outcome is an image comparison.
2. Add an optional `role` to attachments. Make it a string with open values. We use `baseline`, `actual` and `diff`. Other possible values are `trace` and `video`. With `role`, a consumer can find the three images of a comparison in `attachments[]` without parsing names.
3. Add an optional `visual` object to a test. If a new top-level key is too much before 1.0, document `extra.visualRegression` as an endorsed namespace instead.
   ```json
   {
     "diffRatio": 0.0231,
     "threshold": 0.01,
     "baselineWritten": false,
     "variant": "iphone-16-dark"
   }
   ```
   - `diffRatio` is the part of the pixels that differ, from 0 to 1.
   - `threshold` is the ratio the tool compared against.
   - `baselineWritten` tells if the run wrote the baseline file.
   - `variant` is an id the producer selects. It tells baselines with the same name apart. Examples: device, theme, locale.

## Nice-to-have proposals

4. More statuses. Visual tests have outcomes that the five statuses cannot show:
   - `missing-baseline`: no baseline existed, so a person must look at the actual image.
   - `created`: the run wrote a new baseline.
   - `updated`: the run replaced the baseline on request.
   - `approved`: a person accepted the new image in a review UI.

   We can live without them. Today we map `missing-baseline` to `failed` and `created`, `updated` and `approved` to `passed`. We always set `rawStatus` to the original value. This works, but a consumer must know our `rawStatus` values to show the difference.

5. A few generic `environment` fields. CI reporters need these, visual or not:
   - `ciProvider`: a string id of the CI system.
   - `pullRequestNumber`: an integer.
   - `headCommit`: the commit of the PR head. `commit` is often the merge commit.
   - `buildAttempt`: an integer, for re-runs of the same build.

## Compatibility

All proposals are additive and optional. Existing reports stay valid. We can send a PR with the schema, the docs and an example report if you want any of this.

## Evidence

- Spec and converters: https://visual-regression.dev/manifest
- The mapping table between the manifest and CTRF: https://visual-regression.dev/manifest/converting
- Tools whose output converts today: Playwright, Vitest, jest-image-snapshot, cypress-image-snapshot, cypress-visual-regression, BackstopJS, Roborazzi.
