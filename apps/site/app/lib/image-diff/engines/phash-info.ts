import type { EngineInfo } from '../types';

export const info: EngineInfo = {
  id: 'phash',
  name: 'Perceptual hash (pHash)',
  summary:
    'Reduces each image to a short fingerprint of its coarse structure and compares the fingerprints bit by bit. Survives resizing and small shifts, which is the point: it tells "same picture" from "different picture", not "pixel-perfect".',
  options: [
    {
      key: 'bits',
      label: 'bits',
      hint: 'Side of the kept low-frequency square; the hash has bits² bits.',
      type: 'select',
      choices: [
        { value: '8', label: '8 (64-bit hash)' },
        { value: '16', label: '16 (256-bit hash)' },
      ],
    },
  ],
  defaults: { bits: '8' },
  sizeMismatch:
    'Indifferent to size by design: every image is reduced to the same square, so the padded images are compared.',
};
