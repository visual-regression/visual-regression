// The guide's prose says things about the measurements ("a little over half",
// "scores it better than the 1 px shift"). Regenerating the data must not make
// them false without a failing test.
import { describe, expect, it } from 'vitest';
import { examples, pairById } from './diff-examples';

const r = (pair: string, config: string) => pairById(pair).results[config]!;
const ratio = (pair: string, config: string) => r(pair, config).ratio;
const ssim = (pair: string) => Number(r(pair, 'ssim').primary!.value);
const bits = (pair: string) => r(pair, 'phash').mismatch;

describe('diff-examples.json', () => {
  it('has every pair and config the guide uses', () => {
    expect(examples.pairs.map((p) => p.id)).toEqual([
      'subpixel-text',
      'one-pixel-shift',
      'color-tint',
      'jpeg-compression',
      'added-element',
      'size-mismatch',
      'noise',
      'typo',
    ]);
    for (const p of examples.pairs)
      for (const c of examples.configs) expect(p.results[c.id]).toBeDefined();
  });

  it('anti-aliasing detection removes a little over half of the text noise, not all', () => {
    const removed =
      1 -
      ratio('subpixel-text', 'pixelmatch') /
        ratio('subpixel-text', 'pixelmatch-aa');
    expect(removed).toBeGreaterThan(0.5);
    expect(removed).toBeLessThan(0.65);
    expect(ratio('subpixel-text', 'pixelmatch')).toBeGreaterThan(0);
  });

  it('the exact comparison counts noise and compression that tolerant ones do not', () => {
    for (const pair of ['noise', 'jpeg-compression', 'subpixel-text']) {
      expect(ratio(pair, 'exact')).toBeGreaterThan(0.02);
    }
    expect(ratio('jpeg-compression', 'exact')).toBeGreaterThan(0.5);
    expect(ratio('jpeg-compression', 'pixelmatch')).toBeLessThan(0.05);
    expect(ratio('noise', 'pixelmatch')).toBe(0);
    expect(ratio('noise', 'pixelmatch-0')).toBeGreaterThan(0);
    expect(ratio('jpeg-compression', 'pixelmatch-0')).toBeGreaterThan(0.5);
    expect(ratio('jpeg-compression', 'resemble')).toBeLessThan(
      ratio('jpeg-compression', 'resemble-0'),
    );
  });

  it('a color tint is hidden by tolerance and invisible to SSIM and the hash', () => {
    expect(ratio('color-tint', 'exact')).toBeGreaterThan(0);
    expect(ratio('color-tint', 'resemble-0')).toBeGreaterThan(0);
    expect(ratio('color-tint', 'pixelmatch-0')).toBeGreaterThan(0);
    expect(ratio('color-tint', 'pixelmatch')).toBe(0);
    expect(ratio('color-tint', 'resemble')).toBe(0);
    expect(ssim('color-tint')).toBe(1);
    expect(bits('color-tint')).toBe(0);
  });

  it('a small real change is smaller than harmless noise, and SSIM ranks it better than a 1 px shift', () => {
    const typo = ratio('typo', 'pixelmatch');
    expect(typo).toBeGreaterThan(0);
    expect(typo).toBeLessThan(ratio('subpixel-text', 'pixelmatch'));
    expect(typo).toBeLessThan(ratio('jpeg-compression', 'pixelmatch'));
    expect(ssim('typo')).toBeGreaterThan(ssim('one-pixel-shift'));
    expect(bits('typo')).toBe(0);
  });

  it('a 1 px shift scores about as low as the added element and is counted by every pixel algorithm', () => {
    expect(
      Math.abs(ssim('one-pixel-shift') - ssim('added-element')),
    ).toBeLessThan(0.01);
    expect(ratio('one-pixel-shift', 'pixelmatch')).toBeGreaterThan(0.01);
    expect(ratio('one-pixel-shift', 'resemble')).toBeGreaterThan(0.01);
  });

  it('the hash ignores noise, JPEG and color, and sees large structure', () => {
    for (const pair of ['noise', 'jpeg-compression', 'color-tint'])
      expect(bits(pair)).toBe(0);
    expect(bits('added-element')).toBeGreaterThan(0);
    expect(bits('size-mismatch')).toBeGreaterThan(0);
    expect(ratio('noise', 'pixelmatch')).toBe(0);
    expect(ssim('noise')).toBeGreaterThan(0.999);
  });

  it('pads sizes that differ, and only those', () => {
    expect(pairById('size-mismatch').padded).not.toBeNull();
    expect(pairById('typo').padded).toBeNull();
  });

  it('Resemble.js and SSIM are several times slower than the pixel loops and the hash', () => {
    const ms = (c: string) => r('typo', c).medianMs;
    for (const slow of ['resemble', 'ssim'])
      for (const fast of ['exact', 'pixelmatch', 'phash'])
        expect(ms(slow)).toBeGreaterThan(ms(fast) * 2);
  });
});
