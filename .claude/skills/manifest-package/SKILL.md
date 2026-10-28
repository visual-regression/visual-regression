---
name: manifest-package
description: Work on packages/visual-regression-manifest — the run-manifest format (schema.json, types), reader/writer/merger/builder, and the converters in src/convert/ (CTRF, Playwright, Backstop, jest-image-snapshot, cypress-visual-regression, Roborazzi, Vitest, image triples). Use when editing that package, adding a converter, or changing the schema.
---

# visual-regression-manifest

Published npm package defining the run-manifest format. Everything else in the repo (viewer, site docs) consumes it.

## What's where

- `src/schema.json` — the JSON Schema; source of truth for the format. Copied into `dist` on build and into the site (`public/schema/v1.json`, `$id` points there).
- `src/types.ts`, `constants.ts` — types and shared constants; public API is re-exported from `src/index.ts`.
- `src/reader.ts`, `writer.ts`, `merge.ts`, `builder.ts`, `validate.ts` — read, write, merge the manifests of a run, build entries, validate.
- `src/paths.ts`, `png.ts`, `limits.ts`, `ci.ts`, `summary.ts` — path safety, PNG size reading, comparison limits, CI detection, status counts.
- `src/convert/*.ts` — one converter per tool (`walk.ts` is a shared helper). Tests sit next to them; real tool output captured by `examples/converters` lives under `__tests__/fixtures/<tool>/<mode>/` with an `expectations.json`.
- `README.md` — also the source of the site's `/manifest/*` pages (see the `site` skill). `docs/ctrf-proposal.md` is the CTRF proposal.

## Working on it

- Build: `pnpm --filter visual-regression-manifest build` (microbundle, cjs + modern; relies on the pnpm patch in `patches/` for `rollup-plugin-typescript2`).
- Tests sit next to sources as `src/*.test.ts`:
  `pnpm --filter visual-regression-manifest exec vitest run src/merge.test.ts` (single file), `-t "name"` (single test).
- **Adding a converter** = one file in `src/convert/`, one test, and an example under `examples/converters/<tool>` whose run (`verify-converters`) captures the real output into `__tests__/fixtures/<tool>/` for that test; export it from `src/index.ts`; follow an existing converter (`jest-image-snapshot.ts` has the full setup). Then mention it in the README's converting section.
- **Changing the schema** = edit `src/schema.json`, keep `types.ts` and `validate.ts` in step, add/adjust tests, and update the README `##` sections that describe the field. The site schema reference is generated from it.

## Verify

1. `pnpm --filter visual-regression-manifest exec vitest run` passes.
2. `pnpm lint` passes (eslint, which fails on warnings, plus a prettier check; `pnpm fix` autofixes both).
3. `pnpm build` succeeds (the viewer's CLI build and the site need the built package), then load the `verify-manifest` skill to check the built package as a consumer sees it (exports, schema, reader, merge, converters).
4. If the public API, schema or README changed, run `pnpm --filter @visual-regression/site sync` and check the generated pages still look right.

## Remember

- The viewer's tests alias this package to its **source**, so viewer tests will not catch a broken build of the manifest package — run the build yourself.
- Keep README `##` headings compatible with `apps/site/scripts/sync-manifest.mjs` (it maps heading titles to pages; renaming a heading drops or misplaces a page). The README's HTML header, TOC and License section are stripped by the script.
- Docs describe only the current shape: no changelog notes, rename notes or version bumps for unreleased things. `package.json` version is a `0.0.0` placeholder; release-please sets it.
- Paths in manifests must stay safe relative POSIX paths (`isSafeRelativePath`, `toPosix`); don't introduce absolute or `..` paths.
- Conventional commit scope for changes here: `feat(manifest): ...` / `fix(manifest): ...`.
