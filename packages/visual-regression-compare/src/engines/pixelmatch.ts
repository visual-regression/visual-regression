import pixelmatch from 'pixelmatch';
import type { DiffEngine, EngineOptions } from '../types';

export type PixelmatchOptions = {
  /** Per-pixel color tolerance, 0..1 (YIQ distance). Default `0.1`. */
  threshold?: number;
  /** Count anti-aliased pixels as differences. Default `false`. */
  includeAA?: boolean;
};

export const pixelmatchEngine = ({
  threshold = 0.1,
  includeAA = false,
}: PixelmatchOptions = {}): DiffEngine => ({
  name: 'pixelmatch',
  colorMetric: 'yiq',
  colorThreshold: threshold,
  compare(baseline, actual) {
    const { width, height } = baseline;
    const diff = new Uint8ClampedArray(width * height * 4);
    const diffPixels = pixelmatch(
      baseline.data,
      actual.data,
      diff,
      width,
      height,
      {
        threshold,
        includeAA,
      },
    );
    const area = width * height;
    return {
      diffPixels,
      diffRatio: area === 0 ? 0 : diffPixels / area,
      diff: { width, height, data: diff },
    };
  },
});

export const pixelmatchFrom = (options: EngineOptions) =>
  pixelmatchEngine(options as PixelmatchOptions);
