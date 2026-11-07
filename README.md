<p align="center">
  <a href="https://visual-regression.dev">
    <img src="apps/site/public/brand/mark.svg" alt="visual-regression.dev" width="96" height="96">
  </a>
</p>

<h1 align="center">visual-regression</h1>

<p align="center">The home of <a href="https://visual-regression.dev">visual-regression.dev</a>: a vendor-neutral place to learn visual regression testing, compare the tools, and share one run manifest between them.</p>

| Path                                                                         | What it is                                                                                                                              |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [`packages/visual-regression-manifest`](packages/visual-regression-manifest) | The `visual-regression-manifest` format: JSON Schema, TypeScript types, reader, writer, merger and converters from other tools' output. |
| [`packages/visual-regression-viewer`](packages/visual-regression-viewer)     | The `visual-regression-viewer` command: reads the manifests of a run, serves a review page for it or writes it to a folder.             |
| `apps/site`                                                                  | The visual-regression.dev site (Docus, statically generated).                                                                           |

Maintained by the [pixsame](https://pixsame.com) team. Contributions from every visual regression tool are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

```sh
pnpm install
pnpm build
pnpm test
```

Node 20.9 or newer; the version in `.nvmrc` is what CI uses. pnpm comes from the `packageManager` field (corepack).

## License

[MIT](LICENSE)
