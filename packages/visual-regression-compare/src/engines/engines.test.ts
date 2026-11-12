import fs from 'fs';
import path from 'path';
import tmp from 'tmp-promise';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../image';
import { makePng } from '../test-utils';
import { loadEngine, pixelmatchEngine } from '.';

describe('pixelmatch engine', () => {
  it('counts differing pixels and draws a diff', async () => {
    const result = await pixelmatchEngine().compare(
      decodePng(makePng(10, 10)),
      decodePng(makePng(10, 10, undefined, 5)),
    );
    expect(result.diffPixels).toBe(5);
    expect(result.diffRatio).toBe(0.05);
    expect(result.diff).toMatchObject({ width: 10, height: 10 });
  });

  it('reports the metric and threshold it ran with', () => {
    expect(pixelmatchEngine({ threshold: 0.3 })).toMatchObject({
      name: 'pixelmatch',
      colorMetric: 'yiq',
      colorThreshold: 0.3,
    });
  });

  it('handles an empty image', async () => {
    const empty = { width: 0, height: 0, data: new Uint8ClampedArray(0) };
    expect(await pixelmatchEngine().compare(empty, empty)).toMatchObject({
      diffRatio: 0,
    });
  });
});

describe('loadEngine', () => {
  it('loads a built-in by name, passing options', async () => {
    const engine = await loadEngine('pixelmatch', { threshold: 0.5 });
    expect(engine.colorThreshold).toBe(0.5);
  });

  it('loads a module by path: an engine or a factory', async () => {
    const dir = await tmp.dir({ unsafeCleanup: true });
    fs.writeFileSync(
      path.join(dir.path, 'factory.mjs'),
      `export default (options) => ({ name: 'mine', colorMetric: 'yiq', compare: () => ({ diffPixels: options.n, diffRatio: 0 }) });`,
    );
    fs.writeFileSync(
      path.join(dir.path, 'object.mjs'),
      `export default { name: 'plain', colorMetric: 'yiq', compare: () => ({ diffPixels: 0, diffRatio: 0 }) };`,
    );
    fs.writeFileSync(path.join(dir.path, 'bad.mjs'), `export default 42;`);
    expect((await loadEngine('./factory.mjs', { n: 3 }, dir.path)).name).toBe(
      'mine',
    );
    expect((await loadEngine('./object.mjs', {}, dir.path)).name).toBe('plain');
    await expect(loadEngine('./bad.mjs', {}, dir.path)).rejects.toThrow(
      /must default-export/,
    );
    await expect(loadEngine('./missing.mjs', {}, dir.path)).rejects.toThrow(
      /Cannot load engine/,
    );
    await dir.cleanup();
  });
});
