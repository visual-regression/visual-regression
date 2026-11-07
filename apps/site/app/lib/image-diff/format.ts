import type { EngineResult, Options } from './types';

export const integer = (n: number) => n.toLocaleString('en-US');

export const percent = (ratio: number, digits = 2) => {
  if (ratio === 0) return '0%';
  const p = ratio * 100;
  const floor = 1 / 10 ** digits;
  return p < floor ? `<${floor}%` : `${p.toFixed(digits)}%`;
};

export const millis = (ms: number) =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;

export const size = (d: { width: number; height: number } | null) =>
  d ? `${d.width}×${d.height}` : '';

/** The figure an engine leads with, what it measures, and the count behind it */
export const headline = (result: EngineResult, options: Options) => {
  const primary = result.metrics.find((m) => m.primary);
  const value =
    primary?.value ??
    percent(result.total ? result.mismatch / result.total : 0);
  const label = primary?.label ?? 'differing pixels';
  const detail =
    result.unit === 'pixels'
      ? `${integer(result.mismatch)} of ${integer(result.total)} px`
      : result.unit === 'windows'
        ? `${integer(result.mismatch)} of ${integer(result.total)} windows below ${options.dissimilar}`
        : `${result.total}-bit hash`;
  return { value, label, detail };
};
