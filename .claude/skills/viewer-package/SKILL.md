---
name: viewer-package
description: Work on packages/visual-regression-viewer — the `visual-regression-viewer` CLI and its Vue 3 + Tailwind single-file review page (app/, src/load|render|template|main|write|serve|watch|zip|options). Use when editing the viewer, its CLI options, the page template, or its tests/build.
---

# visual-regression-viewer

CLI that loads the manifests of a run and serves a review page or writes it to a folder. Requires Node ≥22.12.

## Pipeline

1. `app/` — Vue 3 + Tailwind page built by Vite with `vite-plugin-singlefile` into one HTML file, `dist/template.html`. It is a **template**, not a finished page.
2. `src/load.ts` — reads a run directory through `visual-regression-manifest` (read, merge) into `ViewerData` plus a map of URL path → absolute file path for every linked image.
3. `src/render.ts` / `src/template.ts` — inject the data (`<!--vrv:data-->`, JSON escaped for `<script>`) and optional `--css` (`<!--vrv:css-->`) into the template. `--template` swaps the built-in page for the user's own.
4. `src/main.ts` — orchestrates: `write.ts` (output folder), `serve.ts` (plain `http` server, loopback by default; resolves files itself because static-file middleware mis-decodes names like `home_#0.png`), `watch.ts` (chokidar, rebuild on change), `zip.ts` (zip input via fflate). `src/cli.ts` is the thin entry; `options.ts` parses args.

## Working on it

- Build: `pnpm --filter visual-regression-viewer build` = `vite build` → `tsc --noEmit` → esbuild bundle of `cli.ts` (Node 22, `--packages=external`) → `scripts/executable.mjs` (chmod).
- **Build before running the CLI from source**: `readTemplate` throws if `dist/template.html` is missing. The manifest package must be built too.
- Tests: `pnpm --filter visual-regression-viewer test:integration` (vitest run); one test: `pnpm --filter visual-regression-viewer exec vitest run -t "name"`. Fixtures/helpers in `__tests__/helpers.ts`.
- Tests alias `visual-regression-manifest` to the manifest **source** (`vitest.config.mts`), so no built manifest is needed for tests.
- A new CLI flag touches `options.ts` (parsing), `main.ts` (behavior), the README (options docs) and tests.

## Verify

1. `pnpm --filter visual-regression-viewer test:integration:coverage` — thresholds are enforced: 90 lines/functions/statements, 85 branches. `src/cli.ts` and `src/types.ts` are excluded, so keep logic out of them.
2. `pnpm lint` (eslint, which fails on warnings, plus a prettier check; `pnpm fix` autofixes both).
3. `pnpm --filter visual-regression-viewer build` succeeds (includes the type-check).
4. For anything user-visible (UI, serving, `-o` output, options), tests are not enough: load the `verify-viewer` skill, which builds the CLI, runs it on a sample run and drives the page.

## Remember

- The output page must stay a single self-contained HTML file (data inlined, no external requests); don't add assets that break `vite-plugin-singlefile`.
- Injected JSON must remain escaped for `<script>` context; manifest-derived strings are untrusted.
- Serving binds to loopback by default; served files come only from the URL→file map built in `load.ts` (no arbitrary path serving). Don't weaken either.
- The README is the source of the site's `/viewer/*` pages (`sync-viewer.mjs`): keep its `##` sections compatible, and see the `site` skill. Docs describe only the current shape, no changelog or rename notes.
- `package.json` version is a `0.0.0` placeholder; commits use `feat(viewer): ...` / `fix(viewer): ...`.
