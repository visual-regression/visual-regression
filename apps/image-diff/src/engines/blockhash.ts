import type { EngineInfo } from '../types';
import { fadedGray, now, toPng, type Engine } from './shared';

// Perceptual hash of the blockhash family (Yang, Weng, Lee 2006): the image is
// cut into bits×bits blocks, every block's summed brightness becomes one bit
// by comparing it against the median of its band of four rows. Two hashes are
// compared with their Hamming distance.
export const info: EngineInfo = {
  id: 'blockhash',
  name: 'Perceptual hash (blockhash)',
  summary:
    'Reduces each image to a short fingerprint of block brightnesses and compares the fingerprints bit by bit. Blind to small changes, which is the point: it tells "same picture" from "different picture", not "pixel-perfect".',
  options: [
    {
      key: 'bits',
      label: 'bits',
      hint: 'Side of the block grid; the hash has bits² bits.',
      type: 'select',
      choices: [
        { value: '8', label: '8 (64-bit hash)' },
        { value: '16', label: '16 (256-bit hash)' },
        { value: '32', label: '32 (1024-bit hash)' },
      ],
    },
  ],
  defaults: { bits: '16' },
  sizeMismatch:
    'Indifferent to size by design: every image is reduced to the same grid, so the padded images are compared.',
};

const median = (values: number[]) => {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length / 2;
  return sorted.length % 2
    ? sorted[Math.floor(mid)]
    : (sorted[mid - 1] + sorted[mid]) / 2;
};

export const blockhash = (image: ImageData, bits: number): Uint8Array => {
  const { width, height, data } = image;
  const blocks = new Float64Array(bits * bits);
  const blockWidth = width / bits;
  const blockHeight = height / bits;
  for (let y = 0; y < height; y++) {
    const by = Math.min(bits - 1, Math.floor(y / blockHeight));
    for (let x = 0; x < width; x++) {
      const bx = Math.min(bits - 1, Math.floor(x / blockWidth));
      const i = (y * width + x) * 4;
      // transparent pixels count as white, like the reference implementation
      const value =
        data[i + 3] === 0 ? 765 : data[i] + data[i + 1] + data[i + 2];
      blocks[by * bits + bx] += value;
    }
  }
  const hash = new Uint8Array(bits * bits);
  const bandRows = 4;
  for (let band = 0; band < bits; band += bandRows) {
    const rows = Math.min(bandRows, bits - band);
    const values = Array.from(
      blocks.subarray(band * bits, (band + rows) * bits),
    );
    const m = median(values);
    for (let k = 0; k < values.length; k++) {
      hash[band * bits + k] = values[k] > m ? 1 : 0;
    }
  }
  return hash;
};

const hex = (hash: Uint8Array) => {
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
    const start = now();
    const ha = blockhash(a, bits);
    const hb = blockhash(b, bits);
    let distance = 0;
    for (let i = 0; i < ha.length; i++) if (ha[i] !== hb[i]) distance++;
    const elapsedMs = now() - start;

    // paint the blocks whose bit flipped over a faded baseline
    const out = fadedGray(a);
    const blockWidth = a.width / bits;
    const blockHeight = a.height / bits;
    for (let k = 0; k < ha.length; k++) {
      if (ha[k] === hb[k]) continue;
      const x0 = Math.floor((k % bits) * blockWidth);
      const y0 = Math.floor(Math.floor(k / bits) * blockHeight);
      const x1 = Math.floor(((k % bits) + 1) * blockWidth);
      const y1 = Math.floor((Math.floor(k / bits) + 1) * blockHeight);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * a.width + x) * 4;
          out.data[i] = 255;
          out.data[i + 1] = 80;
          out.data[i + 2] = 0;
        }
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
      legend: 'Blocks whose hash bit flipped, in orange over a faded baseline.',
      notes: [],
    };
  },
};
