import { PNG } from 'pngjs';
import type { RgbaImage } from './types';

const LFS_POINTER = 'version https://git-lfs.github.com/spec/';

/** Decodes a PNG. A Git LFS pointer file, which a checkout without `git lfs pull` leaves in place of an image, gets its own message. */
export const decodePng = (bytes: Uint8Array): RgbaImage => {
  const head = Buffer.from(bytes.subarray(0, LFS_POINTER.length)).toString(
    'latin1',
  );
  if (head === LFS_POINTER) {
    throw new Error(
      'the file is a Git LFS pointer, not an image; run `git lfs pull`',
    );
  }
  const { width, height, data } = PNG.sync.read(Buffer.from(bytes));
  return { width, height, data: new Uint8ClampedArray(data) };
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Width and height from the IHDR chunk of a PNG, without decoding it; `undefined` when the bytes are not a PNG. */
export const pngSize = (
  bytes: Uint8Array,
): { width: number; height: number } | undefined => {
  if (
    bytes.length < 24 ||
    PNG_SIGNATURE.some((byte, at) => bytes[at] !== byte) ||
    String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR'
  ) {
    return undefined;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
};

export const encodePng = ({ width, height, data }: RgbaImage): Uint8Array => {
  const png = new PNG({ width, height });
  png.data = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return PNG.sync.write(png);
};

/** Copies the top-left `width` x `height` area of `image` into a new image; the part beyond the source stays transparent. */
const resize = (image: RgbaImage, width: number, height: number): RgbaImage => {
  const data = new Uint8ClampedArray(width * height * 4);
  const rows = Math.min(height, image.height);
  const rowBytes = Math.min(width, image.width) * 4;
  for (let y = 0; y < rows; y++) {
    const from = y * image.width * 4;
    data.set(image.data.subarray(from, from + rowBytes), y * width * 4);
  }
  return { width, height, data };
};

/** Grows both images to the larger size with transparent pixels. */
export const padToSame = (
  a: RgbaImage,
  b: RgbaImage,
): [RgbaImage, RgbaImage] => {
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  return [resize(a, width, height), resize(b, width, height)];
};

/** Cuts both images to the smaller size. */
export const cropToSame = (
  a: RgbaImage,
  b: RgbaImage,
): [RgbaImage, RgbaImage] => {
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  return [resize(a, width, height), resize(b, width, height)];
};
