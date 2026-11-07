import { fadedGray, hexToRgb, now, toPng, type Engine } from './shared';

// The reference point: a pixel differs when any channel differs, no tolerance
export const engine: Engine = {
  async run({ a, b }, options) {
    const start = now();
    const tolerance = Number(options.tolerance);
    const [r, g, bl] = hexToRgb(String(options.diffColor));
    const out = fadedGray(a);
    const d = out.data;
    const pa = a.data;
    const pb = b.data;
    let mismatch = 0;
    for (let i = 0; i < pa.length; i += 4) {
      if (
        Math.abs(pa[i] - pb[i]) > tolerance ||
        Math.abs(pa[i + 1] - pb[i + 1]) > tolerance ||
        Math.abs(pa[i + 2] - pb[i + 2]) > tolerance ||
        Math.abs(pa[i + 3] - pb[i + 3]) > tolerance
      ) {
        mismatch++;
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = bl;
      }
    }
    const elapsedMs = now() - start;
    return {
      mismatch,
      total: a.width * a.height,
      unit: 'pixels',
      elapsedMs,
      metrics: [],
      diff: await toPng(out),
      legend: 'Differing pixels in the diff color over a faded baseline.',
      notes: [],
    };
  },
};
