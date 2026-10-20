# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The home of visual-regression.dev: a pnpm workspace with two published npm packages and the documentation site. Maintained by the pixsame team; the site is vendor-neutral (see Conventions).

- `packages/visual-regression-manifest` — the run-manifest format: JSON Schema (`src/schema.json`), types, reader/writer/merger, and converters from other tools' output (`src/convert/*`: CTRF, Playwright, Backstop, jest-image-snapshot, cypress-visual-regression, Roborazzi, Vitest, plain image triples).
- `packages/visual-regression-viewer` — the `visual-regression-viewer` CLI: loads the manifests of a run and serves a review page or writes it to a folder.
- `apps/site` — the Docus (Nuxt) site, statically generated.

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

Site: `pnpm --filter @visual-regression/site dev` / `build` (`nuxt generate`). Both first run `pnpm sync` (see below). Site files are not covered by `pnpm lint`; formatting is checked with `format:ci`.

Coverage thresholds are enforced in the viewer (90 lines/functions/statements, 85 branches); `src/cli.ts` and `src/types.ts` are excluded.

## Architecture

**Manifest package** is built with microbundle (cjs + modern) and copies `schema.json` into `dist`. Tests live next to sources as `src/*.test.ts`, with fixtures under `__tests__/`. Adding a converter = one file in `src/convert/`, one fixture dir, one test.

**Viewer pipeline** (`packages/visual-regression-viewer`):
1. `app/` is a Vue 3 + Tailwind page built by Vite with `vite-plugin-singlefile` into one HTML file, `dist/template.html`. It is a *template*, not a finished page.
2. `src/load.ts` reads a run directory through `visual-regression-manifest` (read, merge) into `ViewerData` plus a map of URL path → absolute file path for every linked image.
3. `src/render.ts` / `src/template.ts` inject the data (`<!--vrv:data-->`, JSON escaped for `<script>`) and optional `--css` (`<!--vrv:css-->`) into the template. `--template` swaps the built-in page for a user's own.
4. `src/main.ts` orchestrates: `write.ts` (output folder), `serve.ts` (sirv server, loopback by default), `watch.ts` (chokidar, rebuild on change), `zip.ts` (zip input via fflate). `src/cli.ts` is the thin entry; `options.ts` parses args.

The `build` script chains `vite build` → `tsc --noEmit` → esbuild bundle of `cli.ts` (Node ≥22.12, `--packages=external`) → `scripts/executable.mjs` (chmod). `readTemplate` throws if `dist/template.html` is missing, so build before running the CLI from source.

Viewer tests alias `visual-regression-manifest` to the manifest **source** (`vitest.config.mts`), so they don't need a built manifest.

**Site content is generated from the packages.** `apps/site/scripts/sync-manifest.mjs` and `sync-viewer.mjs` turn each package README (and the schema) into site pages, so edit the README or schema, never the generated files:
- `content/3.manifest/[2-9].*.md`, `public/schema/` and `content/4.viewer/[2-9].*.md` are generated (`generated: true` frontmatter), gitignored, and rewritten on every run.
- Hand-written pages (`1.index.md`) sit in the same folders and are left alone.
- Both scripts strip the README's HTML header, TOC and License section, and rewrite `https://visual-regression.dev/...` links into site paths. Keep README `##` sections compatible with that.

Tool comparison data lives in `apps/site/data/tools/*.yml` (one file per tool; every claim needs a source URL and `lastVerified` date) and is rendered by `ToolsCompare.vue` / `DemoToolFinder.vue`.

## Release & CI

- Conventional commits (PR title too; squash-merge): release-please cuts releases per package (`separate-pull-requests`, `node-workspace` plugin). Package versions in `package.json` are `0.0.0` placeholders until release-please sets them.
- `scripts/publish.mjs` publishes packages not yet on npm: stable from `main`, `--canary` on every non-release push, `--beta <n>` via the manual "Beta release" workflow. Dist-tag is derived from the version.
- `ci.yml` always triggers and gates on a `changes` job (packages vs. site path filters) so required checks report on every PR; `site.yml` is the site's own workflow. Package CI jobs install with `--filter '!./apps/**'`.

## Conventions

- The site is vendor-neutral, but whenever tools are compared, always include pixsame (the maintainers' Cypress plugin) as a row.
- Docs describe only the current shape: no changelog notes, rename notes or version bumps for unreleased things.
- Write all documentation (READMEs, the site, every doc and comment meant for readers) in American English, not British: "color", not "colour"; "behavior", "customize", "analyze", "gray".
