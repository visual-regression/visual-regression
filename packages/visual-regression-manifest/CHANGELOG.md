# Changelog

## 1.0.0 (2026-11-12)


### ⚠ BREAKING CHANGES

* **manifest:** field renames listed above; the package was never published, so no released version is affected.

### Features

* **manifest:** add a convert command line ([#29](https://github.com/visual-regression/visual-regression/issues/29)) ([e8df669](https://github.com/visual-regression/visual-regression/commit/e8df66970c72bf870c815fef427be0839a60f47b))
* **manifest:** align the format with CTRF and add CTRF converters ([b124ea6](https://github.com/visual-regression/visual-regression/commit/b124ea621efd0ea409b0d72a1cade96c3ae35ab0))
* **manifest:** converters for reg-cli, cypress-image-diff-js, Lost Pixel and Loki ([#22](https://github.com/visual-regression/visual-regression/issues/22)) ([5b99fd9](https://github.com/visual-regression/visual-regression/commit/5b99fd93501f94d978a5c69367270aa6f2a71089))
* **manifest:** converters for Vitest, jest-image-snapshot, cypress-visual-regression, BackstopJS and Roborazzi ([ea64942](https://github.com/visual-regression/visual-regression/commit/ea649426f528b939c979a3839b4ff2381efa9b30))
* **manifest:** prove every converter against its real tool (playwright, vitest, cypress, backstopjs, roborazzi) ([#18](https://github.com/visual-regression/visual-regression/issues/18)) ([8b1bbf1](https://github.com/visual-regression/visual-regression/commit/8b1bbf16b9d4288c938b20335b70676ec82e46fb))
* **site:** add scroll hint to the home page and tighten manifest copy ([#16](https://github.com/visual-regression/visual-regression/issues/16)) ([5d1ff87](https://github.com/visual-regression/visual-regression/commit/5d1ff87f3fed9f89fa88c30b6d24e51ffad1f01b))
* **site:** learn track, tool comparison, manifest docs generated from the package, and the viewer ([b6fd864](https://github.com/visual-regression/visual-regression/commit/b6fd8641bda8f296cfaf331f941c2e0e0ef4f302))


### Bug Fixes

* **manifest:** match jest-image-snapshot's real output, proven by an example project run in CI ([#17](https://github.com/visual-regression/visual-regression/issues/17)) ([9e5c11e](https://github.com/visual-regression/visual-regression/commit/9e5c11e89800eec07dc7646047c51cf2acf39c3c))
