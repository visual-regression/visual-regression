import type { EngineResult, Options } from '../types';

export interface Images {
  a: ImageData;
  b: ImageData;
  /** true when the inputs had different sizes and were padded */
  padded: boolean;
}

export interface Engine {
  run(images: Images, options: Options): Promise<EngineResult>;
}

export const now = () => performance.now();

export const context2d = (canvas: OffscreenCanvas) => {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas context in this browser');
  return context;
};

export const toPng = (image: ImageData): Promise<Blob> => {
  const canvas = new OffscreenCanvas(image.width, image.height);
  context2d(canvas).putImageData(image, 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
};

export const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const percent = (ratio: number, digits = 2) => {
  if (ratio === 0) return '0%';
  const p = ratio * 100;
  const floor = 1 / 10 ** digits;
  return p < floor ? `<${floor}%` : `${p.toFixed(digits)}%`;
};

/** gray copy of `source` at `alpha` strength, white elsewhere: the usual diff background */
export const fadedGray = (source: ImageData, alpha = 0.1): ImageData => {
  const out = new ImageData(source.width, source.height);
  const s = source.data;
  const d = out.data;
  for (let i = 0; i < s.length; i += 4) {
    const gray =
      (s[i] * 0.299 + s[i + 1] * 0.587 + s[i + 2] * 0.114) * (s[i + 3] / 255);
    const v = 255 + (gray - 255) * alpha;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  return out;
};
