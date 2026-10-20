<p align="center">
  <a href="https://visual-regression.dev">
    <img src="https://visual-regression.dev/brand/mark.svg" alt="visual-regression.dev" width="96" height="96">
  </a>
</p>

<h1 align="center">visual-regression-viewer</h1>
<p align="center">Review a visual regression run in the browser: baseline, actual and diff side by side, from the manifests the run left behind.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/visual-regression-viewer">
    <img src="https://img.shields.io/npm/v/visual-regression-viewer.svg" alt="NPM version badge">
  </a>
  <a href="https://github.com/visual-regression/visual-regression/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/visual-regression/visual-regression.svg" alt="license MIT badge">
  </a>
</p>

The viewer reads the [`visual-regression-manifest`](https://visual-regression.dev/manifest) files of a run, merges them the way `mergeManifests` does (several machines, one file per worker, later CI attempts winning over earlier ones) and shows the result: the screenshots that need a human first, each with a baseline/actual slider and the diff image, then everything else. It works on a local run, a CI artifact and a report folder you publish.

The command makes no network requests and sends no telemetry. A browser-only version, where you drop the run folder onto the page, is at [visual-regression.dev/viewer](https://visual-regression.dev/viewer).

- [Usage](#usage)
- [Options](#options)
- [Writing a report](#writing-a-report)
- [Theming](#theming)
- [Replacing the page](#replacing-the-page)

## Usage

```sh
npx visual-regression-viewer path/to/run
```

It needs Node 22.12 or newer. `path/to/run` is the folder that holds the manifests and the screenshots (the project root after a local run, an unpacked CI artifact), and defaults to the current directory. It can also be one manifest file, or a zip of the folder: a CI artifact as downloaded needs no unpacking. Every `visual-regression-manifest.json` and `visual-regression-manifest.<label>.json` below the folder is read, except inside `node_modules` and `.git`.

By default the page is built in memory and served at `http://127.0.0.1:4173` (the next free port when that one is taken). Nothing is written to disk. The server hands out the page and the image files the manifests name. Other files in the folder are not reachable.

A zip is unpacked into a temporary folder, which is removed when the command stops. An entry that would land outside of that folder makes the command refuse the zip, and so does a zip that unpacks to more than 4 GiB.

```sh
npx visual-regression-viewer artifact.zip
```

An image path in a manifest is resolved against the folder of the manifest. When the file is not there (an artifact is often unpacked into another layout than the machine that wrote it), the file whose path ends the same way is used. A path that leads outside the run folder is never linked.

## Options

| Option                        |                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-o, --out <dir>`             | Write the page (`index.html`) and the images it links to into `<dir>`. See [Writing a report](#writing-a-report).                                       |
| `--no-serve`                  | Do not start the web server. Requires `-o`, because without a server or an output there is nothing to do.                                               |
| `--no-watch`                  | With a server and `-o`: do not reload open pages when the files in `<dir>` change.                                                                      |
| `-p, --port <port>`           | Port of the web server. The default is `4173`, and the next free port when it is taken; a port you name must be free.                                   |
| `--host <host>`               | Address the server listens on. The default is `127.0.0.1`, so only your machine can reach it. `0.0.0.0` exposes the page and the images to the network. |
| `--template <file>`           | Use this HTML page instead of the built-in one. See [Replacing the page](#replacing-the-page).                                                          |
| `--css <file>`                | Add this stylesheet to the page. See [Theming](#theming).                                                                                               |
| `--title <text>`              | Page title. Defaults to `Visual regression viewer`.                                                                                                     |
| `-v, --version`, `-h, --help` | Print the version, print the options.                                                                                                                   |

## Writing a report

```sh
# build the page and its images into ./report, serve it and reload it on changes
npx visual-regression-viewer path/to/run -o report

# only write it, for publishing or for an artifact: opens from the file system too
npx visual-regression-viewer path/to/run -o report --no-serve
```

With `-o` the page is written to `<dir>/index.html` and the images are copied next to it with their relative paths kept, so the folder is self-contained and works from `file://` as well as from any static host.

When the server runs, it serves `<dir>` from the disk and watches it: whenever a file in it is added, changed or removed, the open pages reload. Running the command again into the same folder from another terminal, or editing `index.html` by hand, shows up in the browser without a refresh.

The files given with `--template` and `--css` are watched too: saving one rebuilds the page into `<dir>` (reading the manifests again), which reloads the open pages. A rebuild that fails, say because the template lost its data marker, is reported and the previous page stays. `--no-watch` turns all of this off, `--no-serve` has no server to reload.

## Theming

The built-in page is styled only through CSS variables on `:root`. Override them in a stylesheet and pass it with `--css`; the stylesheet is added after the built-in one.

```css
:root {
  --vrv-accent: #e11d48;
  --vrv-radius: 0;
  --vrv-font: 'IBM Plex Sans', sans-serif;
}
```

| Variable                                                      | Default (light)         | What it colors       |
| ------------------------------------------------------------- | ----------------------- | -------------------- |
| `--vrv-bg`                                                    | `#ffffff`               | Page background      |
| `--vrv-surface`                                               | `#f4f4f5`               | List headings, hover |
| `--vrv-fg`                                                    | `#18181b`               | Text                 |
| `--vrv-muted`                                                 | `#71717a`               | Secondary text       |
| `--vrv-border`                                                | `#e4e4e7`               | Borders              |
| `--vrv-accent`                                                | `#4f46e5`               | Selection, slider    |
| `--vrv-error`, `--vrv-warning`, `--vrv-success`, `--vrv-info` | red, amber, green, blue | Status colors        |
| `--vrv-radius`                                                | `0.5rem`                | Corner radius        |
| `--vrv-font`, `--vrv-mono`                                    | system fonts            | Text and code fonts  |

The dark palette follows `prefers-color-scheme`; override the variables inside a `@media (prefers-color-scheme: dark)` block to change it, or set them once to pin a theme.

## Replacing the page

`--template <file>` swaps the whole page for your own HTML. The viewer fills it in:

- `<!--vrv:data-->` (required) is replaced with `<script type="application/json" id="vrv-data">…</script>` that holds the merged run. Read it with `JSON.parse(document.getElementById('vrv-data').textContent)`.
- `<!--vrv:css-->` (optional) is replaced with the stylesheet from `--css`. Without the marker the stylesheet goes before `</head>`.
- The text of `<title>` is replaced with `--title`.

The data has this shape (every image URL is relative to the page and `null` when the run has no such file):

```jsonc
{
  "title": "Visual regression viewer",
  "manifests": 2, // files merged
  "tool": { "name": "…", "version": "…" },
  "runner": { "name": "…", "version": "…" },
  "counts": {
    "failed": 1,
    "passed": 40,
    "missing-baseline": 0,
    "created": 0,
    "updated": 0,
    "approved": 0,
  },
  "warnings": ["…"], // from the merge
  "entries": [
    {
      "id": "3f9c1a7b2d10", // short and URL-safe
      "name": "checkout",
      "status": "failed",
      "needsHuman": true, // failed or missing-baseline
      "test": {
        "filePath": "e2e/checkout.cy.ts",
        "titlePath": ["checkout", "renders"],
        "retry": 0,
      },
      "platform": "linux / chrome", // '' when unknown
      "viewport": { "width": 1000, "height": 660 },
      "message": "…",
      "source": "visual-regression-manifest.json", // the manifest the entry came from
      "comparison": {
        "diffRatio": 0.12,
        "maxDiffRatio": 0.01,
        "colorThreshold": 0.1,
        "colorMetric": "yiq",
      },
      "images": {
        "baseline": "shots/checkout.png",
        "actual": "shots/checkout.actual.png",
        "diff": "shots/checkout.diff.png",
      },
      "paths": {
        "baseline": "shots/checkout.png",
        "actual": "shots/checkout.actual.png",
        "diff": "shots/checkout.diff.png",
      }, // as the manifest names them
    },
  ],
}
```

When the pages are live-reloading, a small script that listens for changes is added before `</body>` of the page the server sends; the file on disk stays as it is.

## License

[MIT](https://github.com/visual-regression/visual-regression/blob/main/LICENSE)
