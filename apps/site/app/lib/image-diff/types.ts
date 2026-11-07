// Shared between the page and the worker

/** What the page knows about one image slot after the worker decoded it */
export interface Dimensions {
  width: number;
  height: number;
}

export type Padding = 'magenta' | 'transparent';

export type OptionDef = { key: string; label: string; hint?: string } & (
  | { type: 'number'; min: number; max: number; step: number }
  | { type: 'boolean' }
  | { type: 'select'; choices: { value: string; label: string }[] }
  | { type: 'color' }
);

export type Options = Record<string, number | boolean | string>;

export interface Metric {
  label: string;
  value: string;
  /** when set, the number is rendered as the headline figure of the card */
  primary?: boolean;
}

export interface EngineResult {
  /** differing pixels (or windows, bits: see `unit`) */
  mismatch: number;
  /** out of this many */
  total: number;
  unit: 'pixels' | 'windows' | 'bits';
  elapsedMs: number;
  /** the engine's own figures, printed as is */
  metrics: Metric[];
  /** the diff image, as a PNG */
  diff: Blob | null;
  /** how to read the diff image */
  legend?: string;
  /** anything the engine had to say (ran on padded images, downsampled, ...) */
  notes: string[];
}

export interface EngineInfo {
  id: string;
  name: string;
  /** the npm package behind it, when there is one */
  package?: { name: string; version: string; url: string };
  summary: string;
  options: OptionDef[];
  defaults: Options;
  /** what the engine itself does with two images of different sizes */
  sizeMismatch: string;
}

// worker protocol
export type ToWorker =
  | { type: 'load'; token: number; a: Blob; b: Blob; padding: Padding }
  | { type: 'run'; token: number; engine: string; options: Options };

export type FromWorker =
  | {
      type: 'loaded';
      token: number;
      a: Dimensions;
      b: Dimensions;
      /** the size both images were padded to, when they differ */
      padded: (Dimensions & { a: Blob; b: Blob }) | null;
    }
  | { type: 'result'; token: number; engine: string; result: EngineResult }
  | { type: 'error'; token: number; engine?: string; message: string };
