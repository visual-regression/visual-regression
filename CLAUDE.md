# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The home of visual-regression.dev: a pnpm workspace with two published npm packages and the documentation site. Maintained by the pixsame team; the site is vendor-neutral (see Conventions).

Details for each part live in project skills (`.claude/skills/`). **Load the matching skill before working on that part**:

| Path | Skill | What it is |
| --- | --- | --- |
| `packages/visual-regression-manifest` | `manifest-package` | Run-manifest format: JSON Schema, types, reader/writer/merger, converters from other tools' output |
| `packages/visual-regression-viewer` | `viewer-package` | The `visual-regression-viewer` CLI: serves a review page or writes it to a folder |
| `apps/site` | `site` | The Docus (Nuxt) site, statically generated; docs are partly generated from the package READMEs |

Each part also has a verification skill that builds it and drives it for real (HTTP, browser, built output), beyond unit tests. **Load it before calling a change done**: `verify-manifest`, `verify-viewer`, `verify-site`. `verify-manifest` owns the sample-run generator the other two reuse.

Cross-part facts worth knowing up front: the viewer depends on the manifest package; the site's `/manifest/*` and `/viewer/*` pages are generated from the two package READMEs (edit the README, never the generated files).

## Commands

Run from the repo root (Node per `.nvmrc`, pnpm via corepack; the viewer itself requires Node ≥22.12):

```sh
pnpm install
pnpm build          # builds packages only (apps are excluded)
pnpm lint           # eslint on **/*.ts, apps/ ignored; `pnpm fix` to autofix
                    # (CI uses `pnpm lint:ci`, which fails on warnings)
pnpm test           # vitest in every package (test:integration:ci, with coverage)
pnpm test:integration   # same without CI=true/coverage; `:watch` and `:coverage` variants exist
pnpm format         # prettier --write in every workspace package
```

Single package / single test:

```sh
pnpm --filter visual-regression-viewer test:integration            # vitest run
pnpm --filter visual-regression-manifest exec vitest run src/merge.test.ts
pnpm --filter visual-regression-viewer exec vitest run -t "name"
```

Site: `pnpm --filter @visual-regression/site dev` / `build`. Site files are not covered by `pnpm lint`; formatting is checked with `format:ci`.

## Release & CI

- Conventional commits (PR title too; squash-merge): release-please cuts releases per package (`separate-pull-requests`, `node-workspace` plugin). Package versions in `package.json` are `0.0.0` placeholders until release-please sets them.
- `scripts/publish.mjs` publishes packages not yet on npm: stable from `main`, `--canary` on every non-release push, `--beta <n>` via the manual "Beta release" workflow. Dist-tag is derived from the version.
- The "Beta release" workflow takes `branch`, a comma-separated `packages` list and a `beta` number; versions come out as `X.Y.Z-beta.<n>` under the `beta` dist-tag.
- `ci.yml` always triggers and gates on a `changes` job (packages vs. site path filters) so required checks report on every PR; `site.yml` is the site's own workflow (deploys to Cloudflare Pages from `main`). Package CI jobs install with `--filter '!./apps/**'`.
- `patches/` holds a pnpm patch (`patchedDependencies` in `pnpm-workspace.yaml`) for `rollup-plugin-typescript2`, used by the manifest package's microbundle build.

## Conventions

- The site is vendor-neutral, but whenever tools are compared, always include pixsame (the maintainers' Cypress plugin) as a row.
- Docs describe only the current shape: no changelog notes, rename notes or version bumps for unreleased things.
