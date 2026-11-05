import { ssim } from 'ssim.js';
import type { EngineInfo } from '../types';
import { now, toPng, type Engine } from './shared';

export const info: EngineInfo = {
  id: 'ssim',
  name: 'SSIM',
  package: {
    name: 'ssim.js',
    version: '3.5.0',
    url: 'https://github.com/obartra/ssim',
  },
  summary:
    'Structural similarity: compares luminance, contrast and structure over sliding windows instead of single pixels, the way a viewer perceives an image. 1 is identical; compression noise and tiny shifts barely move it, a missing element does.',
  options: [
    {
      key: 'ssim',
      label: 'ssim',
      hint: '"fast" uses a box filter, "original" the Gaussian window of the paper, "bezkrovny" a fast approximation, "weber" a memory-light variant.',
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
      hint: '"original" shrinks images larger than 256 px the way the reference implementation does (fast, coarse map); off compares every pixel (slow on large images).',
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
    ssim: 'fast',
    windowSize: 11,
    downsample: 'original',
    dissimilar: 0.9,
  },
  sizeMismatch:
    'Throws on different sizes; it only runs here because the tool pads the smaller image first.',
};

export const engine: Engine = {
  async run({ a, b, padded }, options) {
    const start = now();
    const downsample = String(options.downsample);
    const {
      mssim,
      ssim_map,
      performance: analysis,
    } = ssim(a, b, {
      ssim: String(options.ssim) as 'fast',
      windowSize: Number(options.windowSize),
      downsample: downsample === 'false' ? false : (downsample as 'original'),
    });
    const elapsedMs = now() - start;
    const below = Number(options.dissimilar);
    const map = new ImageData(ssim_map.width, ssim_map.height);
    let mismatch = 0;
    for (let i = 0; i < ssim_map.data.length; i++) {
      const value = Math.max(0, Math.min(1, ssim_map.data[i]));
      if (value < below) mismatch++;
      const gray = Math.round(value * 255);
      map.data[i * 4] = map.data[i * 4 + 1] = map.data[i * 4 + 2] = gray;
      map.data[i * 4 + 3] = 255;
    }
    const notes: string[] = [];
    if (padded) notes.push('Ran on the padded images.');
    if (ssim_map.width < a.width - Number(options.windowSize)) {
      notes.push(
        `Images were downsampled before comparing; the map is ${ssim_map.width}×${ssim_map.height}.`,
      );
    }
    return {
      mismatch,
      total: ssim_map.data.length,
      unit: 'windows',
      elapsedMs,
      metrics: [
        { label: 'mean SSIM', value: mssim.toFixed(4), primary: true },
        { label: 'performance', value: `${analysis} ms` },
        { label: 'map', value: `${ssim_map.width}×${ssim_map.height}` },
      ],
      diff: await toPng(map),
      legend:
        'SSIM map: white where the windows match, darker the less they do.',
      notes,
    };
  },
};
