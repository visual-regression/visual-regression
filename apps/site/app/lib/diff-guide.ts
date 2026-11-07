// The prose side of the diff algorithm guide: the algorithms and the
// situations. Every number in here comes from data/diff-examples.json through
// `figure` and `field`, never typed by hand.
import { examples, field, figure } from './diff-examples';

export interface Situation {
  id: string;
  question: string;
  /** the algorithm that fits, as named in the tool */
  pick: string;
  /** the measured evidence, one sentence */
  fact: () => string;
  /** why, for the guide */
  why: string;
}

export const situations: Situation[] = [
  {
    id: 'strict',
    question: 'Every pixel must match',
    pick: 'Exact pixels',
    fact: () =>
      `Counts the one-letter typo (${figure('typo', 'exact')} of the pixels), and also ${figure('noise', 'exact')} for noise nobody can see.`,
    why: 'Nothing is tolerated, so nothing is missed and nothing needs explaining. It fits renders that are deterministic: generated images, or one machine and one browser build.',
  },
  {
    id: 'text',
    question: 'Text renders slightly differently across machines',
    pick: 'pixelmatch',
    fact: () =>
      `Sub-pixel text shift: exact counts ${figure('subpixel-text', 'exact')}, pixelmatch ${figure('subpixel-text', 'pixelmatch')} (${figure('subpixel-text', 'pixelmatch-aa')} with anti-aliasing detection off).`,
    why: 'It recognizes anti-aliased pixels and leaves them out, which is most of what font rasterizers disagree about. What is left still needs a maximum diff ratio, or a pinned renderer.',
  },
  {
    id: 'color',
    question: 'A color must not drift, even slightly',
    pick: 'pixelmatch, low threshold',
    fact: () =>
      `A three-point color drift: pixelmatch at its default threshold counts ${figure('color-tint', 'pixelmatch')}, with threshold 0 ${figure('color-tint', 'pixelmatch-0')}; SSIM reads ${figure('color-tint', 'ssim')}.`,
    why: 'Per-pixel color distance with a threshold you set is the only family here that sees small color changes. SSIM works on brightness and does not.',
  },
  {
    id: 'lossy',
    question: 'Images go through JPEG or another lossy step',
    pick: 'SSIM',
    fact: () =>
      `JPEG at quality 60: exact flags ${figure('jpeg-compression', 'exact')} of the image, pixelmatch ${figure('jpeg-compression', 'pixelmatch')}, SSIM ${figure('jpeg-compression', 'ssim')}.`,
    why: 'Compression noise is spread over the whole image at a low amplitude. A window-based structural score barely moves; a per-pixel exact comparison reports almost everything.',
  },
  {
    id: 'score',
    question: 'You want one number a person can read',
    pick: 'SSIM',
    fact: () =>
      `An added cookie notice scores ${figure('added-element', 'ssim')}, a clean copy 1. But a one-letter typo scores ${figure('typo', 'ssim')}: a mean hides small local changes.`,
    why: 'A score between 0 and 1 is easy to chart and to put a limit on. Read it with the map of where the windows differ, not alone.',
  },
  {
    id: 'same-picture',
    question: 'Is it still the same picture? Sizes may differ',
    pick: 'Perceptual hash',
    fact: () =>
      `Noise and JPEG: ${figure('noise', 'phash')} bits differ. Added element: ${figure('added-element', 'phash')}. Different heights: ${figure('size-mismatch', 'phash')}. A typo: ${figure('typo', 'phash')}.`,
    why: 'It keeps only the coarse structure, so it survives resizing and compression and says "different picture" for large changes. It cannot see small ones.',
  },
  {
    id: 'speed',
    question: 'Thousands of screenshots, speed matters',
    pick: 'Exact pixels or pixelmatch',
    fact: () =>
      `On a 960×600 page: exact ${field('typo', 'exact', 'ms')}, pixelmatch ${field('typo', 'pixelmatch', 'ms')}, pHash ${field('typo', 'phash', 'ms')}, Resemble.js ${field('typo', 'resemble', 'ms')}, SSIM ${field('typo', 'ssim', 'ms')} (median of five runs, in a worker).`,
    why: 'One pass over the pixels with a cheap test is as fast as it gets in JavaScript. Native comparators exist for when even that is the slow part of the run.',
  },
];

