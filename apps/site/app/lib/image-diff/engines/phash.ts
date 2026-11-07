import { fadedGray, now, toPng, type Engine } from './shared';

// Perceptual hash in the pHash family: the image is reduced to a small
// grayscale square, a discrete cosine transform keeps its lowest frequencies
// (the coarse structure), and every coefficient becomes one bit by comparing
// it against the median coefficient. Two hashes are compared with their
// Hamming distance. Resampling is a plain area average, so hashes are stable
// within this tool but not bit-identical with other libraries' pHash values.
/** Side of the grayscale square the transform runs on, per kept side. */
const reducedSide = (bits: number) => bits * 4;

/**
 * Area-averages the image's luma (ITU-R 601, transparent pixels count as
 * white) down, or up, to a side×side square.
 */
export const reduce = (image: ImageData, side: number): Float64Array => {
  const { width, height, data } = image;
  const sums = new Float64Array(side * side);
  const weights = new Float64Array(side * side);
  const scaleX = side / width;
  const scaleY = side / height;
  for (let y = 0; y < height; y++) {
    const y0 = y * scaleY;
    const y1 = (y + 1) * scaleY;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const luma =
        data[i + 3] === 0
          ? 255
          : 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const x0 = x * scaleX;
      const x1 = (x + 1) * scaleX;
      // the pixel's footprint in the square, split over the cells it covers
      for (let cy = Math.floor(y0); cy < Math.min(side, Math.ceil(y1)); cy++) {
        const wy = Math.min(y1, cy + 1) - Math.max(y0, cy);
        for (
          let cx = Math.floor(x0);
          cx < Math.min(side, Math.ceil(x1));
          cx++
        ) {
          const w = wy * (Math.min(x1, cx + 1) - Math.max(x0, cx));
          sums[cy * side + cx] += luma * w;
          weights[cy * side + cx] += w;
        }
      }
    }
  }
  for (let k = 0; k < sums.length; k++) sums[k] /= weights[k];
  return sums;
};

/** The bits×bits lowest-frequency coefficients of a side×side DCT-II. */
export const lowFrequencies = (
  gray: Float64Array,
  side: number,
  bits: number,
): Float64Array => {
  const cos = new Float64Array(bits * side);
  for (let u = 0; u < bits; u++) {
    for (let x = 0; x < side; x++) {
      cos[u * side + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * side));
    }
  }
  // transform the rows first, keeping only the bits lowest horizontal terms
  const rows = new Float64Array(side * bits);
  for (let y = 0; y < side; y++) {
    for (let u = 0; u < bits; u++) {
      let sum = 0;
      for (let x = 0; x < side; x++)
        sum += gray[y * side + x] * cos[u * side + x];
      rows[y * bits + u] = sum;
    }
  }
  const out = new Float64Array(bits * bits);
  for (let v = 0; v < bits; v++) {
    for (let u = 0; u < bits; u++) {
      let sum = 0;
      for (let y = 0; y < side; y++)
        sum += rows[y * bits + u] * cos[v * side + y];
      out[v * bits + u] = sum;
    }
  }
  return out;
};

const median = (values: Float64Array) => {
  const sorted = Array.from(values).sort((x, y) => x - y);
  const mid = sorted.length / 2;
  return sorted.length % 2
    ? sorted[Math.floor(mid)]
    : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** One bit per kept coefficient: 1 when it is above the median. */
const hashOf = (gray: Float64Array, side: number, bits: number) => {
  const coefficients = lowFrequencies(gray, side, bits);
  const m = median(coefficients);
  // the epsilon keeps floating point noise from flipping bits of flat images
  return Uint8Array.from(coefficients, (c) => (c > m + 1e-6 ? 1 : 0));
};

export const phash = (image: ImageData, bits: number): Uint8Array => {
  const side = reducedSide(bits);
  return hashOf(reduce(image, side), side, bits);
};

export const hex = (hash: Uint8Array) => {
  let out = '';
  for (let i = 0; i < hash.length; i += 4) {
    out += (
      (hash[i] << 3) |
      (hash[i + 1] << 2) |
      (hash[i + 2] << 1) |
      hash[i + 3]
    ).toString(16);
  }
  return out;
};

export const engine: Engine = {
  async run({ a, b }, options) {
    const bits = Number(options.bits);
    const side = reducedSide(bits);
    const start = now();
    const grayA = reduce(a, side);
    const grayB = reduce(b, side);
    const ha = hashOf(grayA, side, bits);
    const hb = hashOf(grayB, side, bits);
    let distance = 0;
    for (let i = 0; i < ha.length; i++) if (ha[i] !== hb[i]) distance++;
    const elapsedMs = now() - start;

    // the hash is computed in the frequency domain, so there is no block to
    // point at; show where the reduced images it was computed from differ
    const out = fadedGray(a);
    for (let y = 0; y < a.height; y++) {
      const cy = Math.min(side - 1, Math.floor((y * side) / a.height));
      for (let x = 0; x < a.width; x++) {
        const cx = Math.min(side - 1, Math.floor((x * side) / a.width));
        const delta = Math.abs(grayA[cy * side + cx] - grayB[cy * side + cx]);
        const alpha = Math.min(1, delta / 64);
        if (alpha === 0) continue;
        const i = (y * a.width + x) * 4;
        out.data[i] = Math.round(out.data[i] * (1 - alpha) + 255 * alpha);
        out.data[i + 1] = Math.round(
          out.data[i + 1] * (1 - alpha) + 80 * alpha,
        );
        out.data[i + 2] = Math.round(out.data[i + 2] * (1 - alpha));
      }
    }
    return {
      mismatch: distance,
      total: ha.length,
      unit: 'bits',
      elapsedMs,
      metrics: [
        {
          label: 'Hamming distance',
          value: `${distance} / ${ha.length}`,
          primary: true,
        },
        { label: 'baseline hash', value: hex(ha) },
        { label: 'actual hash', value: hex(hb) },
      ],
      diff: await toPng(out),
      legend: `Where the two ${side}×${side} grayscale reductions the hash is computed from differ, in orange over a faded baseline.`,
      notes: [],
    };
  },
};
