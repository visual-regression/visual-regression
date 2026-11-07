import pixelmatch from 'pixelmatch';
import { hexToRgb, now, toPng, type Engine } from './shared';

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
