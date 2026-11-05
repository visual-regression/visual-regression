import type { EngineInfo } from '../types';
import { fadedGray, hexToRgb, now, toPng, type Engine } from './shared';

// The reference point: a pixel differs when any channel differs, no tolerance
export const info: EngineInfo = {
  id: 'exact',
  name: 'Exact pixels',
  summary:
    'Every pixel whose red, green, blue or alpha value differs by at least one counts. No tolerance, no anti-aliasing detection: the strictest possible comparison and the reference the other engines are measured against.',
  options: [
    {
      key: 'tolerance',
      label: 'Per-channel tolerance',
      hint: '0 is an exact match; a channel may differ by up to this many values (0–255).',
      type: 'number',
      min: 0,
      max: 255,
      step: 1,
    },
    { key: 'diffColor', label: 'Diff color', type: 'color' },
  ],
  defaults: { tolerance: 0, diffColor: '#ff0000' },
  sizeMismatch:
    'Compares what the padded images have in common, so the padding itself counts as a difference.',
};

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
