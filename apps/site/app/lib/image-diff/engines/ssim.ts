import { ssim } from 'ssim.js';
import { now, toPng, type Engine } from './shared';

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
