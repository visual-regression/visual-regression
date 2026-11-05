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
