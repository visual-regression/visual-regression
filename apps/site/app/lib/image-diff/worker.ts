// Everything heavy happens here: decoding, padding and every engine, so the
// page stays responsive. Messages: see ToWorker / FromWorker in types.ts.
import { engines, resemble } from './engines';
import { context2d, type Images } from './engines/shared';
import { checkSize } from './limits';
import { pad } from './pad';
import type { FromWorker, ToWorker } from './types';

const post = (message: FromWorker) => postMessage(message);

let images: Images | null = null;
let urls: string[] = [];

// `which` names the image in the error; the size is checked on the bitmap,
// before a canvas or a pixel buffer is allocated
const decode = async (blob: Blob, which: string): Promise<ImageData> => {
  const bitmap = await createImageBitmap(blob);
  try {
    checkSize(bitmap.width, bitmap.height, which);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = context2d(canvas);
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    bitmap.close();
  }
};

const encode = (image: ImageData) => {
  const canvas = new OffscreenCanvas(image.width, image.height);
  context2d(canvas).putImageData(image, 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
};

const load = async (message: Extract<ToWorker, { type: 'load' }>) => {
  for (const url of urls) URL.revokeObjectURL(url);
  // one after the other: a huge pair never has both buffers at once
  const a = await decode(message.a, 'baseline');
  const b = await decode(message.b, 'actual');
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const same = a.width === b.width && a.height === b.height;
  const pa = pad(a, width, height, message.padding);
  const pb = pad(b, width, height, message.padding);
  urls = [URL.createObjectURL(message.a), URL.createObjectURL(message.b)];
  resemble.engine.originals = { a, b, aUrl: urls[0], bUrl: urls[1] };
  images = { a: pa, b: pb, padded: !same };
  post({
    type: 'loaded',
    token: message.token,
    a: { width: a.width, height: a.height },
    b: { width: b.width, height: b.height },
    padded: same
      ? null
      : { width, height, a: await encode(pa), b: await encode(pb) },
  });
};

const run = async (message: Extract<ToWorker, { type: 'run' }>) => {
  if (!images) throw new Error('No images loaded');
  const engine = engines[message.engine];
  if (!engine) throw new Error(`Unknown engine ${message.engine}`);
  const result = await engine.run(images, message.options);
  post({
    type: 'result',
    token: message.token,
    engine: message.engine,
    result,
  });
};

// one message at a time, in order: a run never sees a half-loaded pair
let queue: Promise<void> = Promise.resolve();
addEventListener('message', (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  queue = queue
    .then(() => (message.type === 'load' ? load(message) : run(message)))
    .catch((error: unknown) =>
      post({
        type: 'error',
        token: message.token,
        engine: message.type === 'run' ? message.engine : undefined,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
});
