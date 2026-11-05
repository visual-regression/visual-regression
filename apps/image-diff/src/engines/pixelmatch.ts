import pixelmatch from 'pixelmatch';
import type { EngineInfo } from '../types';
import { hexToRgb, now, toPng, type Engine } from './shared';

export const info: EngineInfo = {
  id: 'pixelmatch',
  name: 'pixelmatch',
  package: {
    name: 'pixelmatch',
    version: '8.0.0',
    url: 'https://github.com/mapbox/pixelmatch',
  },
  summary:
    'The pixel comparison most JavaScript tools build on (Playwright, jest-image-snapshot, pixsame, ...). Compares colors in a perceptual color space with a threshold and detects anti-aliased pixels so font rendering noise is not counted.',
  options: [
    {
      key: 'threshold',
      label: 'threshold',
      hint: 'Maximum perceptual color distance (OKLab, 0–1) for two pixels to count as equal. Smaller is more sensitive.',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      key: 'includeAA',
      label: 'includeAA',
      hint: 'Count anti-aliased pixels as differences instead of detecting and ignoring them.',
      type: 'boolean',
    },
    {
      key: 'alpha',
      label: 'alpha',
      hint: 'Opacity of the original image in the diff output.',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.05,
    },
    { key: 'diffColor', label: 'diffColor', type: 'color' },
    {
      key: 'diffColorAlt',
      label: 'diffColorAlt',
      hint: 'Pixels darker in the actual image than in the baseline get this color, to tell added from removed.',
      type: 'color',
    },
    {
      key: 'useDiffColorAlt',
      label: 'use diffColorAlt',
      type: 'boolean',
    },
    {
      key: 'diffMask',
      label: 'diffMask',
      hint: 'Draw the diff over a transparent background instead of the faded baseline.',
      type: 'boolean',
    },
  ],
  defaults: {
    threshold: 0.1,
    includeAA: false,
    alpha: 0.1,
    diffColor: '#ff0000',
    diffColorAlt: '#ff0000',
    useDiffColorAlt: false,
    diffMask: false,
  },
  sizeMismatch:
    'Throws "Image sizes do not match"; it only runs here because the tool pads the smaller image first.',
};

export const engine: Engine = {
  async run({ a, b, padded }, options) {
    const out = new ImageData(a.width, a.height);
    const start = now();
    const mismatch = pixelmatch(a.data, b.data, out.data, a.width, a.height, {
      threshold: Number(options.threshold),
      includeAA: Boolean(options.includeAA),
      alpha: Number(options.alpha),
      diffColor: hexToRgb(String(options.diffColor)),
      diffColorAlt: options.useDiffColorAlt
        ? hexToRgb(String(options.diffColorAlt))
        : undefined,
      diffMask: Boolean(options.diffMask),
    });
    const elapsedMs = now() - start;
    return {
      mismatch,
      total: a.width * a.height,
      unit: 'pixels',
      elapsedMs,
      metrics: [],
      diff: await toPng(out),
      legend: options.includeAA
        ? 'Differing pixels in the diff color.'
        : 'Differing pixels in the diff color; anti-aliased pixels it ignored in yellow.',
      notes: padded ? ['Ran on the padded images.'] : [],
    };
  },
};
