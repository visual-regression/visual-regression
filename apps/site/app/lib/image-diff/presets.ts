// The few examples the tool offers; the guide shows the same pairs, with the
// numbers the engines measured (data/diff-examples.json, scripts/make-diff-examples.mjs)
export interface Preset {
  id: string;
  label: string;
  /** what to look at, one sentence */
  hint: string;
  a: string;
  b: string;
}

export const presets: Preset[] = [
  {
    id: 'subpixel-text',
    label: 'Sub-pixel text',
    hint: 'Rendering noise, not a change: compare how many pixels each engine counts.',
    a: '/diff-examples/dashboard.png',
    b: '/diff-examples/subpixel-text.png',
  },
  {
    id: 'jpeg-compression',
    label: 'JPEG artifacts',
    hint: 'The same page through a JPEG: nothing changed, but look at the exact count.',
    a: '/diff-examples/blog-small.png',
    b: '/diff-examples/jpeg-compression.jpg',
  },
  {
    id: 'added-element',
    label: 'Added element',
    hint: 'A real regression, about 3% of the image: do all five engines see it?',
    a: '/diff-examples/dashboard.png',
    b: '/diff-examples/added-element.png',
  },
  {
    id: 'size-mismatch',
    label: 'Different sizes',
    hint: 'Two heights: the shorter image is padded, and the engines treat that differently.',
    a: '/diff-examples/settings-full.png',
    b: '/diff-examples/size-mismatch.png',
  },
];

/** `/image-diff?a=…&b=…` for a pair of image addresses */
export const toolLink = (a: string, b: string) =>
  `/image-diff?${new URLSearchParams({ a, b }).toString()}`;
