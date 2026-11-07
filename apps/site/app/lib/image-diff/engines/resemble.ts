import './resemble-shim';
import resemble from 'resemblejs';
import { hexToRgb, now, toPng, type Engine } from './shared';
import { takePainted } from './resemble-shim';

type Inputs = { a: ImageData; b: ImageData; aUrl: string; bUrl: string };

export const engine: Engine & { originals: Inputs | null } = {
  // Resemble loads the images itself; the worker keeps the originals here
  originals: null,

  run({ a, padded }, options) {
    const scale = Boolean(options.scaleToSameSize);
    const originals = this.originals;
    if (!originals) throw new Error('No images loaded');
    const [red, green, blue] = hexToRgb(String(options.errorColor));
    const start = now();
    return new Promise((resolve, reject) => {
      // the originals, by URL: Resemble handles different sizes on its own
      resemble.compare(
        originals.aUrl,
        originals.bUrl,
        {
          ignore: String(options.ignore) as 'nothing',
          scaleToSameSize: scale,
          output: {
            errorColor: { red, green, blue },
            errorType: String(options.errorType) as 'flat',
            transparency: Number(options.transparency),
            // one pass over every pixel, like the tools using it do for screenshots
            largeImageThreshold: 0,
          },
        },
        async (error, data) => {
          if (error) return reject(new Error(String(error)));
          const elapsedMs = now() - start;
          data.getImageDataUrl();
          const painted = takePainted();
          const width = painted?.width ?? a.width;
          const height = painted?.height ?? a.height;
          const notes: string[] = [];
          if (padded && !scale) {
            notes.push(
              'Ran on the original images: Resemble.js pads the smaller one with transparent pixels itself.',
            );
          }
          if (scale && !data.isSameDimensions) {
            notes.push(
              `Scaled the ${originals.b.width}×${originals.b.height} actual image to ${originals.a.width}×${originals.a.height}.`,
            );
          }
          resolve({
            mismatch: Math.round(
              (data.rawMisMatchPercentage / 100) * width * height,
            ),
            total: width * height,
            unit: 'pixels',
            elapsedMs,
            metrics: [
              {
                label: 'misMatchPercentage',
                value: `${data.misMatchPercentage}%`,
                primary: true,
              },
              {
                label: 'rawMisMatchPercentage',
                value: data.rawMisMatchPercentage.toFixed(4),
              },
              {
                label: 'isSameDimensions',
                value: String(data.isSameDimensions),
              },
              { label: 'analysisTime', value: `${data.analysisTime} ms` },
              {
                label: 'diffBounds',
                value: `${data.diffBounds.left},${data.diffBounds.top} – ${data.diffBounds.right},${data.diffBounds.bottom}`,
              },
            ],
            diff: painted ? await toPng(painted) : null,
            legend: 'Differing pixels in the error color.',
            notes,
          });
        },
      );
    });
  },
};
