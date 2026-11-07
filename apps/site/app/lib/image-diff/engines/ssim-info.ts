import type { EngineInfo } from '../types';

export const info: EngineInfo = {
  id: 'ssim',
  name: 'SSIM',
  package: {
    name: 'ssim.js',
    version: '3.5.0',
    url: 'https://github.com/obartra/ssim',
  },
  summary:
    'Structural similarity: compares luminance, contrast and structure over sliding windows instead of single pixels, the way a viewer perceives an image. 1 is identical; compression noise barely moves it, a missing element does.',
  options: [
    {
      key: 'ssim',
      label: 'ssim',
      hint: '"weber" (the library default) averages over a square window with summed-area tables; "fast" is an optimized Gaussian-window version of the paper\'s reference scripts, "original" a line-by-line port of them (slow), "bezkrovny" a port of a Java implementation.',
      type: 'select',
      choices: [
        { value: 'fast', label: 'fast' },
        { value: 'original', label: 'original' },
        { value: 'bezkrovny', label: 'bezkrovny' },
        { value: 'weber', label: 'weber' },
      ],
    },
    {
      key: 'windowSize',
      label: 'windowSize',
      hint: 'Side of the sliding window in pixels.',
      type: 'number',
      min: 3,
      max: 31,
      step: 2,
    },
    {
      key: 'downsample',
      label: 'downsample',
      hint: '"original" (the library default) shrinks images whose smaller side is over 256 px the way the reference implementation does: fast, but a one-pixel shift can vanish. Off compares every pixel (slow on large images).',
      type: 'select',
      choices: [
        { value: 'original', label: 'original' },
        { value: 'fast', label: 'fast' },
        { value: 'false', label: 'off' },
      ],
    },
    {
      key: 'dissimilar',
      label: 'count windows below',
      hint: 'Windows with an SSIM below this value are counted as mismatches (the tool’s count, not part of SSIM).',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.01,
    },
  ],
  defaults: {
    ssim: 'weber',
    windowSize: 11,
    downsample: 'original',
    dissimilar: 0.9,
  },
  sizeMismatch:
    'Throws on different sizes; it only runs here because the tool pads the smaller image first.',
};
