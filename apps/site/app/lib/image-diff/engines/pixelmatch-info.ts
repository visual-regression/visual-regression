import type { EngineInfo } from '../types';

export const info: EngineInfo = {
  id: 'pixelmatch',
  name: 'pixelmatch',
  package: {
    name: 'pixelmatch',
    version: '8.0.0',
    url: 'https://github.com/mapbox/pixelmatch',
  },
  summary:
    'The pixel comparison most JavaScript tools build on: Playwright, jest-image-snapshot and pixsame use older releases of it. Compares colors with a perceptual distance (OKLab since 8.0, YIQ before) and a threshold, and detects anti-aliased pixels so font rendering noise is not counted.',
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
