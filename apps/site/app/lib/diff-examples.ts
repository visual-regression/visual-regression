// The measurements behind the diff algorithm guide: data/diff-examples.json,
// written by scripts/make-diff-examples.mjs from the engines the image diff
// tool runs. Everything the guide quotes comes through here.
import data from '~~/data/diff-examples.json';

export interface Figures {
  mismatch: number;
  total: number;
  unit: 'pixels' | 'windows' | 'bits';
  ratio: number;
  primary?: { label: string; value: string };
  metrics: Record<string, string>;
  medianMs: number;
  notes: string[];
  diff?: string;
}
export interface Pair {
  id: string;
  title: string;
  changed: string;
  baseline: string;
  actual: string;
  baselineSize: { width: number; height: number };
  actualSize: { width: number; height: number };
  padded: { width: number; height: number } | null;
  results: Record<string, Figures>;
}
export interface Config {
  id: string;
  engine: string;
  label: string;
  options: Record<string, unknown>;
}

export const examples = data as unknown as {
  engines: Record<string, string>;
  browser: string;
  configs: Config[];
  pairs: Pair[];
};

export const pairById = (id: string) => {
  const pair = examples.pairs.find((p) => p.id === id);
  if (!pair)
    throw new Error(`No example pair ${id} in data/diff-examples.json`);
  return pair;
};

export const configById = (id: string) => {
  const config = examples.configs.find((c) => c.id === id);
  if (!config) throw new Error(`No config ${id} in data/diff-examples.json`);
  return config;
};

const percent = (ratio: number) =>
  ratio === 0
    ? '0%'
    : ratio < 0.0001
      ? '<0.01%'
      : `${(ratio * 100).toFixed(2)}%`;

/** The headline figure of one config on one pair, as the tool prints it */
export const figure = (pairId: string, configId: string) => {
  const f = pairById(pairId).results[configId];
  if (!f) throw new Error(`No result for ${configId} on ${pairId}`);
  return f.primary?.value ?? percent(f.ratio);
};

/** One field of a result, for prose: `ms`, `px`, `bits` or the headline `value` */
export const field = (pairId: string, configId: string, name: string) => {
  const f = pairById(pairId).results[configId];
  if (!f) throw new Error(`No result for ${configId} on ${pairId}`);
  if (name === 'ms') return `${f.medianMs} ms`;
  if (name === 'px') return f.mismatch.toLocaleString('en-US');
  if (name === 'ssim') return f.primary?.value ?? '';
  return figure(pairId, configId);
};

/**
 * How big the difference is on the engine's own scale, 0 to 1: the share of
 * pixels, 1 - mean SSIM, or the share of hash bits. Only used to shade cells.
 */
export const scale = (pairId: string, configId: string) => {
  const f = pairById(pairId).results[configId]!;
  if (f.unit === 'windows') return 1 - Number(f.primary?.value ?? 1);
  return f.ratio;
};

export const toolHref = (pair: Pair) =>
  `/image-diff?${new URLSearchParams({ a: pair.baseline, b: pair.actual }).toString()}`;

export const pixelSize = (s: { width: number; height: number }) =>
  `${s.width}×${s.height}`;
