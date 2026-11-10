import { PNG } from 'pngjs';

/** A solid-color PNG, with `dots` red pixels in its first row. */
export const makePng = (
  width: number,
  height: number,
  color: [number, number, number, number] = [200, 200, 200, 255],
  dots = 0,
): Uint8Array => {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) png.data.set(color, i * 4);
  for (let x = 0; x < dots; x++) png.data.set([255, 0, 0, 255], x * 4);
  return PNG.sync.write(png);
};
