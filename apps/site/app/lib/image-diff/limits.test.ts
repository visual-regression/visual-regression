import { describe, expect, it } from 'vitest';
import { checkSize } from './limits';

describe('checkSize', () => {
  it('accepts a large screenshot', () => {
    expect(() => checkSize(1920, 20000, 'baseline')).not.toThrow();
  });
  it('refuses more than 40 megapixels and names the image', () => {
    expect(() => checkSize(8000, 6000, 'actual')).toThrow(
      /actual image is 8000×6000/,
    );
  });
});
