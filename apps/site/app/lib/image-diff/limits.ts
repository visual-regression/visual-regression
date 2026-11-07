// decoding a photo-sized image is fine; a 200-megapixel one would take the tab down
export const MAX_PIXELS = 40_000_000;

/** Throws when an image of this size is too big to decode; checked before any pixel buffer exists */
export const checkSize = (width: number, height: number, which: string) => {
  if (width * height > MAX_PIXELS) {
    throw new Error(
      `The ${which} image is ${width}×${height}; this tool takes up to 40 megapixels per image.`,
    );
  }
};
