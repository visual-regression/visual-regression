# Contributing

Thanks for your interest. This repository is maintained by the pixsame team and is meant to stay useful to every visual regression tool, not only ours. Corrections to the site, new converters for your tool's output, and changes to the manifest format are all welcome.

## Questions and bugs

- Questions go to [GitHub Discussions](https://github.com/Visual-Regression/visual-regression/discussions).
- Bugs and feature requests go to [GitHub Issues](https://github.com/Visual-Regression/visual-regression/issues). Check for an existing one first.
- Security problems: see [SECURITY.md](SECURITY.md), never a public issue.

## Pull requests

- Branch from `main` and open the PR against it.
- Use [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit messages and the PR title; releases are cut from them.
- Make sure `pnpm lint`, `pnpm build` and `pnpm test` pass.
- Commits are squashed on merge, so the number of commits does not matter.

## Adding your tool

- A converter from your tool's output to a manifest is one file under `packages/visual-regression-manifest/src/convert/`, one fixture directory under `__tests__/`, and one test. Follow an existing converter.
- A comparison entry for the site is one YAML file under `apps/site/data/tools/`. Every claim needs a source URL from your own docs and a `lastVerified` date.

## Development setup

```sh
pnpm install
pnpm build
pnpm test
```

Node 20.9 or newer (CI uses the version in `.nvmrc`). pnpm is pinned through the `packageManager` field.
