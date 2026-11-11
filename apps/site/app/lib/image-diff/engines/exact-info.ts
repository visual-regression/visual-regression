import type { EngineInfo } from '../types';

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
