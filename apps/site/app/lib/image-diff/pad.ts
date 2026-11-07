import type { Padding } from './types';

type Pixels = { width: number; height: number; data: Uint8ClampedArray };

// Places the image in the top-left corner of a width×height RGBA buffer; the
// rest is opaque magenta or fully transparent.
export const padPixels = (
  image: Pixels,
  width: number,
  height: number,
  padding: Padding,
): Uint8ClampedArray<ArrayBuffer> => {
  const out = new Uint8ClampedArray(width * height * 4);
  if (padding === 'magenta') {
    for (let i = 0; i < out.length; i += 4) {
      out[i] = 255;
      out[i + 2] = 255;
      out[i + 3] = 255;
    }
  }
  const copyWidth = Math.min(image.width, width);
  const copyHeight = Math.min(image.height, height);
  for (let y = 0; y < copyHeight; y++) {
    const from = y * image.width * 4;
    out.set(image.data.subarray(from, from + copyWidth * 4), y * width * 4);
  }
  return out;
};

export const pad = (
  image: ImageData,
  width: number,
  height: number,
  padding: Padding,
): ImageData =>
  image.width === width && image.height === height
    ? image
    : new ImageData(padPixels(image, width, height, padding), width, height);
