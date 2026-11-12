import fs from 'fs';
import path from 'path';
import tmp from 'tmp-promise';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorkerPool } from './pool';
import { makePng } from './test-utils';

let dir: tmp.DirectoryResult;
let workerFile: string;
beforeEach(async () => {
  dir = await tmp.dir({ unsafeCleanup: true });
  const esbuild = await import('esbuild');
  // inside the package, so the bundled worker finds pixelmatch and pngjs
  const workerDir = fs.mkdtempSync(
    new URL('../node_modules/.pool-', import.meta.url).pathname,
  );
  workerFile = path.join(workerDir, 'worker.mjs');
  await esbuild.build({
    entryPoints: [new URL('./worker.ts', import.meta.url).pathname],
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    outfile: workerFile,
    logLevel: 'silent',
  });
});
afterEach(async () => {
  await dir.cleanup();
  fs.rmSync(path.dirname(workerFile), { recursive: true });
});

const job = (engineId = 'pixelmatch', cwd?: string) => ({
  baseline: makePng(4, 4),
  actual: makePng(4, 4, undefined, 2),
  onSizeMismatch: 'fail' as const,
  engine: { id: engineId, cwd },
});

describe('createWorkerPool', () => {
  it('runs jobs in this thread when it has one slot or no worker file', async () => {
    for (const pool of [
      createWorkerPool(1, workerFile),
      createWorkerPool(4, undefined),
    ]) {
      expect(pool.threaded).toBe(false);
      expect(await pool.run(job())).toMatchObject({
        kind: 'compared',
        diffPixels: 2,
      });
      await pool.close();
    }
  });

  it('spreads jobs over worker threads', async () => {
    const pool = createWorkerPool(2, workerFile);
    expect(pool.threaded).toBe(true);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => pool.run(job())),
    );
    expect(results.every((r) => r.kind === 'compared')).toBe(true);
    await pool.close();
  });

  it('rejects a job whose engine cannot be loaded and keeps working', async () => {
    const pool = createWorkerPool(2, workerFile);
    await expect(pool.run(job('./missing.mjs', dir.path))).rejects.toThrow(
      /Cannot load engine/,
    );
    expect(await pool.run(job())).toMatchObject({ kind: 'compared' });
    await pool.close();
  });

  it('rejects the job of a worker that exits and replaces the worker', async () => {
    fs.writeFileSync(
      path.join(dir.path, 'exits.mjs'),
      `export default { name: 'exits', colorMetric: 'yiq', compare: () => process.exit(3) };`,
    );
    const pool = createWorkerPool(2, workerFile);
    await expect(pool.run(job('./exits.mjs', dir.path))).rejects.toThrow(
      /exited with code 3/,
    );
    expect(await pool.run(job())).toMatchObject({ kind: 'compared' });
    await pool.close();
  });

  it('rejects jobs still running when it is closed', async () => {
    fs.writeFileSync(
      path.join(dir.path, 'hangs.mjs'),
      `export default { name: 'hangs', colorMetric: 'yiq', compare: () => new Promise(() => {}) };`,
    );
    const pool = createWorkerPool(2, workerFile);
    const hanging = pool.run(job('./hangs.mjs', dir.path));
    await new Promise((resolve) => setTimeout(resolve, 200));
    const closed = expect(hanging).rejects.toThrow(/closed/);
    await pool.close();
    await closed;
  });
});
