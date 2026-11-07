import type { EngineInfo } from '../types';

export const info: EngineInfo = {
  id: 'resemble',
  name: 'Resemble.js',
  package: {
    name: 'resemblejs',
    version: '5.0.0',
    url: 'https://github.com/rsmbl/Resemble.js',
  },
  summary:
    'A pixel comparison library with tolerance presets, anti-aliasing detection and a mismatch percentage. BackstopJS builds on a Node fork of it. The images are handed to it as they are, so different sizes and scaleToSameSize behave as in the library.',
  options: [
    {
      key: 'ignore',
      label: 'ignore',
      hint: 'Preset tolerances: "less" (the library default) tolerates differences below 16 per channel, "antialiasing" below 32 and also skips pixels it detects as anti-aliased, "colors" compares brightness only, "alpha" ignores the alpha channel.',
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
    ignore: 'less',
    errorType: 'flat',
    errorColor: '#ff00ff',
    transparency: 1,
    scaleToSameSize: false,
  },
  sizeMismatch:
    'Gets the original images: lays both on the larger canvas itself (transparent fill), compares, and reports isSameDimensions: false; scaleToSameSize stretches the actual image to the baseline instead.',
};
