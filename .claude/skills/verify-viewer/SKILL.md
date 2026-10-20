---
name: verify-viewer
description: Prove the visual-regression-viewer CLI works for real — build it, run it on a sample run, check the served page and image routes over HTTP, drive the review page in a browser, and check the -o report output. Use after changing packages/visual-regression-viewer (app/ UI, serve/write/load/render, options, template/css/zip handling) or the manifest package it reads, whenever unit tests alone are not enough.
---

# Verify: visual-regression-viewer

Vitest (see `viewer-package`) cannot tell you the page renders, the images load or the server refuses what it should. This skill runs the **built CLI** against a realistic run and looks at it. Build/test/lint/coverage commands live in `viewer-package`; do not repeat them here.

Run from the repo root. `$S` = a scratch dir outside the repo (the session scratchpad); `$PORT` = a port you pick (e.g. 4391).

## Launch

```sh
pnpm --filter visual-regression-manifest build
pnpm --filter visual-regression-viewer build          # vite → tsc → esbuild; needs the manifest build
node .claude/skills/verify-manifest/scripts/make-sample-run.mjs "$S/run"   # 4 entries, 2 need a human

# start in the background, remember the PID, wait for the ready line
node packages/visual-regression-viewer/dist/cli.js "$S/run" -p $PORT > "$S/viewer.log" 2>&1 & echo $! > "$S/viewer.pid"
```

Ready = `$S/viewer.log` says `Serving 4 screenshots at http://127.0.0.1:$PORT/`. Always pass `-p`: a port you name must be free, so a stray instance fails loudly instead of you driving the wrong server (without `-p` the viewer silently takes the next free port). The viewer reads the run read-only; it does not write unless you pass `-o`.

## Doctor

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:$PORT/     # 200
cat "$S/viewer.log"                                                   # the Serving line, no stack trace
lsof -nP -iTCP:$PORT -sTCP:LISTEN                                    # a node process on 127.0.0.1 (not *), pid = $S/viewer.pid
```

If `dist/template.html` or `dist/cli.js` is older than `app/` / `src/`, rebuild first. The version printed by `node packages/visual-regression-viewer/dist/cli.js -v` must match `package.json`.

## Drive

**1. HTTP level** (loopback, image routes, isolation):

```sh
node .claude/skills/verify-viewer/scripts/check-served.mjs http://127.0.0.1:$PORT --expect-entries 4 --expect-needs-human 2
```

Checks the page carries an escaped `vrv-data` block with no unreplaced `<!--vrv:…-->` marker, every image URL in it is served as `image/*` with `nosniff`, run files the manifests do not name (`/visual-regression-manifest.json`, spec files) answer 404, and `..` traversal is refused. Exit code non-zero = a real finding; do not weaken the script to get green.

**2. Browser** (Playwright MCP tools). Stable handles: the file list is `button`s named `<badge> <name> <test file> · <platform>` inside the `navigation` (groups "Needs a human" then "Everything else"); the slider is `input[aria-label="Compare baseline and actual"]`; images have `alt` Baseline / Actual / Diff.

1. `browser_navigate http://127.0.0.1:$PORT/`. Header must read `1 failed`, `1 missing baseline`, `1 passed`, `1 baselines written`.
2. `browser_click` the `home_#0` button. `browser_evaluate` and require all three `document.images` (Baseline, Actual, Diff) to have `naturalWidth` 160 — a broken image reports 0 — and no `http(s)` `src`/`href` anywhere (the page must make no external requests).
3. Set the slider to 50 and dispatch `input`; the Actual image's `clipPath` must become `inset(0px 0px 0px 50%)`.
4. Click `checkout_#0` (missing baseline): only the Actual figure shows, no slider.
5. `browser_console_messages` level `error`: the only expected one is `404 /favicon.ico`. Anything else is a finding.

**3. Written report** (`-o`): 

```sh
node packages/visual-regression-viewer/dist/cli.js "$S/run" -o "$S/report" --no-serve    # prints "Wrote index.html and 6 images"
ls "$S/report" "$S/report/e2e/__image_snapshots__"                                       # index.html + the 6 PNGs, paths kept
```

Then serve that folder (`… "$S/run" -o "$S/report" -p $PORT2`, background, PID file) and run `check-served.mjs` against it too: the folder-serving code path differs from the in-memory one (it resolves files on disk, so names with `#`/`%` are the thing to watch). Playwright MCP blocks `file://`, so a browser check of the report goes through that server.

For `--template`, `--css`, `--title`, zip input (`(cd "$S/run" && zip -qr ../run.zip .)`) and `--host`: run once with the option, then repeat the HTTP check and, for visual options (`--css`), assert the effect in the browser (`getComputedStyle(document.documentElement).getPropertyValue('--vrv-accent')`).

## Evidence

- Text: output of both `check-served.mjs` runs, the viewer log, the `browser_evaluate` results.
- Screenshot: `browser_take_screenshot` with `filename: ".playwright-mcp/viewer-<what>.png"`. The tool only writes inside the repo or `.playwright-mcp/`, and that folder is gitignored. Screenshots survive cleanup; keep them.
- Proof standards: exercise the built CLI, not `src`; capture the resulting state (images actually decoded), not just a 200; for a UI change, look at the screenshot.

## Cleanup

Kill only what you started, by the recorded PID, then confirm the port is free:

```sh
kill "$(cat "$S/viewer.pid")"; sleep 1; lsof -nP -iTCP:$PORT -sTCP:LISTEN   # empty
```

Never `pkill node`/`pkill -f visual-regression-viewer` — it can take down another agent's instance or the user's. Call `browser_close`. Remove `$S/run`, `$S/report`; leave `.playwright-mcp/*.png`.
