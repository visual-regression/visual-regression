import './resemble-shim';
import resemble from 'resemblejs';
import type { EngineInfo } from '../types';
import { hexToRgb, now, toPng, type Engine } from './shared';
import { takePainted } from './resemble-shim';

export const info: EngineInfo = {
  id: 'resemble',
  name: 'Resemble.js',
  package: {
    name: 'resemblejs',
    version: '5.0.0',
    url: 'https://github.com/rsmbl/Resemble.js',
  },
  summary:
    'The engine behind BackstopJS. Compares pixels with per-channel tolerances and brightness checks, can ignore anti-aliasing or colors altogether, and reports a mismatch percentage. Loads the images itself here, so different sizes and scaleToSameSize behave as in the library.',
  options: [
    {
      key: 'ignore',
      label: 'ignore',
      hint: 'Preset tolerances: "less" allows 16 values per channel, "antialiasing" also skips pixels it detects as anti-aliased, "colors" compares brightness only, "alpha" ignores the alpha channel.',
      type: 'select',
      choices: [
        { value: 'nothing', label: 'nothing' },
        { value: 'less', label: 'less' },
        { value: 'antialiasing', label: 'antialiasing' },
        { value: 'colors', label: 'colors' },
        { value: 'alpha', label: 'alpha' },
      ],
    },
    {
      key: 'errorType',
      label: 'errorType',
      hint: 'How differing pixels are painted in the output.',
      type: 'select',
      choices: [
        { value: 'flat', label: 'flat' },
        { value: 'movement', label: 'movement' },
        { value: 'flatDifferenceIntensity', label: 'flatDifferenceIntensity' },
        {
          value: 'movementDifferenceIntensity',
          label: 'movementDifferenceIntensity',
        },
        { value: 'diffOnly', label: 'diffOnly' },
      ],
    },
    { key: 'errorColor', label: 'errorColor', type: 'color' },
    {
      key: 'transparency',
      label: 'transparency',
      hint: 'Opacity of the unchanged pixels in the output (0–1).',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.05,
    },
    {
      key: 'scaleToSameSize',
      label: 'scaleToSameSize',
      hint: 'Scale the actual image to the size of the baseline before comparing.',
      type: 'boolean',
    },
  ],
  defaults: {
    ignore: 'nothing',
    errorType: 'flat',
    errorColor: '#ff00ff',
    transparency: 1,
    scaleToSameSize: false,
  },
  sizeMismatch:
    'Gets the original images: lays both on the larger canvas itself (transparent fill), compares, and reports isSameDimensions: false; scaleToSameSize stretches the actual image to the baseline instead.',
};

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
