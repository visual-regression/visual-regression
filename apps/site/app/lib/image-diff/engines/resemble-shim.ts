// Resemble.js is written for a document: it loads images through `Image`
// and draws through `document.createElement('canvas')`. Neither exists in a
// worker. These stand-ins give it a `fetch`-backed Image and an
// OffscreenCanvas, so it runs with its real code path (including
// scaleToSameSize, which only works when it loads the images itself). The
// module is imported before resemblejs, so the globals exist when it is
// evaluated.

import { context2d } from './shared';

// Resemble treats whichever image loads first as the first one (scaleToSameSize
// scales the other to it); loading them in order keeps that deterministic
let loading: Promise<unknown> = Promise.resolve();

class WorkerImage {
  width = 0;
  height = 0;
  naturalWidth = 0;
  naturalHeight = 0;
  complete = false;
  bitmap: ImageBitmap | null = null;
  onload: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  #src = '';

  setAttribute() {}

  get src() {
    return this.#src;
  }

  set src(url: string) {
    this.#src = url;
    loading = loading
      .then(() => fetch(url))
      .then((response) => response.blob())
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => {
        this.bitmap = bitmap;
        this.width = this.naturalWidth = bitmap.width;
        this.height = this.naturalHeight = bitmap.height;
        this.complete = true;
        this.onload?.();
      })
      .catch((error) => this.onerror?.(error));
  }
}

const unwrap = (image: unknown) =>
  image instanceof WorkerImage ? image.bitmap : image;

/** the last diff Resemble painted: it only offers it as a data URL */
let lastPainted: ImageData | null = null;
export const takePainted = () => {
  const painted = lastPainted;
  lastPainted = null;
  return painted;
};

class WorkerCanvas {
  #canvas: OffscreenCanvas;
  #context: OffscreenCanvasRenderingContext2D;

  constructor() {
    this.#canvas = new OffscreenCanvas(1, 1);
    this.#context = context2d(this.#canvas);
  }

  get width() {
    return this.#canvas.width;
  }

  set width(value: number) {
    this.#canvas.width = value;
  }

  get height() {
    return this.#canvas.height;
  }

  set height(value: number) {
    this.#canvas.height = value;
  }

  getContext() {
    const context = this.#context;
    // Resemble hands its Image objects to drawImage; swap in the bitmap
    return new Proxy(context, {
      get(target, key: keyof OffscreenCanvasRenderingContext2D) {
        if (key === 'drawImage') {
          return (image: unknown, ...rest: number[]) =>
            (
              target.drawImage as (
                source: ImageBitmap,
                ...args: number[]
              ) => void
            )(unwrap(image) as ImageBitmap, ...rest);
        }
        const value = target[key];
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, key, value) {
        (target as unknown as Record<PropertyKey, unknown>)[key] = value;
        return true;
      },
    });
  }

  // called by getImageDataUrl(); keep the pixels instead of encoding them
  toDataURL() {
    lastPainted = this.#context.getImageData(
      0,
      0,
      this.#canvas.width,
      this.#canvas.height,
    );
    return '';
  }
}

const scope = self as unknown as Record<string, unknown>;
if (typeof scope.document === 'undefined') {
  scope.Image = WorkerImage;
  scope.document = { createElement: () => new WorkerCanvas() };
}