export interface Algorithm {
  id: string;
  name: string;
  package?: { name: string; url: string };
  measures: string;
  returns: string;
  knobs: string;
  strengths: string;
  weaknesses: string;
  use: string;
  /** a config of data/diff-examples.json whose timing stands for the algorithm */
  config: string;
}

export const algorithms: Algorithm[] = [
  {
    id: 'exact',
    name: 'Exact pixels',
    measures:
      'A pixel differs when any of its four channels (red, green, blue, alpha) differs by more than the tolerance, which is 0 by default.',
    returns: 'A count of differing pixels, and a diff image.',
    knobs: 'A per-channel tolerance.',
    strengths: 'Nothing slips through, easy to explain, the cheapest.',
    weaknesses:
      'Counts rendering noise and compression artifacts as changes; no notion of what a person can see.',
    use: 'Deterministic renders: generated images, one machine and one browser build.',
    config: 'exact',
  },
  {
    id: 'pixelmatch',
    name: 'pixelmatch',
    package: {
      name: 'pixelmatch',
      url: 'https://github.com/mapbox/pixelmatch',
    },
    measures: `A perceptual color distance per pixel (OKLab in ${examples.engines.pixelmatch}, YIQ in the older releases most tools bundle), compared with a threshold; pixels that look anti-aliased are detected and skipped.`,
    returns:
      'A count of mismatched pixels, and a diff image; with windowSize the highest count in any sliding window instead.',
    knobs:
      'threshold (0 to 1, default 0.1), includeAA, an ignore mask, the window size; the limit on the count is yours.',
    strengths:
      'Small, fast, anti-aliasing aware, a color threshold that follows what eyes notice.',
    weaknesses:
      'A threshold means something different in each release and color space; a count says how many pixels, not how much they matter; images must have the same size.',
    use: 'The comparator behind most JavaScript test tools.',
    config: 'pixelmatch',
  },
  {
    id: 'resemble',
    name: 'Resemble.js',
    package: {
      name: 'resemblejs',
      url: 'https://github.com/rsmbl/Resemble.js',
    },
    measures:
      'Per-channel differences against tolerances (16 per channel by default) and brightness bounds, with presets that also detect anti-aliasing or compare brightness only.',
    returns:
      'A mismatch percentage, whether the sizes match, the bounding box of the differences, and a diff image.',
    knobs:
      'The ignore presets (nothing, less, antialiasing, colors, alpha), the output style, scaling to the same size, ignored boxes.',
    strengths:
      'Presets that work without tuning, tolerates different sizes, reports where the changes are.',
    weaknesses:
      'The presets are blunt (the antialiasing one also raises the tolerance to 32 per channel), slower than the pixel loops above in these measurements.',
    use: 'BackstopJS builds on a Node fork of it.',
    config: 'resemble',
  },
  {
    id: 'ssim',
    name: 'SSIM',
    package: { name: 'ssim.js', url: 'https://github.com/obartra/ssim' },
    measures:
      'Structural similarity: luminance, contrast and structure compared over sliding windows (11 by 11 by default) of the grayscale images, averaged.',
    returns:
      'A mean score from 0 to 1 (1 is identical), and a map with a score per window.',
    knobs:
      'The window size, the implementation variant, downsampling; the limit on the score is yours.',
    strengths:
      'Tolerates compression and noise, one readable score, the map shows where.',
    weaknesses:
      'Blind to color changes at equal brightness, a mean hides small local changes, slower, and the default downsampling blurs one-pixel details.',
    use: 'Perceptual quality checks; jest-image-snapshot offers it as its second comparison method.',
    config: 'ssim',
  },
  {
    id: 'phash',
    name: 'Perceptual hash',
    measures:
      'Each image is reduced to 32 by 32 gray values, a discrete cosine transform keeps the 8 by 8 lowest frequencies, and each becomes one bit against the median: a 64-bit fingerprint.',
    returns: 'The Hamming distance between the two fingerprints, 0 to 64.',
    knobs:
      'The size of the kept square (8 gives 64 bits, 16 gives 256); the limit on the distance is yours.',
    strengths:
      'Survives resizing, compression and small shifts, compares images of different sizes, fingerprints are tiny.',
    weaknesses:
      'Blind to small changes and to color; it says "same picture", not "pixel-perfect". This implementation is its own variant, not bit-identical to other libraries.',
    use: 'Near-duplicate detection and coarse "did the page change at all" checks.',
    config: 'phash',
  },
];
