/**
 * A compact port of pixelmatch's decision rule (ISC, Vladimir Agafonkin and
 * Mapbox): per-pixel color distance in the YIQ space, anti-aliasing
 * detection, and a diff image. It exists so the learn demos make the same
 * call a real comparator makes; use pixelmatch itself in a tool.
 */
export interface PixelDiffOptions {
  /** Per-pixel color distance, 0 to 1 (pixelmatch's `threshold`, default 0.1). */
  threshold?: number;
  /** Count anti-aliased pixels as differences (pixelmatch's `includeAA`). */
  includeAA?: boolean;
}

export interface PixelDiffResult {
  /** Pixels that differ, after the per-pixel threshold and AA detection. */
  count: number;
  /** `count` divided by the number of pixels. */
  ratio: number;
  /** Differing pixels that were skipped as anti-aliasing. */
  aaSkipped: number;
  /** Faded baseline with the differing pixels in red and skipped ones in amber. */
  diff: ImageData;
}

const rgb2y = (r: number, g: number, b: number) =>
  r * 0.29889531 + g * 0.58662247 + b * 0.11448223;
const rgb2i = (r: number, g: number, b: number) =>
  r * 0.59597799 - g * 0.2741761 - b * 0.32180189;
const rgb2q = (r: number, g: number, b: number) =>
  r * 0.21147017 - g * 0.52261711 + b * 0.31114694;
const blend = (c: number, a: number) => 255 + (c - 255) * a;

function colorDelta(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  k: number,
  m: number,
  yOnly = false,
) {
  let r1 = a[k]!;
  let g1 = a[k + 1]!;
  let b1 = a[k + 2]!;
  let a1 = a[k + 3]!;
  let r2 = b[m]!;
  let g2 = b[m + 1]!;
  let b2 = b[m + 2]!;
  let a2 = b[m + 3]!;
  if (a1 === a2 && r1 === r2 && g1 === g2 && b1 === b2) return 0;
  if (a1 < 255) {
    a1 /= 255;
    r1 = blend(r1, a1);
    g1 = blend(g1, a1);
    b1 = blend(b1, a1);
  }
  if (a2 < 255) {
    a2 /= 255;
    r2 = blend(r2, a2);
    g2 = blend(g2, a2);
    b2 = blend(b2, a2);
  }
  const y1 = rgb2y(r1, g1, b1);
  const y2 = rgb2y(r2, g2, b2);
  const y = y1 - y2;
  if (yOnly) return y;
  const i = rgb2i(r1, g1, b1) - rgb2i(r2, g2, b2);
  const q = rgb2q(r1, g1, b1) - rgb2q(r2, g2, b2);
  const delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;
  return y1 > y2 ? -delta : delta;
}

function hasManySiblings(
  img: Uint8ClampedArray,
  x1: number,
  y1: number,
  width: number,
  height: number,
) {
  const x0 = Math.max(x1 - 1, 0);
  const y0 = Math.max(y1 - 1, 0);
  const x2 = Math.min(x1 + 1, width - 1);
  const y2 = Math.min(y1 + 1, height - 1);
  const pos = (y1 * width + x1) * 4;
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
  for (let x = x0; x <= x2; x++) {
    for (let y = y0; y <= y2; y++) {
      if (x === x1 && y === y1) continue;
      const pos2 = (y * width + x) * 4;
      if (
        img[pos] === img[pos2] &&
        img[pos + 1] === img[pos2 + 1] &&
        img[pos + 2] === img[pos2 + 2] &&
        img[pos + 3] === img[pos2 + 3]
      ) {
        zeroes++;
      }
      if (zeroes > 2) return true;
    }
  }
  return false;
}

/** pixelmatch's heuristic: a pixel between two very different neighbors. */
function antialiased(
  img: Uint8ClampedArray,
  x1: number,
  y1: number,
  width: number,
  height: number,
  other: Uint8ClampedArray,
) {
  const x0 = Math.max(x1 - 1, 0);
  const y0 = Math.max(y1 - 1, 0);
  const x2 = Math.min(x1 + 1, width - 1);
  const y2 = Math.min(y1 + 1, height - 1);
  const pos = (y1 * width + x1) * 4;
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
  let min = 0;
  let max = 0;
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  for (let x = x0; x <= x2; x++) {
    for (let y = y0; y <= y2; y++) {
      if (x === x1 && y === y1) continue;
      const delta = colorDelta(img, img, pos, (y * width + x) * 4, true);
      if (delta === 0) {
        zeroes++;
        if (zeroes > 2) return false;
      } else if (delta < min) {
        min = delta;
        minX = x;
        minY = y;
      } else if (delta > max) {
        max = delta;
        maxX = x;
        maxY = y;
      }
    }
  }
  if (min === 0 || max === 0) return false;
  return (
    (hasManySiblings(img, minX, minY, width, height) &&
      hasManySiblings(other, minX, minY, width, height)) ||
    (hasManySiblings(img, maxX, maxY, width, height) &&
      hasManySiblings(other, maxX, maxY, width, height))
  );
}

export function pixelDiff(
  baseline: ImageData,
  actual: ImageData,
  { threshold = 0.1, includeAA = false }: PixelDiffOptions = {},
): PixelDiffResult {
  const { width, height } = baseline;
  const a = baseline.data;
  const b = actual.data;
  const out = new ImageData(width, height);
  const o = out.data;
  const maxDelta = 35215 * threshold * threshold;
  let count = 0;
  let aaSkipped = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = (y * width + x) * 4;
      const delta = colorDelta(a, b, pos, pos);
      if (Math.abs(delta) > maxDelta) {
        if (
          !includeAA &&
          (antialiased(a, x, y, width, height, b) ||
            antialiased(b, x, y, width, height, a))
        ) {
          aaSkipped++;
          o[pos] = 245;
          o[pos + 1] = 158;
          o[pos + 2] = 11;
          o[pos + 3] = 255;
        } else {
          count++;
          o[pos] = 239;
          o[pos + 1] = 68;
          o[pos + 2] = 68;
          o[pos + 3] = 255;
        }
      } else {
        // the faded baseline pixelmatch draws under the differences
        const gray = blend(rgb2y(a[pos]!, a[pos + 1]!, a[pos + 2]!), 0.15);
        o[pos] = gray;
        o[pos + 1] = gray;
        o[pos + 2] = gray;
        o[pos + 3] = 255;
      }
    }
  }
  return { count, ratio: count / (width * height), aaSkipped, diff: out };
}
