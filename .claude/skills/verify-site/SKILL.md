---
name: verify-site
description: Prove the visual-regression.dev site (apps/site) builds and behaves — build it, check the static output (routes, generated manifest/viewer pages, schema, internal links, pixsame row, tool data sourcing), serve it the way Cloudflare Pages does and drive /compare and the browser-only /viewer with a real run. Use after changing apps/site content, components, data/tools/*.yml, sync scripts, or a package README/schema that feeds the generated pages.
---

# Verify: apps/site

`nuxt generate` succeeding only says Nuxt did not crash. This skill checks what ships: the static output, served with Cloudflare Pages semantics, and the interactive pieces. Content layout, sync scripts, tool-data rules and the build/format commands live in the `site` skill; do not repeat them here.

Run from the repo root. `$S` = scratch dir outside the repo (the session scratchpad); `$PORT` = a free port (e.g. 4394).

## Launch

```sh
pnpm --filter @visual-regression/site build         # runs `sync` first, then nuxt generate → apps/site/.output/public (~25 s)
node .claude/skills/verify-site/scripts/check-output.mjs   # static checks, no server needed

# serve like production (Pages: extensionless routes, real 404s); background + PID
( cd apps/site && npx wrangler pages dev .output/public --port $PORT --ip 127.0.0.1 > "$S/site.log" 2>&1 & echo $! > "$S/site.pid" )
```

Ready = `$S/site.log` contains `Ready on http://127.0.0.1:$PORT`. Use this, not `nuxt preview`: `preview` expects a server build (`.output/server/index.mjs`) that a static `nuxt generate` does not produce, and it crashes. Never run `wrangler pages deploy` — deploys happen only from CI on `main`.

`pnpm … dev` is for editing, not verifying: it serves un-prerendered pages and hides prerender/link errors.

## Doctor

```sh
for r in / /compare /viewer /manifest/schema /schema/v1.json; do curl -s -o /dev/null -w "$r %{http_code}\n" http://127.0.0.1:$PORT$r; done   # all 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:$PORT/nope                                                                          # 404
```

If the output predates your last edit, rebuild; the Doctor cannot tell you.

## Drive

**1. Static checks** — `check-output.mjs` prints `ok`/`FAIL` per check and exits non-zero on failure: every `content/**/*.md` has a prerendered route; the generated pages carry `generated: true` and are not tracked by git; `/schema/v1.json` equals the package's `src/schema.json`; every internal `href`/`src` in the built HTML resolves; `data/tools/pixsame.yml` exists and pixsame appears on `/compare`; every tool YAML has `lastVerified` and `sources`. It checks structure, not truth: a new tool claim still needs its source read by you.

**2. Comparison page** (`browser_navigate /compare`). Handles: category filter `[aria-label="Category"]`, table rows. Require: a table with more than the header row, `pixsame` present in `document.body.innerText`. If you touched `ToolsCompare.vue`/`DemoToolFinder.vue`/a tool YAML, change a filter and require pixsame to stay listed wherever the comparison is shown (repo rule: pixsame is always a row).

**3. Browser-only viewer** (`/viewer`, component `ManifestViewer.vue`) with a real run:

```sh
node .claude/skills/verify-manifest/scripts/make-sample-run.mjs "$S/run"
(cd "$S/run" && zip -qr ../run.zip .)
cp "$S/run.zip" .playwright-mcp/sample-run.zip          # browser_file_upload only reads inside the repo
```

`browser_click` `span:text-is("or choose a zip")` (the page has a second element with similar text, so a plain `text=` locator is ambiguous), then `browser_file_upload` the absolute path of `.playwright-mcp/sample-run.zip`. Require four entry buttons (`checkout_#0`, `home_#0`, `about_#0`, `pricing_#0`); click `home_#0` and require Baseline, Actual and Diff images with `naturalWidth` 160 and the slider `input[aria-label="Compare baseline and actual"]`. This proves the in-browser zip + manifest + image matching, including `#` in file names.

Other pages you changed: `browser_navigate`, then `browser_snapshot` (a11y tree, better than a screenshot for assertions) and `browser_console_messages` level `error`.

**4. README/schema edits** — they feed `/manifest/*` and `/viewer/cli`. After `build`, open the affected generated page in the browser and read it; the checker only proves it exists.

## Evidence

Output of `check-output.mjs`, the `browser_evaluate` results, and `browser_take_screenshot` with `filename: ".playwright-mcp/site-<what>.png"` (the tool only writes inside the repo or `.playwright-mcp/`, which is gitignored). Prove the real path: the built output, not `dev`. A check that cannot fail proves nothing: when you add one, inject the fault once (e.g. a dead `href` into a built `.html`) and see it report `FAIL`, then rebuild.

## Cleanup

```sh
P=$(cat "$S/site.pid"); pkill -P "$P"; kill "$P"; sleep 1; lsof -nP -iTCP:$PORT -sTCP:LISTEN    # empty
```

`wrangler` spawns a child (`workerd`); killing only the parent can leave it. Kill by recorded PID and its children, never by process name. `browser_close`. Delete `$S/run*` and `.playwright-mcp/sample-run.zip`; keep the screenshots. The build leaves `.output/` and generated pages behind (gitignored). `git status` must show no new files (`wrangler`'s `.wrangler/` is gitignored).
