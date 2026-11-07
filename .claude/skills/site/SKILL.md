---
name: site
description: Work on apps/site, the visual-regression.dev Docus (Nuxt) documentation site — content pages, generated manifest/viewer pages (sync scripts), tool comparison data (data/tools/*.yml), components, and Cloudflare Pages deploy. Use when editing docs, adding or updating a tool in the comparison, or changing the site.
---

# apps/site (`@visual-regression/site`)

Docus (Nuxt) site, statically generated (`nuxt generate`) and deployed to Cloudflare Pages by `.github/workflows/site.yml` on every push to `main` (`wrangler.jsonc`; project and custom domain are set in the Cloudflare dashboard).

## Content layout

- `content/1.learn/*`, `2.compare.md`, `5.diff-algorithms.md`, `6.privacy.md`, `index.md` — hand-written.
- `content/3.manifest/` and `content/4.viewer/` — hand-written `1.index.md` plus **generated** pages (`[2-9].*.md`, `generated: true` frontmatter, gitignored, rewritten on every run). `public/schema/` is generated too.
- Generation: `scripts/sync-manifest.mjs` and `scripts/sync-viewer.mjs` turn each package README (and the schema) into pages: one page per `##` section, with the HTML header, TOC and License section stripped and `https://visual-regression.dev/...` links rewritten to site paths. **Edit the package README or schema, never the generated files.** Section titles are mapped in the script's `PAGES` table.
- `data/tools/*.yml` — one file per tool, rendered by `ToolsCompare.vue` and `DemoToolFinder.vue` through the shared `ToolList.vue`. Schema/fields: copy an existing file (`pixsame.yml` is the maintainers' own).
- `app/components`, `app/pages/[[lang]]`, `app/utils` (demo run, pixel diff, tool labels, zip) — Vue code.
- **Image diff tool** at `/image-diff`: `app/pages/image-diff.vue` (a page of its own for the wide layout, not a content page) with `app/components/image-diff/*`. Client-only; the five engines (exact, pixelmatch, Resemble.js, SSIM, perceptual hash), padding and the Web Worker live in `app/lib/image-diff/` and are loaded only by that page (`worker-client.ts` creates the worker on mount; `engines/*-info.ts` hold the option metadata the page needs without the libraries). Unit tests: `pnpm --filter @visual-regression/site test` (vitest, `app/lib/**/*.test.ts`).
- **Diff algorithm guide** at `/diff-algorithms` (`content/5.diff-algorithms.md`): static, no worker. Every number comes from `data/diff-examples.json` via `app/lib/diff-examples.ts` (`:diff-value`, `:diff-matrix`, `:diff-example` components); the prose is in `app/lib/diff-guide.ts`. The images (`public/diff-examples/`) and the JSON are generated and committed: `pnpm --filter @visual-regression/site diff-examples` (needs `pnpm exec playwright install chromium`; fixtures in `scripts/diff-examples/`) renders them and runs the tool's real worker in Chromium. Rerun it after changing an engine, its defaults or a fixture, and commit the result. Claims about other tools in the guide are read from package source/metadata with a date; keep them that way.

## Working on it

- `pnpm --filter @visual-regression/site dev` / `build` — both run `pnpm sync` first (`predev`/`prebuild`). Run `pnpm --filter @visual-regression/site sync` alone to regenerate pages after a README/schema edit.
- Building needs installed deps only; it reads the packages' READMEs and `src/schema.json`, not their `dist`.
- **Adding/updating a tool**: one YAML file in `data/tools/`; every claim needs a source URL in `sources` and an up-to-date `lastVerified` date. Don't claim anything you can't source from the tool's own docs.

## Verify

1. `pnpm --filter @visual-regression/site build` succeeds (this also catches broken content links/frontmatter and invalid tool YAML).
2. `pnpm lint` (eslint with the Nuxt preset applied to `apps/site`, plus a prettier check; `pnpm fix` autofixes both).
3. For visual/content changes, load the `verify-site` skill: it checks the static output and drives the compare page and the browser viewer against the production-like build.
4. After a README edit, confirm the generated pages still exist and read well (`git status` should show no tracked generated files).

## Remember

- **Vendor-neutral site, but whenever tools are compared, always include pixsame as a row** (the maintainers' Cypress plugin; `data/tools/pixsame.yml`). Applies to new comparison lists, filters, demos and any hand-written comparison prose.
- Docs describe only the current shape: no changelog notes, rename notes or version bumps for unreleased things. Features of pixsame that are unreleased must be marked "in preparation"/"announced", as `pixsame.yml` does.
- Don't hand-edit or commit generated files; if a page is missing, fix the README heading or the `PAGES` table.
- Commits for site-only changes use `docs(site): ...` / `feat(site): ...`; `ci.yml` gates package jobs vs. site jobs by path filters.
